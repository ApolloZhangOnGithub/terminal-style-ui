// highlight-themes.js —— 代码高亮配色（cli-highlight theme）
// dark = MONOKAI（与 TUI interactive-mode.js 逐键一致：STORAGE_KEYWORDS 声明类关键字青色 rgb(102,217,239)，
// 其余关键字粉 rgb(249,38,114)）。
// light= 同一套 token→色相映射，按白底加深。TUI 的 light 仍用 MONOKAI 原色，
// 其中变量/属性为纯白、标点为近白，白底上不可见——这里不照搬。
// 用法：makeHighlightTheme(chalk, "dark"|"light") → cli-highlight theme 对象。

const STORAGE_KEYWORDS = new Set([
  "const", "let", "var", "function", "class", "type", "interface",
  "enum", "namespace", "module", "def", "fn", "func", "struct",
  "trait", "impl",
]);

// 调色板：dark 为 MONOKAI 原值；light 保持色相、压暗到白底可读
const DARK_PALETTE = {
  cyan: [102, 217, 239], pink: [249, 38, 114], green: [166, 226, 46], purple: [190, 132, 255],
  yellow: [230, 219, 116], orange: [253, 151, 31], comment: [117, 113, 94], white: [255, 255, 255], fg: [248, 248, 242],
};
const LIGHT_PALETTE = {
  cyan: [0, 134, 179], pink: [215, 0, 95], green: [80, 130, 0], purple: [125, 60, 200],
  yellow: [160, 120, 0], orange: [200, 100, 0], comment: [140, 135, 115], white: [26, 26, 26], fg: [26, 26, 26],
};

const MONOKAI = (chalk, palette) => {
  const c = (name) => chalk.rgb(...palette[name]);
  return {
    keyword: (text) => (STORAGE_KEYWORDS.has(text.trim()) ? c("cyan")(text) : c("pink")(text)),
    built_in: c("green"),
    type: c("green"),
    literal: c("purple"),
    number: c("purple"),
    string: c("yellow"),
    title: c("green"),
    function: c("green"),
    params: c("orange"),
    comment: c("comment"),
    doctag: c("comment"),
    meta: c("comment"),
    attr: c("green"),
    attribute: c("green"),
    variable: c("white"),
    property: c("white"),
    operator: c("pink"),
    punctuation: c("fg"),
    symbol: c("purple"),
    regexp: c("yellow"),
    subst: c("fg"),
    "template-variable": c("fg"),
    name: c("pink"),
    tag: c("fg"),
    addition: c("green"),
    deletion: c("pink"),
    section: c("green"),
    bullet: c("purple"),
    emphasis: chalk.italic,
    strong: chalk.bold,
    link: c("cyan").underline,
    quote: c("comment"),
    "selector-tag": c("pink"),
    "selector-id": c("green"),
    "selector-class": c("green"),
    "selector-attr": c("green"),
    "selector-pseudo": c("green"),
    "template-tag": c("pink"),
    "meta-keyword": c("pink"),
    "meta-string": c("yellow"),
    default: (text) => text,
  };
};

export function makeHighlightTheme(chalk, theme = "dark") {
  return MONOKAI(chalk, theme === "light" ? LIGHT_PALETTE : DARK_PALETTE);
}

export const HIGHLIGHT_LANGS = new Set([
  "js", "javascript", "ts", "typescript", "bash", "sh", "shell", "zsh",
  "json", "python", "py", "html", "xml", "css", "markdown", "md", "yaml", "yml",
  "java", "c", "cpp", "go", "rust", "sql", "diff", "ini", "toml", "graphql", "dockerfile",
]);
