#!/usr/bin/env bash
# Publish release assets (macOS / Windows / Linux / …) + source archives to GitHub Releases.
# Uploads whatever matching binaries exist under release/ for this version — e.g. .dmg .zip .exe .AppImage.
# Prerequisites: gh auth login (repo scope)
#
# Usage:
#   ./scripts/publish-release.sh           # version from package.json
#   ./scripts/publish-release.sh 0.4.0     # explicit version
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="${1:-$(node -p "require('./package.json').version")}"
TAG="v${VERSION}"
RELEASE_DIR="release"
PREFIX="OhMyCloudLink-${VERSION}"
SRC_ZIP="${RELEASE_DIR}/${PREFIX}-source.zip"
SRC_TGZ="${RELEASE_DIR}/${PREFIX}-source.tar.gz"
NOTES="$(mktemp)"
CHANGELOG_SECTION="$(mktemp)"

cleanup() { rm -f "$NOTES" "$CHANGELOG_SECTION"; }
trap cleanup EXIT

mkdir -p "$RELEASE_DIR"

# Collect packaged binaries for this version (skip builder junk / source archives).
# artifactName: OhMyCloudLink-${version}-${arch}.${ext}
collect_binaries() {
  local f base
  shopt -s nullglob
  for f in \
    "${RELEASE_DIR}/${PREFIX}-"*.dmg \
    "${RELEASE_DIR}/${PREFIX}-"*.zip \
    "${RELEASE_DIR}/${PREFIX}-"*.exe \
    "${RELEASE_DIR}/${PREFIX}-"*.msi \
    "${RELEASE_DIR}/${PREFIX}-"*.AppImage \
    "${RELEASE_DIR}/${PREFIX}-"*.deb \
    "${RELEASE_DIR}/${PREFIX}-"*.rpm
  do
    [[ -f "$f" ]] || continue
    base="$(basename "$f")"
    # Skip source archives we (re)generate below
    case "$base" in
      *-source.zip|*-source.tar.gz) continue ;;
    esac
    # Skip electron-builder sidecars if ever matched
    case "$base" in
      *.blockmap|*.yml|*.yaml) continue ;;
    esac
    printf '%s\n' "$f"
  done
  shopt -u nullglob
}

BINARIES=()
while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  BINARIES+=("$line")
done < <(collect_binaries | sort -u)

if [[ ${#BINARIES[@]} -eq 0 ]]; then
  echo "No release binaries found for ${PREFIX}-* under ${RELEASE_DIR}/"
  echo "Expected examples:"
  echo "  ${RELEASE_DIR}/${PREFIX}-arm64.dmg / .zip"
  echo "  ${RELEASE_DIR}/${PREFIX}-x64.exe"
  echo "  ${RELEASE_DIR}/${PREFIX}-x64.AppImage"
  echo "Build first, e.g. bun run package / electron-builder --win --mac"
  exit 1
fi

echo "→ Packaging source archives..."
git archive --format=zip --prefix="oh-my-cloudlink-${VERSION}/" -o "$SRC_ZIP" HEAD
git archive --format=tar.gz --prefix="oh-my-cloudlink-${VERSION}/" -o "$SRC_TGZ" HEAD

# Extract current version section from CHANGELOG.md for release notes
if [[ -f CHANGELOG.md ]]; then
  awk '
    /^## \[/ { if (found) exit; if ($0 ~ "\\['"${VERSION}"'\\]") found=1; next }
    found && /^## \[/ { exit }
    found { print }
  ' CHANGELOG.md > "$CHANGELOG_SECTION" || true
fi

asset_row_desc() {
  local name="$1"
  case "$name" in
    *-source.zip) echo "源代码 zip" ;;
    *-source.tar.gz) echo "源代码 tar.gz" ;;
    *.dmg) echo "macOS 安装镜像" ;;
    *.zip) echo "macOS 应用包" ;;
    *.exe) echo "Windows 安装包 (NSIS)" ;;
    *.msi) echo "Windows 安装包 (MSI)" ;;
    *.AppImage) echo "Linux AppImage" ;;
    *.deb) echo "Linux deb" ;;
    *.rpm) echo "Linux rpm" ;;
    *) echo "发布产物" ;;
  esac
}

has_mac=0
has_win=0
has_linux=0
for f in "${BINARIES[@]}"; do
  case "$(basename "$f")" in
    *.dmg|*.zip) has_mac=1 ;;
    *.exe|*.msi) has_win=1 ;;
    *.AppImage|*.deb|*.rpm) has_linux=1 ;;
  esac
done

{
  echo "## Oh My CloudLink ${TAG}"
  echo
  if [[ -s "$CHANGELOG_SECTION" ]]; then
    cat "$CHANGELOG_SECTION"
  else
    echo "详见仓库 [CHANGELOG.md](CHANGELOG.md)。"
  fi
  echo

  if [[ "$has_mac" -eq 1 ]]; then
    echo "### 安装（macOS）"
    echo "1. 下载 \`${PREFIX}-*.dmg\` 或 \`.zip\`"
    echo "2. 将 \`oh-my-cloudlink.app\` 拖入「应用程序」"
    echo "3. 若提示无法打开：系统设置 → 隐私与安全性 → 仍要打开"
    echo
  fi

  if [[ "$has_win" -eq 1 ]]; then
    echo "### 安装（Windows）"
    echo "1. 下载 \`${PREFIX}-*.exe\` 并运行安装程序"
    echo "2. 若 SmartScreen 拦截：更多信息 → 仍要运行"
    echo
  fi

  if [[ "$has_linux" -eq 1 ]]; then
    echo "### 安装（Linux）"
    echo "1. 下载 AppImage / deb / rpm 后按发行版习惯安装或赋予执行权限运行"
    echo
  fi

  echo "### 下载说明"
  echo "| 文件 | 说明 |"
  echo "|------|------|"
  for f in "${BINARIES[@]}"; do
    name="$(basename "$f")"
    echo "| ${name} | $(asset_row_desc "$name") |"
  done
  echo "| $(basename "$SRC_ZIP") | $(asset_row_desc "$(basename "$SRC_ZIP")") |"
  echo "| $(basename "$SRC_TGZ") | $(asset_row_desc "$(basename "$SRC_TGZ")") |"
} > "$NOTES"

ASSETS=("${BINARIES[@]}" "$SRC_ZIP" "$SRC_TGZ")

echo "→ Assets to upload:"
printf '  - %s\n' "${ASSETS[@]}"

gh auth status

if gh release view "$TAG" >/dev/null 2>&1; then
  echo "Release $TAG already exists — uploading/replacing assets..."
  gh release upload "$TAG" "${ASSETS[@]}" --clobber
  gh release edit "$TAG" --title "Oh My CloudLink ${TAG}" --notes-file "$NOTES"
else
  echo "Creating release $TAG..."
  gh release create "$TAG" "${ASSETS[@]}" \
    --title "Oh My CloudLink ${TAG}" \
    --notes-file "$NOTES"
fi

echo ""
echo "Release published:"
gh release view "$TAG"
