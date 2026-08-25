#!/bin/bash
# Oh My CloudLink — 一键安装到「应用程序」文件夹
set -e

APP_NAME="oh-my-cloudlink.app"
DISPLAY_NAME="Oh My CloudLink"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE=""

# 优先从 release 目录找
if [ -d "$ROOT/release/mac-arm64/$APP_NAME" ]; then
  SOURCE="$ROOT/release/mac-arm64/$APP_NAME"
elif [ -d "$SCRIPT_DIR/../release/mac-arm64/$APP_NAME" ]; then
  SOURCE="$SCRIPT_DIR/../release/mac-arm64/$APP_NAME"
elif [ -d "$SCRIPT_DIR/mac-arm64/$APP_NAME" ]; then
  SOURCE="$SCRIPT_DIR/mac-arm64/$APP_NAME"
else
  echo "❌ 未找到 $APP_NAME，请先运行 bun run package"
  exit 1
fi

TARGET="/Applications/$APP_NAME"

echo "📦 正在安装 $DISPLAY_NAME ..."
echo "   来源: $SOURCE"
echo "   目标: $TARGET"

# 若已存在则先删除
if [ -d "$TARGET" ]; then
  echo "   移除旧版本..."
  rm -rf "$TARGET"
fi

cp -R "$SOURCE" "$TARGET"

# 清除隔离属性（未签名应用必须）
xattr -cr "$TARGET" 2>/dev/null || true

echo ""
echo "✅ 安装完成！"
echo "   在启动台或「应用程序」中找到「$DISPLAY_NAME」即可使用。"
echo "   若提示无法打开，请右键 → 打开。"
