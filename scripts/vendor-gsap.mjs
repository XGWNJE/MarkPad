/**
 * 把 gsap 官方发行版内置到 vendor/。
 *
 * 用法：npm run vendor:gsap
 * 产物：
 *   vendor/gsap.min.js  UMD 发行版（带版本与来源标注）
 *   vendor/gsap.js      ESM 取用层，转出 window.gsap
 *
 * 注意：gsap.min.js 是 UMD，包了一层 `(t = t || self).window = t.window || {}`，
 * 而模块作用域是严格模式，这句给只读的 window.window 赋值会直接抛错，
 * 所以 vendor/gsap.min.js 只能由 index.html 的经典 <script> 加载（非严格模式），
 * 模块侧统一 import vendor/gsap.js 取用。
 *
 * 扩展本身没有构建步骤，gsap 只作为 devDependency 存在，
 * 运行态加载的是这里生成的 vendor 文件，不要在 vendor/ 里手改。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = resolve(root, 'node_modules/gsap/dist/gsap.min.js');
const pkgPath = resolve(root, 'node_modules/gsap/package.json');
const outDir = resolve(root, 'vendor');

const { version } = JSON.parse(await readFile(pkgPath, 'utf8'));
const bundle = await readFile(bundlePath, 'utf8');

const banner = `/*! gsap ${version} | vendored from node_modules/gsap/dist/gsap.min.js
 *  License: https://gsap.com/standard-license
 *  Regenerate: npm run vendor:gsap
 */
`;

const wrapper = `/**
 * gsap 的 ESM 取用层。
 *
 * vendor/gsap.min.js 是 UMD，末尾给只读的 window.window 赋值，
 * 在严格模式的模块作用域里会抛 TypeError，因此它必须由 index.html 的
 * 经典 <script src="vendor/gsap.min.js"></script> 先加载（非严格模式），
 * 再从这里把 window.gsap 转成模块导出。
 *
 * 由 scripts/vendor-gsap.mjs 生成，不要手改。
 */
const gsap = globalThis.gsap;

if (!gsap) {
  throw new Error('gsap 未加载：请确认 index.html 里在使用模块前引入了 vendor/gsap.min.js。');
}

export { gsap };
export default gsap;
`;

await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, 'gsap.min.js'), banner + bundle, 'utf8');
await writeFile(resolve(outDir, 'gsap.js'), wrapper, 'utf8');

console.log(`vendored gsap ${version} -> vendor/gsap.min.js + vendor/gsap.js`);
