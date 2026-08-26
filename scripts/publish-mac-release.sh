#!/usr/bin/env bash
# Publish Mac release assets + source archive to GitHub Releases.
# Prerequisites: gh auth login (repo scope)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="${1:-$(node -p "require('./package.json').version")}"
TAG="v${VERSION}"
ZIP="release/OhMyCloudLink-${VERSION}-arm64.zip"
DMG="release/OhMyCloudLink-${VERSION}-arm64.dmg"
SRC_ZIP="release/OhMyCloudLink-${VERSION}-source.zip"
SRC_TGZ="release/OhMyCloudLink-${VERSION}-source.tar.gz"
NOTES="$(mktemp)"
CHANGELOG_SECTION="$(mktemp)"

cleanup() { rm -f "$NOTES" "$CHANGELOG_SECTION"; }
trap cleanup EXIT

if [[ ! -f "$ZIP" ]]; then
  echo "Missing $ZIP — run: bun run package"
  exit 1
fi

echo "→ Packaging source archives..."
mkdir -p release
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

{
  echo "## Oh My CloudLink ${TAG}"
  echo
  if [[ -s "$CHANGELOG_SECTION" ]]; then
    cat "$CHANGELOG_SECTION"
  else
    echo "详见仓库 [CHANGELOG.md](CHANGELOG.md)。"
  fi
  echo
  echo "### 安装（Mac）"
  echo "1. 下载 \`OhMyCloudLink-${VERSION}-arm64.dmg\` 或 \`.zip\`"
  echo "2. 将 \`oh-my-cloudlink.app\` 拖入「应用程序」"
  echo "3. 若提示无法打开：系统设置 → 隐私与安全性 → 仍要打开"
  echo
  echo "### 下载说明"
  echo "| 文件 | 说明 |"
  echo "|------|------|"
  echo "| OhMyCloudLink-${VERSION}-arm64.dmg | macOS 安装镜像 |"
  echo "| OhMyCloudLink-${VERSION}-arm64.zip | macOS 应用包 |"
  echo "| OhMyCloudLink-${VERSION}-source.zip | 源代码 zip |"
  echo "| OhMyCloudLink-${VERSION}-source.tar.gz | 源代码 tar.gz |"
} > "$NOTES"

ASSETS=("$ZIP" "$SRC_ZIP" "$SRC_TGZ")
if [[ -f "$DMG" ]]; then
  ASSETS+=("$DMG")
fi

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
