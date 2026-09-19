/**
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
