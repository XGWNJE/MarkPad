import EventBus from '../core/EventBus.js';
import BookmarkStore from '../core/BookmarkStore.js';
import { iconSvg } from '../core/IconLibrary.js';
import { getLibraryIconCandidates } from '../core/icons/IconLibraryProvider.js';
import { createCustomIconRecord, isValidHexColor, readIconUpload } from '../core/icons/IconUploadProcessor.js';
import { analyzeIconBackground } from '../core/icons/IconBackgroundAnalyzer.js';
import { backgroundCssValue, cloneIconBackground, iconTextColor } from '../core/icons/IconBackground.js';
import { isSvgRaw } from '../core/icons/IconSanitizer.js';

function hsvToHex(hue, saturation, value) {
  const chroma = value * saturation;
  const segment = (hue / 60) % 6;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const [r, g, b] = [[chroma, x, 0], [x, chroma, 0], [0, chroma, x], [0, x, chroma], [x, 0, chroma], [chroma, 0, x]][Math.floor(segment)] || [0, 0, 0];
  const offset = value - chroma;
  return `#${[r + offset, g + offset, b + offset].map(channel => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`;
}

function hexToHsv(hex) {
  const [r, g, b] = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === r) hue = 60 * (((g - b) / delta + 6) % 6);
    if (max === g) hue = 60 * ((b - r) / delta + 2);
    if (max === b) hue = 60 * ((r - g) / delta + 4);
  }
  return { hue, saturation: max ? delta / max : 0, value: max };
}

class IconStudio {
  constructor() {
    this.dialog = null; this.bookmark = null; this.selectedIcon = null; this.upload = null; this.siteIcon = null;
    this.mode = 'custom'; this.background = { mode: 'raw' }; this.customColor = '#ffffff'; this.customEditing = false; this.colorState = hexToHsv(this.customColor);
    this.init();
  }

  init() {
    this.createDialog();
    EventBus.on('iconStudio:open', ({ bookmark }) => this.show(bookmark));
    EventBus.on('iconStudio:openSiteBackground', ({ bookmark }) => this.showSiteBackground(bookmark));
  }

  createDialog() {
    this.dialog = document.createElement('div'); this.dialog.id = 'icon-studio'; this.dialog.className = 'dialog icon-studio hidden';
    this.dialog.innerHTML = `
      <div class="dialog-overlay"></div><div class="dialog-content icon-studio-content">
        <div class="dialog-header"><div><h3>图标</h3><div class="icon-studio-subtitle"></div></div><button class="dialog-close" data-action="close" aria-label="关闭">${iconSvg('x')}</button></div>
        <div class="icon-studio-body">
          <section class="icon-studio-section icon-library-section"><div class="icon-studio-label">内置图标</div><div class="icon-studio-local-context"></div><div class="icon-studio-results"></div></section>
          <section class="icon-studio-section icon-upload-section"><label class="icon-studio-label" for="icon-upload-input">上传图片</label><p class="icon-studio-help">支持 SVG、PNG/APNG、GIF、JPG、WebP；动画保持原始播放，位图原始尺寸至少 256 × 256。</p><input id="icon-upload-input" class="icon-upload-input" type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp,image/gif"></section>
          <section class="icon-background-composer hidden"><div class="icon-studio-label">图标背景</div><p class="icon-studio-help icon-background-source"></p>
            <div class="icon-background-modes" role="radiogroup" aria-label="图标背景模式"><button type="button" class="btn btn-secondary" data-background-mode="raw">保留原样</button><button type="button" class="btn btn-secondary" data-background-mode="auto">自动融合</button><button type="button" class="btn btn-secondary" data-background-mode="black">黑色</button><button type="button" class="btn btn-secondary" data-background-mode="white">白色</button><button type="button" class="btn btn-secondary" data-background-mode="custom">自定义</button></div>
            <div class="icon-custom-color hidden"><div class="icon-color-picker-row"><button type="button" class="icon-hue-wheel" aria-label="色相色轮"><span></span></button><button type="button" class="icon-sv-plane" aria-label="饱和度和明度面板"><span></span></button></div><div class="icon-color-inputs"><input class="icon-color-hex" type="text" value="#ffffff" maxlength="7" spellcheck="false" aria-label="背景色 HEX"><button type="button" class="btn btn-secondary icon-eyedropper">屏幕取色</button></div></div>
          </section>
          <div class="icon-studio-status" role="status"></div>
          <section class="icon-studio-preview hidden"><div class="icon-studio-preview-card bookmark-card"><div class="card-icon-wrapper"><div class="card-icon"></div></div><div class="card-info"><div class="card-meta"></div><div class="card-title"></div></div></div><div class="icon-studio-preview-source"></div></section>
        </div><div class="dialog-footer icon-studio-footer"><button class="btn btn-secondary" data-action="close">取消</button><button class="btn btn-primary" data-action="apply" disabled>应用图标</button></div>
      </div>`;
    document.body.appendChild(this.dialog); this.bindDialogEvents();
  }

  bindDialogEvents() {
    this.dialog.querySelector('.dialog-overlay').addEventListener('click', () => this.hide());
    this.dialog.querySelectorAll('[data-action="close"]').forEach(button => button.addEventListener('click', () => this.hide()));
    this.dialog.querySelector('[data-action="apply"]').addEventListener('click', () => this.applySelectedIcon());
    this.dialog.querySelector('#icon-upload-input').addEventListener('change', event => this.handleUpload(event));
    this.dialog.querySelectorAll('[data-background-mode]').forEach(button => button.addEventListener('click', () => this.setBackgroundMode(button.dataset.backgroundMode)));
    this.dialog.querySelector('.icon-color-hex').addEventListener('input', event => { if (isValidHexColor(event.target.value)) this.setCustomColor(event.target.value); });
    this.bindPicker('.icon-hue-wheel', event => this.updateHueFromPointer(event)); this.bindPicker('.icon-sv-plane', event => this.updateSvFromPointer(event));
    this.dialog.querySelector('.icon-eyedropper').addEventListener('click', () => this.pickScreenColor());
  }

  bindPicker(selector, handler) {
    const target = this.dialog.querySelector(selector);
    target.addEventListener('pointerdown', event => {
      event.preventDefault(); target.setPointerCapture?.(event.pointerId); handler(event);
      const move = next => handler(next); const end = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end); };
      target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end);
    });
  }

  show(bookmark) {
    this.bookmark = bookmark; this.selectedIcon = null; this.siteIcon = null; this.mode = 'custom';
    const existing = BookmarkStore.getCustomIcon(bookmark.id);
    if (existing) {
      const record = typeof existing === 'string'
        ? { kind: isSvgRaw(existing) ? 'svg' : 'image', data: existing, background: { mode: 'raw' } }
        : existing;
      this.upload = { kind: record.kind || (isSvgRaw(record.data) ? 'svg' : 'image'), data: record.data };
      this.background = cloneIconBackground(record.background);
      this.customColor = this.background.mode === 'solid' ? this.background.color : '#ffffff';
      this.colorState = hexToHsv(this.customColor);
      this.customEditing = this.background.mode === 'solid' && !['#111111', '#ffffff'].includes(this.background.color);
    } else {
      this.upload = null;
      this.resetBackground();
    }
    this.dialog.querySelector('#icon-upload-input').value = ''; this.dialog.querySelector('.icon-studio-subtitle').textContent = bookmark.title || '未命名书签'; this.dialog.querySelector('.dialog-header h3').textContent = '图标';
    this.dialog.querySelector('.icon-library-section').classList.remove('hidden'); this.dialog.querySelector('.icon-upload-section').classList.remove('hidden'); this.setStatus(''); this.renderLibraryCandidates(); this.updateAll(); this.dialog.classList.remove('hidden');
  }

  showSiteBackground(bookmark) {
    const siteIcon = BookmarkStore.getSiteIcon(bookmark.url); if (!siteIcon) return;
    this.bookmark = bookmark; this.selectedIcon = null; this.upload = null; this.siteIcon = siteIcon; this.mode = 'site-background'; this.background = cloneIconBackground(BookmarkStore.getSiteIconBackground(bookmark.id)); this.customColor = this.background.mode === 'solid' ? this.background.color : '#ffffff'; this.colorState = hexToHsv(this.customColor); this.customEditing = this.background.mode === 'solid' && !['#111111', '#ffffff'].includes(this.background.color);
    this.dialog.querySelector('.dialog-header h3').textContent = '网站图标背景'; this.dialog.querySelector('.icon-studio-subtitle').textContent = bookmark.title || '未命名书签'; this.dialog.querySelector('.icon-library-section').classList.add('hidden'); this.dialog.querySelector('.icon-upload-section').classList.add('hidden');
    this.setStatus('背景只改变显示策略，网站图标仍由页面声明资源提供。'); this.updateAll(); this.dialog.classList.remove('hidden');
  }

  resetBackground() { this.background = { mode: 'raw' }; this.customColor = '#ffffff'; this.customEditing = false; this.colorState = hexToHsv(this.customColor); }
  hide() { if (this.mode === 'site-background' && this.bookmark) EventBus.emit('siteIcon:backgroundPreview', { id: this.bookmark.id, background: null }); this.dialog.classList.add('hidden'); }

  renderLibraryCandidates() {
    const result = getLibraryIconCandidates(this.bookmark, { limit: 48 }); const container = this.dialog.querySelector('.icon-studio-results');
    this.dialog.querySelector('.icon-studio-local-context').textContent = `仅按书签名称“${this.bookmark.title || '未命名'}”匹配；内置图标库当前收录 ${result.candidates.length} 个可用图标。`; container.innerHTML = '';
    if (!result.candidates.length) { container.innerHTML = '<div class="icon-studio-empty">当前版本的内置图标库尚无匹配图标</div>'; return; }
    result.candidates.forEach(icon => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'icon-studio-local-tile'; button.innerHTML = `<span class="icon-studio-local-art">${icon.svg}</span><span class="icon-studio-local-info"><span class="icon-studio-local-title">${this.escapeHtml(icon.title)}</span><span class="icon-studio-local-reasons">${this.escapeHtml(icon.matchReason)}</span></span>`;
      button.addEventListener('click', () => { this.selectedIcon = icon; this.upload = null; this.resetBackground(); container.querySelectorAll('.icon-studio-local-tile').forEach(item => item.classList.remove('selected')); button.classList.add('selected'); this.updateAll(); }); container.appendChild(button);
    });
  }

  async handleUpload(event) {
    const file = event.target.files?.[0]; if (!file) return; this.setStatus('正在读取图标…'); const result = await readIconUpload(file);
    if (!result.ok) return this.setStatus(result.reason, true);
    this.upload = result; this.selectedIcon = null; this.resetBackground(); this.dialog.querySelectorAll('.icon-studio-local-tile').forEach(item => item.classList.remove('selected')); this.setStatus(result.kind === 'svg' ? '已载入 SVG，动画会按原文件播放。' : '已保留原始图片，动画不会转码。'); this.updateAll();
  }

  setBackgroundMode(mode) {
    if (mode === 'raw') { this.background = { mode: 'raw' }; this.customEditing = false; }
    if (mode === 'black') { this.background = { mode: 'solid', color: '#111111' }; this.customEditing = false; }
    if (mode === 'white') { this.background = { mode: 'solid', color: '#ffffff' }; this.customEditing = false; }
    if (mode === 'custom') { this.background = { mode: 'solid', color: this.customColor }; this.customEditing = true; }
    if (mode === 'auto') { this.customEditing = false; void this.applyAutoBackground(); }
    this.updateAll();
  }

  async applyAutoBackground() {
    const source = this.currentIcon(); if (!source) return; this.setStatus('正在分析图标第一帧边缘颜色…'); const analysis = await analyzeIconBackground(source);
    if (!analysis.ok) { this.background = { mode: 'raw' }; this.setStatus(`自动融合不可用：${analysis.reason}。请选择黑色、白色或自定义颜色。`, true); } else { this.background = { mode: 'auto', result: analysis.result }; this.setStatus(analysis.result.type === 'gradient' ? '已生成多色融合渐变。' : '已生成融合纯色背景。'); }
    this.updateAll();
  }

  setCustomColor(color) { if (!isValidHexColor(color)) return; this.customColor = color.toLowerCase(); this.customEditing = true; this.colorState = hexToHsv(this.customColor); this.background = { mode: 'solid', color: this.customColor }; this.updateAll(); }
  updateHueFromPointer(event) { const rect = this.dialog.querySelector('.icon-hue-wheel').getBoundingClientRect(); const x = event.clientX - rect.left - rect.width / 2; const y = event.clientY - rect.top - rect.height / 2; this.colorState.hue = (Math.atan2(y, x) * 180 / Math.PI + 450) % 360; this.setCustomColor(hsvToHex(this.colorState.hue, this.colorState.saturation, this.colorState.value)); }
  updateSvFromPointer(event) { const rect = this.dialog.querySelector('.icon-sv-plane').getBoundingClientRect(); this.colorState.saturation = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)); this.colorState.value = Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height)); this.setCustomColor(hsvToHex(this.colorState.hue, this.colorState.saturation, this.colorState.value)); }
  async pickScreenColor() { if (!('EyeDropper' in window)) return this.setStatus('当前 Chrome 不支持屏幕取色，请用色轮或 HEX 输入。', true); try { this.setCustomColor((await new EyeDropper().open()).sRGBHex); } catch {} }

  currentIcon() { const current = this.upload || this.selectedIcon || this.siteIcon; return current ? { kind: current.kind || current.type || 'svg', value: current.data || current.svg || current.value } : null; }

  updateAll() {
    const current = this.currentIcon(); const enabled = Boolean(this.upload) || this.mode === 'site-background'; this.dialog.querySelector('.icon-background-composer').classList.toggle('hidden', !enabled); this.dialog.querySelector('.icon-background-source').textContent = this.mode === 'site-background' ? '来源：当前网站声明图标。' : '来源：上传原始图标文件。';
    this.dialog.querySelectorAll('[data-background-mode]').forEach(button => { const mode = button.dataset.backgroundMode; const active = mode === 'custom' ? this.customEditing : mode === 'black' ? !this.customEditing && this.background.mode === 'solid' && this.background.color === '#111111' : mode === 'white' ? !this.customEditing && this.background.mode === 'solid' && this.background.color === '#ffffff' : mode === this.background.mode; button.classList.toggle('active', active); });
    this.dialog.querySelector('.icon-custom-color').classList.toggle('hidden', !this.customEditing); this.renderPicker(); this.renderPreview(current); this.dialog.querySelector('[data-action="apply"]').disabled = !current;
    if (this.mode === 'site-background' && this.bookmark) EventBus.emit('siteIcon:backgroundPreview', { id: this.bookmark.id, background: cloneIconBackground(this.background) });
  }

  renderPicker() { const wheel = this.dialog.querySelector('.icon-hue-wheel'); const plane = this.dialog.querySelector('.icon-sv-plane'); wheel.style.setProperty('--hue-angle', `${this.colorState.hue}deg`); plane.style.setProperty('--hue-color', hsvToHex(this.colorState.hue, 1, 1)); plane.style.setProperty('--sv-x', `${this.colorState.saturation * 100}%`); plane.style.setProperty('--sv-y', `${(1 - this.colorState.value) * 100}%`); this.dialog.querySelector('.icon-color-hex').value = this.customColor; }

  renderPreview(current) {
    const preview = this.dialog.querySelector('.icon-studio-preview'); const card = preview.querySelector('.icon-studio-preview-card'); const icon = card.querySelector('.card-icon'); if (!current) { preview.classList.add('hidden'); return; }
    preview.classList.remove('hidden'); icon.innerHTML = ''; icon.style.background = backgroundCssValue(this.background); if (current.kind === 'svg') icon.innerHTML = current.value; else { const image = document.createElement('img'); image.className = 'card-icon-image'; image.src = current.value; image.alt = ''; icon.appendChild(image); }
    card.style.setProperty('--icon-text-color', iconTextColor(this.background)); card.querySelector('.card-title').textContent = this.bookmark.title || '未命名书签'; card.querySelector('.card-meta').textContent = this.mode === 'site-background' ? this.domain() : '上传图标'; preview.querySelector('.icon-studio-preview-source').textContent = this.mode === 'site-background' ? '来源：网站声明图标（临时预览同步到原卡片）' : '来源：上传图标（应用前不写入）';
  }

  domain() { try { return new URL(this.bookmark.url).hostname; } catch { return ''; } }
  applySelectedIcon() { const current = this.currentIcon(); if (!current || !this.bookmark) return; if (this.mode === 'site-background') { const background = this.background.mode === 'auto' ? { ...this.background, sourceValue: current.value } : this.background; BookmarkStore.setSiteIconBackground(this.bookmark.id, background); EventBus.emit('siteIcon:backgroundApplied', { id: this.bookmark.id }); this.setStatus('网站图标背景已应用。'); return; } const record = createCustomIconRecord({ kind: current.kind, data: current.value, background: this.upload ? this.background : { mode: 'raw' } }); BookmarkStore.setCustomIcon(this.bookmark.id, record); EventBus.emit('icon:applied', { id: this.bookmark.id, iconData: record }); this.setStatus('图标已应用。'); }
  setStatus(message, isError = false) { const status = this.dialog.querySelector('.icon-studio-status'); status.textContent = message; status.classList.toggle('error', isError); }
  escapeHtml(text) { const div = document.createElement('div'); div.textContent = text || ''; return div.innerHTML; }
}

export default IconStudio;
