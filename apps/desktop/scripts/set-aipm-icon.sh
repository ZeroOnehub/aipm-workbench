#!/usr/bin/env bash
# Shijie: replace the desktop and in-app icons with the same artwork.
#
#   apps/desktop/scripts/set-aipm-icon.sh <logo.png> [--no-mask]
#
# Writes apps/desktop/resources/aipm-icon.png (1024 px) and aipm.icns. The next
# desktop launch rebuilds the local app bundle with the new icon. Use --no-mask
# when the logo already has its own transparent rounded shape.
set -euo pipefail

[ $# -ge 1 ] || { sed -n '4,8p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
input="$1"; shift
[ -f "$input" ] || { echo "找不到图片：$input" >&2; exit 1; }

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
resources="$here/../resources"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if [ "${1:-}" = "--no-mask" ]; then
  sips -z 1024 1024 "$input" --out "$work/icon-1024.png" >/dev/null
else
  swift "$here/aipm-icon.swift" "$input" "$work/icon-1024.png" "$@"
fi

iconset="$work/aipm.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$work/icon-1024.png" --out "$iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$work/icon-1024.png" --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$resources/aipm.icns"
cp "$work/icon-1024.png" "$resources/aipm-icon.png"

sips -z 256 256 "$work/icon-1024.png" --out "$work/brand-256.png" >/dev/null
brand="$here/../../../packages/client/aipm-workbench/src/client/brand-image.ts"
{
  printf '/** Generated from the desktop icon by apps/desktop/scripts/set-aipm-icon.sh. */\n'
  printf "export const brandImage = 'data:image/png;base64,"
  base64 < "$work/brand-256.png" | tr -d '\n'
  printf "'\n"
} > "$brand"

{
  printf '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><image width="256" height="256" href="data:image/png;base64,'
  base64 < "$work/brand-256.png" | tr -d '\n'
  printf '"/></svg>\n'
} > "$here/../../web/public/favicon.svg"
cp "$here/../../web/public/favicon.svg" "$here/../../web/public/favicon-dark.svg"
cp "$work/brand-256.png" "$here/../renderer/assets/shijie-logo.png"

echo "已更新：$resources/aipm.icns 和 aipm-icon.png"
echo "已同步应用内标志：$brand"
echo "下一步：pnpm run build，然后 pnpm run start:desktop 重新启动拾阶。"
echo "程序坞图标没变的话，运行 killall Dock 刷新图标缓存。"
