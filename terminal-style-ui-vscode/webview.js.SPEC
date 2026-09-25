# SPEC: webview.js —— 预览页脚本（运行在 VSCode Webview 内）
# 2026-09-25 Claude Code：测算列数（面板宽 ÷ 1ch）→ ready / resize；接收 render / error 填充 <pre>、切换 dark / light 并回执；
# 整行滚动（行格 = 页顶 + 底边对齐位置；滚轮累积满一行才走一行、方向键 / 翻页按行、scrollend 吸附）；联动：scrollToRow
# 静默滚到该行（按落点识别防回环），用户滚动回报 scrolled，双击回报 reveal；⌘+滚轮 / 捏合缩放就地生效并防抖回报 zoomTo，
# font 消息应用字号并显示提示；自绘选区（每行一个整行高、对齐字符格的块，垫在文字下）；setState 保存滚动位置。
# 测试钩子：testScroll / testWheel / testSelect / testSelectRange。消息协议的另一端：extension.js 的 bindWebview。
