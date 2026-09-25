-- finder_ql.applescript —— 打开 / 关闭「访达 + 快速查看」（2026-09-25 Claude Code）
-- osascript finder_ql.applescript open <目录> <文件名>：新开访达窗口（列表视图、收起侧边栏——侧边栏会露出用户名）、选中文件、按空格
-- osascript finder_ql.applescript close <目录名>：关快速查看、关窗口
-- 只在访达确实在最前时才发按键（否则会打进别的程序），不在最前就放弃
on run argv
  set action to item 1 of argv
  if action is "open" then
    set dirPath to item 2 of argv
    set fileName to item 3 of argv
    tell application "Finder"
      activate
      set d to (POSIX file dirPath) as alias
      set w to make new Finder window to d
      set current view of w to list view
      set sidebar width of w to 0
      set bounds of w to {160, 120, 820, 600}
      select file fileName of d
    end tell
    delay 1.5
    return my pressSpace(name of (info for d), fileName, d)
  else
    set dirName to item 2 of argv
    my pressSpace("", "", missing value)
    delay 0.5
    tell application "Finder"
      repeat with i from (count of Finder windows) to 1 by -1
        try
          if name of (Finder window i) is dirName then close (Finder window i)
        end try
      end repeat
    end tell
    return "closed"
  end if
end run

on pressSpace(dirName, fileName, d)
  -- 最多试 5 次：访达在最前，且（打开时）访达最前面的窗口就是演示窗口、选中的是目标文件——否则放弃，不发按键
  -- （用户同时在用访达时，别的窗口可能排在前面，空格会预览到用户自己的文件）
  repeat 5 times
    tell application "Finder"
      activate
      if dirName is not "" then
        repeat with i from 1 to (count of Finder windows)
          if name of (Finder window i) is dirName then set index of (Finder window i) to 1
        end repeat
        select file fileName of d
      end if
    end tell
    delay 0.5
    tell application "System Events" to set frontApp to name of first application process whose frontmost is true
    tell application "Finder" to set frontWin to name of Finder window 1
    if frontApp is "Finder" and (dirName is "" or frontWin is dirName) then
      tell application "System Events" to key code 49
      return "ok"
    end if
  end repeat
  return "SKIP: frontmost " & frontApp & " / " & frontWin
end pressSpace
