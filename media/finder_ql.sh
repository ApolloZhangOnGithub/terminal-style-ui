#!/bin/zsh
# finder_ql.sh —— 拍「访达 + 快速查看」的真实界面：./finder_ql.sh <演示目录> <文件名> <输出.png> <dark|light>
# 深色时临时切系统外观，拍完恢复。需要辅助功能权限（System Events 发空格）；目录用真实路径（/tmp 是软链，访达会当成替身）
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DIR="$1"; FILE="$2"; OUT="$3"; THEME="$4"
BIN="${COMPOSE_BIN:?需要 COMPOSE_BIN（compose.swift 编译结果）}"
export FINDER_DIR_NAME="$(basename "$DIR")"
WAS_DARK=$(osascript -e 'tell application "System Events" to tell appearance preferences to get dark mode')
restore() {
  osascript "$HERE/finder_ql.applescript" close "$(basename "$DIR")" >/dev/null 2>&1 || true
  osascript -e "tell application \"System Events\" to tell appearance preferences to set dark mode to $WAS_DARK" >/dev/null
}
trap restore EXIT
osascript -e "tell application \"System Events\" to tell appearance preferences to set dark mode to $([[ $THEME == dark ]] && echo true || echo false)" >/dev/null
sleep 1.5
r=$(osascript "$HERE/finder_ql.applescript" open "$DIR" "$FILE")
[[ "$r" == ok ]] || { echo "没打开快速查看：$r"; exit 1; }
sleep 3.5
read FID PID <<< "$("$BIN" "$OUT" "$THEME" find)"
screencapture -x -o -l "$FID" "$OUT.finder.png"
screencapture -x -o -l "$PID" "$OUT.panel.png"
"$BIN" "$OUT" "$THEME" "$OUT.finder.png" "$OUT.panel.png"
