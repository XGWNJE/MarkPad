import { renderIcons } from './core/IconLibrary.js';
renderIcons(document);
document.getElementById('help-back').addEventListener('click', (event) => {
  if (document.referrer.startsWith(location.origin) && history.length > 1) {
    event.preventDefault();
    history.back();
  }
});
