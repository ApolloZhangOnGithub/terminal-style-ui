#!/usr/bin/env python3
# tmd_capture.py —— 抓 tmd 交互界面的一屏：python3 tmd_capture.py <demo.md> <out.ans> [dark|light]
# 伪终端里跑 tmd（全屏），输入一条消息和 /tmd demo.md，用 pyte 记下带颜色的屏幕，转回 ANSI（pages.mjs 再画成终端窗口）。
# 依赖 pyte（PYTHONPATH 里）；会话写到临时目录，不进 ~/.tmd
import os, pty, sys, time, select, struct, fcntl, termios, tempfile
import pyte

COLS, ROWS = 88, 30
demo, out = sys.argv[1], sys.argv[2]
theme = sys.argv[3] if len(sys.argv) > 3 else "dark"
screen = pyte.Screen(COLS, ROWS)
stream = pyte.ByteStream(screen)
pid, fd = pty.fork()
if pid == 0:
    os.chdir(os.path.dirname(os.path.abspath(demo)))
    os.environ.update(TERM="xterm-256color", TMD_HOME=tempfile.mkdtemp(), COLORTERM="truecolor", TMD_THEME=theme)
    os.execvp("tmd", ["tmd"])
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", ROWS, COLS, 0, 0))

def pump(t):
    end = time.time() + t
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.05)
        if r:
            try:
                stream.feed(os.read(fd, 65536))
            except OSError:
                return

pump(4.5)
for text in ["帮我看一下这份说明", f"/tmd {os.path.basename(demo)}"]:
    os.write(fd, text.encode())
    pump(0.6)
    os.write(fd, b"\r")
    pump(1.2)
os.write(fd, b"\x1b[<65;10;10M" * 0)  # 不滚动：新 Print 段开头停在顶上

NAMED = {"black": "000000", "red": "cd3131", "green": "0dbc79", "yellow": "e5e510", "blue": "2472c8", "magenta": "bc3fbc", "cyan": "11a8cd", "white": "e5e5e5",
         "brightblack": "666666", "brightred": "f14c4c", "brightgreen": "23d18b", "brightyellow": "f5f543", "brightblue": "3b8eea", "brightmagenta": "d670d6", "brightcyan": "29b8db", "brightwhite": "ffffff"}
def color(c):
    if c == "default":
        return None
    c = NAMED.get(c, c)
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)) if len(c) == 6 else None

lines = []
for y in range(ROWS):
    row, line, state = screen.buffer[y], "", None
    for x in range(COLS):
        ch = row[x]
        if ch.data == "":  # 宽字符的后半格
            continue
        fg, bg = color(ch.fg), color(ch.bg)
        if ch.reverse:
            fg, bg = bg or (0, 0, 0), fg or (229, 229, 229)
        st = (fg, bg, ch.bold, ch.italics, ch.underscore)
        if st != state:
            sgr = ["0"]
            if fg: sgr.append("38;2;%d;%d;%d" % fg)
            if bg: sgr.append("48;2;%d;%d;%d" % bg)
            if ch.bold: sgr.append("1")
            if ch.italics: sgr.append("3")
            if ch.underscore: sgr.append("4")
            line += "\x1b[" + ";".join(sgr) + "m"
            state = st
        line += ch.data
    lines.append(line.rstrip() + "\x1b[0m")
open(out, "w").write("\n".join(lines))
os.write(fd, b"\x03"); pump(0.3); os.write(fd, b"\x03"); pump(1)
