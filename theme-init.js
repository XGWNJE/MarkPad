/**
 * 主题初始化（经典脚本，必须在模块之前执行）
 *
 * 这里不用 ES Module：模块是 deferred 的，要等 HTML 解析完才跑，
 * 深色模式用户会先看到一帧亮色。经典脚本在 <head> 里同步执行，
 * 能在首次绘制前把 data-theme 写到 <html> 上，
 * 所以 index.html 里它排在 css/main.css 前面。
 *
 * 只有浅色和深色两种模式：localStorage 里没有记录时按系统深浅色给一个初值，
 * 用户在设置里选过之后就一直按选择走。
 */
(function setInitialTheme() {
  var STORAGE_KEY = 'themeMode';
  var stored = null;

  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }

  var mode = stored === 'light' || stored === 'dark'
    ? stored
    : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  document.documentElement.dataset.theme = mode;
})();
