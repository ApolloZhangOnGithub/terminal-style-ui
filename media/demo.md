# Terminal Style UI

在终端里读文档，**和 Claude Code 一个味道**：粗体、*斜体*、`行内代码`、[链接](https://example.com)，中文与 English 混排对齐。

## 表格

| 渲染位置 | 形态 | 状态 |
|---|---|---|
| 终端 tmd | 全屏交互界面 | ✅ 可用 |
| VSCode | 侧边实时预览 | ✅ 可用 |
| 访达空格 | Quick Look 扩展 | ✅ 可用 |

## 代码

```python
def render(path: str, width: int = 100) -> str:
    """任意文件 → 终端风格的渲染结果"""
    kind = detect(path)          # 看内容判断，后缀只是参考
    return pipeline(kind, width)
```

> 引用块折行时，左边的竖线会一路连下去，不会在换行处断开——终端里什么样，这里就什么样。

- 序号 ①②③ 按两格排版，表格边框不歪
- 代码行号是灰色的，不画竖线；长行折行后续行对齐代码
