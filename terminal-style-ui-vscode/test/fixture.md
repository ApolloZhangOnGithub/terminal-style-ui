# 一级标题 Heading

## 二级标题

普通段落，含 **粗体**、*斜体*、`行内码` 和 [链接文字](https://example.com/doc)，以及裸链接 https://bare.example.com 。

A long paragraph to exercise wrapping at different widths: the renderer should reflow this text to the panel width exactly like a terminal window would, keeping every CJK character in a two-cell slot — 中文与 English 混排也要对齐。

| 名称 | 状态 | 说明 |
|---|:---:|---:|
| copy | 已修 | 剪贴板 |
| render | 进行中 | 表格含中文与 English mixed |

```js
// 注释
const answer = 42;
function greet(name) { return `hi ${name}`; }
const { spawn } = require('node:child_process');   // ←① 本文件是 ESM（顶层 import + import.meta.main）→ require 未定义 → 抛错
```

```python
def f(x: int) -> int:
    return x * 2  # double
```

- 无序一
- 无序二
  - 嵌套项

1. 有序一
2. 有序二

> 引用块：第一行
> 第二行

---

### 三级标题

结尾段落。
