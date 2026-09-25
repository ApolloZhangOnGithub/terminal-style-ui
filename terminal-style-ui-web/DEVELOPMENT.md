# DEVELOPMENT —— Terminal-Style-UI-Web 开发全记录

> 作者：dev-01（genshin-v0.3.2-dev-01）｜时间：2026-09-13 深夜 ~ 09-14 凌晨｜驱动：房东的需求与多轮方向纠正

## 一、需求是怎么演进的

1. 起点需求："开发一个支持渲染和 TUI 内一模一样的东西，复制过去之后渲染出来一模一样一个 block 的，尤其是消息，类似 JupyterLab，这样我可以复制过去写笔记，而不变成恶心的传统 markdown。"
2. 第一轮理解偏差：做成了「复制 HTML 到别的 app」（rich-clipboard 双 flavor 剪贴板）——被否，删除方向。
3. 第二轮理解偏差：做成了「marked + CSS 模拟 TUI 配色」的网页——被否："和 TUI 半毛钱关系没有"。
4. 第三轮：引入 WebTUI 库——被否："你渲染的是 webtui 风格，和我们的 TUI 没有任何关系"。
5. 方向纠正（关键）：**"不要 HTML 复刻，运行一个 micro terminal 模拟器用来渲染，只渲染不能操作"**——转向 xterm.js。
6. 最终定稿：**后端用 TUI 同款渲染管线（pi-tui Markdown override 版）产出 ANSI，前端渲染**。中途从 xterm canvas 进一步演进为 **DOM 渲染**（Safari 的 DOM 文本走 CoreText，笔画细，与 iTerm 一致；canvas 偏粗且 WebGL 在 Safari 兼容差）。

## 二、最终架构

```
Markdown 源文本
  ↓ 清洗（剥模型幻觉 XML 标签 + 独立 --- 分隔线——与 TUI assistant-message 同源）
  ↓ pi-tui Markdown 组件（定制版：标题无下划线/无黄、代码块无```围栏+行号 gutter）
  ↓ ANSI 转义序列（真彩 38;2;RGB + 粗体/斜体/dim）
  ↓ ansiToHtml（分词 → SGR 状态机 → 样式段 <span>；OSC 剥离；字素按 pi-tui 宽度进 1ch/2ch 格子；制表符 → CSS 四臂画线）
  ↓ DOM <pre class="terminal-style-ui">（Safari DOM 文本 = CoreText 细笔画）
```

关键模块：
- `ansi-to-html.js`：分词解析 + SGR 状态机 + OSC 剥离 + 格子渲染（宽度与 pi-tui 同源；表格行整格模式）+ 制表符 CSS 四臂画线 + 背景线下划线
- `highlight-themes.js`：cli-highlight 配色（dark=MONOKAI；STORAGE_KEYWORDS 声明类关键字青色、其余粉——集合抄错过一次，此为权威版；light=同色相按白底加深）
- `index.js`：组装管线（FORCE_COLOR=3 / COLORTERM 必须在 chalk、pi-tui 探测前；终端能力固定；可选块级源码映射）

## 三、视觉参数定稿（与 iTerm 逐项对齐）

| 项 | 值 | 依据 |
|---|---|---|
| 字体 | Monaco, PingFang SC 回退 | 房东本机 iTerm 配置（defaults read com.googlecode.iterm2） |
| 字号 | 13px | 房东用 A+/A− 实测定稿（iTerm 名义 12pt，Mac pt≈px 1:1） |
| 背景 | #000000 纯黑 | iTerm Dark Background |
| 前景 | #c7c7c7 灰白 | iTerm 前景（TUI 不覆盖终端前景——普通文本的实际观感色） |
| 粗体 | 亮白 #ffffff + bold | iTerm bold-brighten 行为（仅 dark；light 下白字不可见故跳过） |
| 行距 | 1.3em 取整到像素（13px 下 17px = 原 Monaco normal） | 房东确认"前一个是对的"；2026-09-25 改显式值（坑 12），观感不变 |
| 代码高亮 | cli-highlight + 定制 MONOKAI（dark） | 与 TUI 的 highlightCode 同源 |
| light | 白底 #ffffff / 字 #1a1a1a；高亮同色相按白底加深 | TUI light 的 OSC 10/11 配色；TUI 的 MONOKAI 变量为纯白，白底不可见，不照搬 |

## 四、踩坑全记录（每一条都烧了时间）

1. **CDN 404**：marked 的 jsdelivr 路径写错 → 整页渲染空白。修：全部依赖本地化进 vendor/。
2. **convertEol**：pi-tui 输出只有 \n，xterm 的 convertEol:false 时光标不回行首 → 每行阶梯状递进缩进。修：convertEol:true。
3. **pt/px**：Mac 的 pt 与 CSS px 是 1:1（Retina 只是物理像素密度）——错乘 1.333 导致字巨大。
4. **letter-spacing**：会同时加宽 ─ 表格横线字符之间的缝 → 横线断裂。弃用，改 word-spacing（只加宽空格）。
5. **word-spacing**：会加宽表格对齐用的空格 → 列错位。最终移除（表格对齐优先）。
6. **bold-brighten**：iTerm 对 SGR 1（粗体）且无显式色时提亮纯白——模拟时必须只在 dark 生效，light 下白字不可见。
7. **WebGL on Safari**：xterm 的 WebGL 渲染器在 Safari 兼容差（渲染循环卡死）→ 弃用 xterm，自写 DOM 渲染。
8. **合并渲染版吞字**：SGR 状态机 + buf 拼接的版本存在吞字 bug（span 第一个字符丢失）——**永久弃用，span-cell 逐字符版是无吞字验证版**。
   - 2026-09-25 更正（做 VSCode 插件时截图发现现行 ansi-to-html.js 仍吞字）：真因不是 buf 合并，而是 CSI 分支 `i = j + 1; continue;` 与 for 循环的 `i++` 双重自增——吞掉每个转义序列后的第一个字符；若被吞的是下一个序列的 ESC，该序列残文（如 `[38;2;…m`）会原样露出。已改为 `i = j`。回归检查：HTML 去标签后的可见文字必须等于 ANSI 去转义后的可见文字（box-drawing 直线段除外）。
9. **pi-tui 表格转角**：pi-tui 用专门符号"假装"转角，CSS 化转角反而错位——转角保持字形渲染，只有直线段 ─│══ 用 CSS 画。
10. **Em 与 ch 混用**：格子宽度单位必须统一（ch = 字体真实 advance）——em 与 ch 混用产生累积错位。
11. **非终端进程的能力探测**（2026-09-25 做 VSCode 插件时发现）：pi-tui 按 TERM_PROGRAM/COLORTERM 等环境变量探测终端能力并缓存首次结果——在 iTerm 里跑一切正常；换到 GUI 进程（VSCode 扩展进程、launchd 等）被判为未知终端 → 主题色退回 256 色（38;5;N，ansiToHtml 只认 38;2 真彩，颜色丢失）、链接改印 "文字 (url)"。且 theme.js 引用的是 pi-coding-agent 内嵌的**另一份** pi-tui 实例。修：模块顶部设 COLORTERM=truecolor（管内嵌实例的首次探测）+ 顶层实例 setCapabilities 固定真彩/OSC 8。
12. **表格接头错位、竖线跨行断开**（2026-09-25，同时是「引用块换行后竖线断」的根因）：三个原因叠加——① 转角/三通用字体字形、直线段用 CSS，两套画法粗细与位置对不上；② `line-height: normal` 下含中文（PingFang）的行比纯 ASCII 行高 1px，行距参差，1.5em 高的画线格子只能靠溢出去盖缝；③ ASCII 文字按字形浮点宽度排版、格子按 1/64px 取整，表格行里补齐用的空格多，右边框累积偏出半像素。修：制表符全部按「上右下左」四臂用 CSS 画（同 iTerm 自绘制表符，所有线过格子中心）；行高改显式并取整（`round(nearest, 1.3em, 1px)`，格子高 `1lh` 顶对齐）；≥2 个制表符的行走整格模式（每个字素进 1ch 格子、宽字素补空格子）。实测表格各行左右边框 x 偏差 0.0000px。
13. **格宽与排版不同源**（2026-09-25）：内置 charWidth 只认 CJK 码段，emoji / ①② 算 1 格，而 pi-tui 按 2 格排版 → 含 emoji 的表格行右边框错位。修：ansiToHtml 按字素簇切分，宽度函数由调用方传入（renderTerminalHtml 传 pi-tui 的 visibleWidth）。回归检查：每行格宽之和 = visibleWidth(该行)。
14. **中文下划线一字一断**（2026-09-25）：text-decoration 画不进 inline-block 格子，中文每字只在字形宽度下画一段。修：同样式内容包进一个 span，下划线画在它的背景上（覆盖段内格子，中英文同高连续）。
15. **源码映射与清洗**（2026-09-25，给 VSCode 预览的滚动联动用）：pi-tui 的 render 逐个顶层 token 调 renderToken（列表 / 引用的子 token 会递归进来，只记最外层），token.raw 在原文里定位即得「源码行 → 渲染行」。两个坑：marked 内部把 CRLF 归一成 LF（raw 里没有 \r，直接 indexOf 找不到）；空行 token 的 raw 从上一行行尾的 \n 起（要归到下一行）。原清洗把独立 --- 连同前面的空行整段删掉、开头 trim 掉的空行也不计，行号会错位——改为 --- 行清空、记录开头偏移；新旧清洗输出逐字节一致已验证。
16. **代码块长行折行后行号栏断开**（2026-09-25，用户截图）：定制版 pi-tui 的代码块渲染自己折行，但续行只用空格缩进到行号栏宽度、不画 │。修：包一层 renderToken，把续行开头那段等宽空格换成「空格 + │ 」（宽度不变，排版与源码映射不受影响；只改本库输出，TUI 不动）。第一版补上的竖线继承了上一行未关闭的颜色（折在注释里就是暗色，看起来像变细）——续行开头先 SGR 复位，续行内容自己会重新开颜色。
17. **复制表格丢边框**（2026-09-25）：制表符格子原是空 span，复制只剩文字。改为格子里放同一个制表符、字形透明（-webkit-text-fill-color，线条仍取 currentColor），加 class `ttu-box` 供前端在选中时保持透明。
18. **Safari 里粗体多的表格行错位**（2026-09-25，用户截图）：Monaco 在 Mac 上没有粗体字面，浏览器合成粗体。WebKit 合成粗体会把字宽加 0.36px（实测 7.801 → 8.162），`1ch` 也跟着变宽；Chromium 不改字宽（所以 VSCode 里看不出）。格子直接写 `width:1ch` 时粗体格子更宽，一行粗体越多右边框越往右（实测表格各行右边框偏差 24.8px）。修：terminal.css 用 `@property` 注册 `--ttu-cell`（<length>，可继承），在 `<pre>` 上按常规字重算好 `1ch` 以绝对长度继承，格子宽写 `var(--ttu-cell,1ch)`。修后 WebKit / Chromium 偏差均为 0。
19. **tmd 交互界面的两个坑**（2026-09-25）：① 输入框首行在 ❯ 后补空格时超出一列，pi-tui 普通屏直接抛 "Rendered line exceeds terminal width" 崩进程（pi-tui 已知问题）——只替换不添加，超宽就用原行；崩溃日志默认覆盖写 宿主 agent 目录下的 pi-crash.log，改写到 $TMPDIR/tmd。② 快速输入 `/tmd hard.md` 回车变成 `Print(hard.tmd)`：pi-tui Editor 的补全是异步的，按键攒成一批同步处理时中间的补全请求全被取消，列表和前缀停在 `/t`，回车把旧补全套到新文字上（"/tmd hard." + "tmd"）。修：记下列表对应的文字与光标，回车 / Tab 时对不上就先丢弃列表。上游 pi-tui 的输入框同一实现，同样有此竞态。
20. **打包进 JavaScriptCore（Quick Look）**（2026-09-25）：沙盒扩展里没有 Node，渲染核心拆成 core.js、esbuild 打成 IIFE。逐个踩到：纯 JSContext 没有 TextEncoder / URL / global；Node 内置模块替身最初用 Proxy，esbuild 转 CommonJS 时只复制实际存在的属性，具名导入全是 undefined；config.js 装载时就读 package.json；theme.js 的裸 "chalk" 解析到另一份，浏览器版等级 0，粗体全丢；process.env 没有 COLORTERM，主题退回 256 色（ansiToHtml 只认真彩）。修完后与 Node 版逐字节一致。
21. **Quick Look 选不中扩展**（2026-09-25）：扩展声明宽泛类型（public.source-code / public.data）不生效——代码文件被系统文本预览抢走，动态类型（.WIKI、.go）根本不给第三方。改为声明具体 UTI + App 登记自己的类型（见 terminal-style-ui-quicklook/gen_types.py）。另：Quick Look 会缓存失败的预览，调试时换文件名或 qlmanage -r cache；NSLog 内容在统一日志里是 <private>，要用 os.Logger 标 .public。
22. **代码块行号栏改版**（2026-09-25，用户定稿）：从「行号 │ 代码」（坑 16 为此补过续行竖线）改为 Claude Code 的 Write 样式——灰色行号 + 一个空格、不画竖线。纯代码文件还去掉左右边距、行号贴左。画竖线的旧实现注释保留在 core.js（patchCodeGutterBar）。

## 五、尚未解决（见 LIMITATIONS.md）

- ~~表格边框竖线在 DOM 渲染下的最后 1px 级连续性~~——2026-09-25 已解决（坑 12）。
- ~~light 主题复用 dark 的 MONOKAI 高亮配色~~——2026-09-25 已做 light 配色（同色相按白底加深）。
- 其余见 LIMITATIONS.md。
