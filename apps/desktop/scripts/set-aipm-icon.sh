#!/usr/bin/env bash
# AIPM 工坊: replace the app icon with a generated logo.
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

swift "$here/aipm-icon.swift" "$input" "$work/icon-1024.png" "$@"

iconset="$work/aipm.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$work/icon-1024.png" --out "$iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$work/icon-1024.png" --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$resources/aipm.icns"
cp "$work/icon-1024.png" "$resources/aipm-icon.png"

echo "已更新：$resources/aipm.icns 和 aipm-icon.png"
echo "下一步：重新启动工坊（pnpm run start:desktop，或在源码目录 pnpm run build 后打开 App）。"
echo "程序坞图标没变的话，运行 killall Dock 刷新图标缓存。"
