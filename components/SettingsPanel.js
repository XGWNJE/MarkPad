import EventBus from '../core/EventBus.js';

const CARD_FONT_FAMILIES = Object.freeze({
  system: '"Segoe UI Variable", "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif',
  pingfang: '"PingFang SC", "Hiragino Sans GB", system-ui, sans-serif',
  yahei: '"Microsoft YaHei UI", "Microsoft YaHei", sans-serif',
  noto: '"Noto Sans SC", "Source Han Sans SC", sans-serif',
  serif: '"Noto Serif SC", "Songti SC", serif'
});

/**
 * SettingsPanel - 设置菜单里的主题、书签卡片与顶部栏外观偏好
 *
 * 主题只有浅色和深色两种，实际配色由 variables.css 的
 * `:root[data-theme="dark"]` 令牌控制，这里只负责切换和记忆选择。
 * 页面使用静态主题底色，设置只同步现有偏好。
 */
class SettingsPanel {
  constructor() {
    this.themeKey = 'themeMode';
    this.headerOpacityKey = 'headerOpacity';
    this.cardSizeKey = 'cardSize';
    this.cardRadiusKey = 'cardRadius';
    this.cardFontFamilyKey = 'cardFontFamily';
    this.cardTitleSizeKey = 'cardTitleSize';
    this.cardTitleTrackingKey = 'cardTitleTracking';
    this.gridPageMarginKey = 'gridPageMargin';
    this.cardGapKey = 'cardGap';
    this.openModeKey = 'openMode';
    this.cardSizeMin = 80;
    this.cardSizeMax = 200;
    this.cardSizeStep = 20;

    // theme-init.js 已在首次绘制前写好 data-theme，这里只同步界面状态
    this.currentTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    this.currentHeaderOpacity = this.readPercent(this.headerOpacityKey, 94, 55, 100);
    this.currentCardSize = this.readNumber(this.cardSizeKey, 120, this.cardSizeMin, this.cardSizeMax);
    this.currentCardRadius = this.readNumber(this.cardRadiusKey, 18, 0, 999);
    this.currentCardFontFamily = this.readChoice(this.cardFontFamilyKey, 'system', CARD_FONT_FAMILIES);
    this.currentCardTitleSize = this.readNumber(this.cardTitleSizeKey, 16, 14, 20);
    this.currentCardTitleTracking = this.readNumber(this.cardTitleTrackingKey, 1, -2, 8);
    this.currentGridPageMargin = this.readNumber(this.gridPageMarginKey, 24, 12, 160);
    this.currentCardGap = this.readNumber(this.cardGapKey, 28, 8, 64);
    this.currentOpenMode = this.readChoice(this.openModeKey, 'new', { new: true, current: true });

    this.init();
  }

  init() {
    const themeGroup = document.getElementById('theme-group');
    if (!themeGroup) return;

    this.applyTheme(this.currentTheme);
    this.applyTransparency();
    this.bindPanelControls();
    this.bindThemeControls(themeGroup);
    this.bindOpenModeControls();
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

  readChoice(key, fallback, choices) {
    const value = localStorage.getItem(key);
    return value && Object.hasOwn(choices, value) ? value : fallback;
  }

  // ========== 设置分页 ==========

  bindPanelControls() {
    document.getElementById('settings-close')?.addEventListener('click', () => {
      EventBus.emit('settings:close');
    });

    const tablist = document.getElementById('settings-tabs');
    if (!tablist) return;
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const panes = new Map(tabs.map(tab => [tab, document.getElementById(tab.getAttribute('aria-controls'))]));
    if (!tabs.length || [...panes.values()].some(pane => !pane)) return;
    const content = document.getElementById('settings-content');
    let activeTab = null;
    const activate = (tab, focus = false) => {
      if (tab !== activeTab && content) content.scrollTop = 0;
      activeTab = tab;
      for (const item of tabs) {
        const selected = item === tab;
        item.setAttribute('aria-selected', String(selected));
        item.tabIndex = selected ? 0 : -1;
        panes.get(item).hidden = !selected;
      }
      if (focus) tab.focus({ preventScroll: true });
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activate(tab, true));
      tab.addEventListener('keydown', event => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else return;
        event.preventDefault();
        event.stopPropagation();
        activate(tabs[next], true);
      });
    });
    activate(tabs.find(tab => tab.getAttribute('aria-selected') === 'true') || tabs[0]);
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
    for (const value of ['light', 'dark']) {
      const button = document.getElementById(`theme-${value}`);
      button?.classList.toggle('active', mode === value);
      button?.setAttribute('aria-pressed', String(mode === value));
    }
  }

  // ========== 打开方式 ==========

  bindOpenModeControls() {
    this.applyOpenMode(this.currentOpenMode);
    document.getElementById('open-mode-group')?.addEventListener('click', event => {
      const button = event.target.closest('.menu-toggle-btn');
      const mode = button?.dataset.value;
      if (mode !== 'new' && mode !== 'current') return;
      this.currentOpenMode = mode;
      localStorage.setItem(this.openModeKey, mode);
      this.applyOpenMode(mode);
    });
  }

  applyOpenMode(mode) {
    for (const value of ['new', 'current']) {
      const button = document.getElementById(`open-mode-${value}`);
      button?.classList.toggle('active', mode === value);
      button?.setAttribute('aria-pressed', String(mode === value));
    }
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
    const radiusInput = document.getElementById('card-radius');
    const radiusValue = document.getElementById('card-radius-value');

    const syncSize = () => {
      if (!sizeInput || !sizeValue) return;
      sizeInput.value = String(this.currentCardSize);
      sizeValue.textContent = `${this.currentCardSize}px`;
    };

    sizeInput?.addEventListener('input', () => {
      this.setCardSize(Number(sizeInput.value));
    });

    radiusInput?.addEventListener('input', () => this.setCardRadius(Number(radiusInput.value)));
    const marginInput = document.getElementById('grid-page-margin');
    const marginValue = document.getElementById('grid-page-margin-value');
    if (marginInput && marginValue) {
      marginInput.value = String(this.currentGridPageMargin);
      marginValue.textContent = `${this.currentGridPageMargin}px`;
      marginInput.addEventListener('input', () => this.setGridPageMargin(Number(marginInput.value)));
    }
    const gapInput = document.getElementById('card-gap');
    const gapValue = document.getElementById('card-gap-value');
    if (gapInput && gapValue) {
      gapInput.value = String(this.currentCardGap);
      gapValue.textContent = `${this.currentCardGap}px`;
      gapInput.addEventListener('input', () => this.setCardGap(Number(gapInput.value)));
    }
    this.bindCardTypographyControls();

    EventBus.on('settings:adjustCardSize', (direction) => {
      this.setCardSize(this.currentCardSize + direction * this.cardSizeStep);
      syncSize();
    });

    syncSize();
    this.syncCardRadiusControl(radiusInput, radiusValue);
  }

  bindCardTypographyControls() {
    const family = document.getElementById('card-font-family');
    const size = document.getElementById('card-title-size');
    const sizeValue = document.getElementById('card-title-size-value');
    const tracking = document.getElementById('card-title-tracking');
    const trackingValue = document.getElementById('card-title-tracking-value');

    if (family) {
      family.value = this.currentCardFontFamily;
      family.addEventListener('change', () => {
        this.currentCardFontFamily = Object.hasOwn(CARD_FONT_FAMILIES, family.value) ? family.value : 'system';
        localStorage.setItem(this.cardFontFamilyKey, this.currentCardFontFamily);
        this.applyCardTypography();
      });
    }
    this.bindTypographyRange({ input: size, value: sizeValue, current: () => this.currentCardTitleSize, set: next => { this.currentCardTitleSize = next; }, storageKey: this.cardTitleSizeKey, format: next => `${next}px` });
    this.bindTypographyRange({ input: tracking, value: trackingValue, current: () => this.currentCardTitleTracking, set: next => { this.currentCardTitleTracking = next; }, storageKey: this.cardTitleTrackingKey, format: next => `${(next / 100).toFixed(2)}em` });
  }

  bindTypographyRange({ input, value, current, set, storageKey, format }) {
    if (!input || !value) return;
    const sync = next => { input.value = String(next); value.textContent = format(next); };
    sync(current());
    input.addEventListener('input', () => {
      const next = Number(input.value);
      set(next);
      localStorage.setItem(storageKey, String(next));
      sync(next);
      this.applyCardTypography();
    });
  }

  setCardSize(size) {
    this.currentCardSize = Math.min(this.cardSizeMax, Math.max(this.cardSizeMin, size));
    localStorage.setItem(this.cardSizeKey, String(this.currentCardSize));
    document.documentElement.style.setProperty('--card-size', `${this.currentCardSize}px`);
    const value = document.getElementById('card-size-value');
    if (value) value.textContent = `${this.currentCardSize}px`;
    this.syncCardRadiusControl();
    this.applyCardRadius();
  }

  getCardRadiusLimit() {
    const card = document.querySelector('.bookmark-card');
    const side = card?.getBoundingClientRect().width || Math.min(320, Math.max(116, this.currentCardSize * 1.45));
    return Math.max(0, Math.floor(side / 2));
  }

  syncCardRadiusControl(input = document.getElementById('card-radius'), value = document.getElementById('card-radius-value')) {
    const limit = this.getCardRadiusLimit();
    this.currentCardRadius = Math.min(limit, this.currentCardRadius);
    localStorage.setItem(this.cardRadiusKey, String(this.currentCardRadius));
    if (input) { input.max = String(limit); input.value = String(this.currentCardRadius); }
    if (value) value.textContent = `${this.currentCardRadius}px`;
  }

  setCardRadius(radius) {
    this.currentCardRadius = Math.min(this.getCardRadiusLimit(), Math.max(0, Math.round(radius)));
    localStorage.setItem(this.cardRadiusKey, String(this.currentCardRadius));
    this.syncCardRadiusControl();
    this.applyCardRadius();
  }

  setGridPageMargin(margin) {
    this.currentGridPageMargin = Math.min(160, Math.max(12, Math.round(margin / 4) * 4));
    localStorage.setItem(this.gridPageMarginKey, String(this.currentGridPageMargin));
    document.documentElement.style.setProperty('--grid-page-margin', `${this.currentGridPageMargin}px`);
    const value = document.getElementById('grid-page-margin-value');
    if (value) value.textContent = `${this.currentGridPageMargin}px`;
  }

  setCardGap(gap) {
    this.currentCardGap = Math.min(64, Math.max(8, Math.round(gap / 4) * 4));
    localStorage.setItem(this.cardGapKey, String(this.currentCardGap));
    document.documentElement.style.setProperty('--card-gap', `${this.currentCardGap}px`);
    const value = document.getElementById('card-gap-value');
    if (value) value.textContent = `${this.currentCardGap}px`;
  }

  applyCardRadius() {
    document.documentElement.style.setProperty('--card-radius', `${this.currentCardRadius}px`);
  }

  applyCardPreferences() {
    this.setCardSize(this.currentCardSize);
    this.currentCardRadius = Math.min(this.getCardRadiusLimit(), this.currentCardRadius);
    this.applyCardRadius();
    this.setGridPageMargin(this.currentGridPageMargin);
    this.setCardGap(this.currentCardGap);
    this.applyCardTypography();
  }

  applyCardTypography() {
    const root = document.documentElement;
    root.style.setProperty('--font-family', CARD_FONT_FAMILIES[this.currentCardFontFamily]);
    root.style.setProperty('--card-title-size', `${this.currentCardTitleSize}px`);
    root.style.setProperty('--card-meta-size', `${Math.max(11, this.currentCardTitleSize - 4)}px`);
    root.style.setProperty('--card-title-tracking', `${(this.currentCardTitleTracking / 100).toFixed(2)}em`);
  }
}

export default SettingsPanel;
