#!/usr/bin/env python3
"""Terminal Style UI —— 任意文件的终端风格预览（演示用代码）"""
from dataclasses import dataclass


@dataclass
class Preview:
    path: str
    width: int = 100
    theme: str = "dark"  # 跟随系统：dark / light

    def render(self) -> str:
        kind = detect(self.path)  # 内容说了算，后缀只是证据之一
        if kind == "markdown":
            return render_markdown(self.path, self.width)
        return render_code(self.path, self.width, gutter="dim")


if __name__ == "__main__":
    print(Preview("README.md").render())
