#!/usr/bin/env bash
# Publish Mac release assets to GitHub Releases.
# Prerequisites: gh auth login (repo scope)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="${1:-$(node -p "require('./package.json').version")}"
TAG="v${VERSION}"
ZIP="release/YunLian-SSH-${VERSION}-arm64.zip"
DMG="release/YunLian-SSH-${VERSION}-arm64.dmg"
NOTES="$(mktemp)"

cleanup() { rm -f "$NOTES"; }
trap cleanup EXIT

if [[ ! -f "$ZIP" ]]; then
  echo "Missing $ZIP — run: npm run build && npx electron-builder --mac zip --publish never"
  exit 1
fi

cat > "$NOTES" <<EOF
## Oh My CloudLink ${TAG} (Mac)

类 Termius 的 SSH / SFTP 桌面客户端。

### 安装
1. 下载 \`YunLian-SSH-${VERSION}-arm64.zip\`
2. 解压后将 \`oh-my-cloudlink.app\` 拖到「应用程序」
3. 若提示无法打开：系统设置 → 隐私与安全性 → 仍要打开

### 本版本主要能力
- 主机 / 分组 / SSH 密钥管理
- SSH 多标签终端
- SFTP 双栏文件管理（支持目录拖拽、传输进度与速度/ETA）
- 本地数据 SQLite 存储（\`~/Library/Application Support/oh-my-cloudlink/\`）

### 产物
| 文件 | 说明 |
|------|------|
| YunLian-SSH-${VERSION}-arm64.zip | macOS Apple Silicon 应用包 |
EOF

ASSETS=("$ZIP")
if [[ -f "$DMG" ]]; then
  ASSETS+=("$DMG")
fi

gh auth status

if gh release view "$TAG" >/dev/null 2>&1; then
  echo "Release $TAG already exists — uploading/replacing assets..."
  gh release upload "$TAG" "${ASSETS[@]}" --clobber
else
  echo "Creating release $TAG..."
  gh release create "$TAG" "${ASSETS[@]}" \
    --title "Oh My CloudLink ${TAG}" \
    --notes-file "$NOTES"
fi

gh release view "$TAG" --web || gh release view "$TAG"
