import EventBus from '../core/EventBus.js';

/**
 * SettingsPanel - 设置菜单里的主题、书签卡片与顶部栏外观偏好
 *
 * 主题只有浅色和深色两种，实际配色由 variables.css 的
 * `:root[data-theme="dark"]` 令牌控制，这里只负责切换和记忆选择。
 * 壁纸、壁纸亮度/模糊、自定义图片上传已整体移除。
 */
class SettingsPanel {
  constructor() {
    this.themeKey = 'themeMode';
    this.headerOpacityKey = 'headerOpacity';
    this.cardSizeKey = 'cardSize';
    this.cardBackgroundStrengthKey = 'cardBackgroundStrength';
    this.cardSizeMin = 80;
    this.cardSizeMax = 200;
    this.cardSizeStep = 20;

    // theme-init.js 已在首次绘制前写好 data-theme，这里只同步界面状态
    this.currentTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    this.currentHeaderOpacity = this.readPercent(this.headerOpacityKey, 94, 55, 100);
    this.currentCardSize = this.readNumber(this.cardSizeKey, 120, this.cardSizeMin, this.cardSizeMax);
    this.currentCardBackgroundStrength = this.readPercent(this.cardBackgroundStrengthKey, 100, 40, 100);

    this.init();
  }

  init() {
    const themeGroup = document.getElementById('theme-group');
    if (!themeGroup) return;

    this.applyTheme(this.currentTheme);
    this.applyTransparency();
    this.bindThemeControls(themeGroup);
    this.bindTransparencyControls();
    this.bindCardControls();
    this.applyCardPreferences();
  }

  readPercent(key, fallback, min, max) {
    const value = Number(localStorage.getItem(key) || fallback);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  }

  readNumber(key, fallback, min, max) {
    const value = Number(localStorage.getItem(key) || fallback);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  }

  // ========== 主题 ==========

  bindThemeControls(group) {
    group.addEventListener('click', (event) => {
      const button = event.target.closest('.menu-toggle-btn');
      if (!button) return;
      this.setTheme(button.dataset.value);
    });
  }

  /** @param {'light'|'dark'} mode */
  setTheme(mode) {
    if (mode !== 'light' && mode !== 'dark') return;
    this.currentTheme = mode;
    localStorage.setItem(this.themeKey, mode);
    this.applyTheme(mode);
  }

  applyTheme(mode) {
    document.documentElement.dataset.theme = mode;
    document.getElementById('theme-light')?.classList.toggle('active', mode === 'light');
    document.getElementById('theme-dark')?.classList.toggle('active', mode === 'dark');
  }

  // ========== 顶部栏与卡片 ==========

  applyTransparency() {
    document.documentElement.style.setProperty('--toolbar-opacity', `${this.currentHeaderOpacity}%`);
    document.documentElement.style.setProperty('--toolbar-alpha', this.toAlpha(this.currentHeaderOpacity));
  }

  toAlpha(percent) {
    return (percent / 100).toFixed(2);
  }

  bindTransparencyControls() {
    this.bindPercentControl({
      input: document.getElementById('header-opacity'),
      value: document.getElementById('header-opacity-value'),
      storageKey: this.headerOpacityKey,
      getCurrent: () => this.currentHeaderOpacity,
      setCurrent: (next) => { this.currentHeaderOpacity = next; }
    });
  }

  bindPercentControl({ input, value, storageKey, getCurrent, setCurrent, apply = () => this.applyTransparency() }) {
    if (!input || !value) return;

    const sync = (next) => {
      input.value = String(next);
      value.textContent = `${next}%`;
    };

    sync(getCurrent());
    input.addEventListener('input', () => {
      const next = Number(input.value);
      setCurrent(next);
      localStorage.setItem(storageKey, String(next));
      sync(next);
      apply();
    });
  }

  bindCardControls() {
    const sizeInput = document.getElementById('card-size');
    const sizeValue = document.getElementById('card-size-value');

    this.bindPercentControl({
      input: document.getElementById('card-background-strength'),
      value: document.getElementById('card-background-strength-value'),
      storageKey: this.cardBackgroundStrengthKey,
      getCurrent: () => this.currentCardBackgroundStrength,
      setCurrent: (next) => {
        this.currentCardBackgroundStrength = next;
      },
      apply: () => this.applyCardPreferences()
    });

    const syncSize = () => {
      if (!sizeInput || !sizeValue) return;
      sizeInput.value = String(this.currentCardSize);
      sizeValue.textContent = `${this.currentCardSize}px`;
    };

    sizeInput?.addEventListener('input', () => {
      this.setCardSize(Number(sizeInput.value));
    });

    EventBus.on('settings:adjustCardSize', (direction) => {
      this.setCardSize(this.currentCardSize + direction * this.cardSizeStep);
      syncSize();
    });

    syncSize();
  }

  setCardSize(size) {
    this.currentCardSize = Math.min(this.cardSizeMax, Math.max(this.cardSizeMin, size));
    localStorage.setItem(this.cardSizeKey, String(this.currentCardSize));
    document.documentElement.style.setProperty('--card-size', `${this.currentCardSize}px`);
    const value = document.getElementById('card-size-value');
    if (value) value.textContent = `${this.currentCardSize}px`;
  }

  applyCardPreferences() {
    this.setCardSize(this.currentCardSize);
    document.documentElement.style.setProperty('--card-background-strength', `${this.currentCardBackgroundStrength}%`);
  }
}

export default SettingsPanel;
