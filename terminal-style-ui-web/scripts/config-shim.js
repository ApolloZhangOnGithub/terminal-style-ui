// config-shim.js —— 打包时替换上游 config.js：theme.js 只从它取主题目录。
// 内置主题随包放在 dist/themes/（build.mjs 从 vendor/themes/ 拷入）；自定义主题目录不用
import { fileURLToPath } from "node:url";
export const getThemesDir = () => fileURLToPath(new URL("./themes", import.meta.url));
export const getCustomThemesDir = () => fileURLToPath(new URL("./themes/custom", import.meta.url));
