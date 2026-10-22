import EventBus from '../core/EventBus.js';
import BookmarkStore from '../core/BookmarkStore.js';
import { iconSvg } from '../core/IconLibrary.js';
import { getLibraryIconCandidates, getLibraryIconById, searchLibraryIcons } from '../core/icons/IconLibraryProvider.js';
import { buildIconPrompt } from '../core/icons/IconPrompt.js';
import { createCustomIconRecord, isValidHexColor, normalizeIconScale, readIconUpload } from '../core/icons/IconUploadProcessor.js';
import { analyzeIconBackground } from '../core/icons/IconBackgroundAnalyzer.js';
import { backgroundCssValue, cloneIconBackground, getIconScale } from '../core/icons/IconBackground.js';
import { resolveBookmarkIcon } from '../core/icons/IconResolver.js';
import { isSvgRaw } from '../core/icons/IconSanitizer.js';

class IconStudio {
  constructor() {
    this.dialog = null; this.bookmark = null; this.selectedIcon = null; this.upload = null; this.siteIcon = null;
    this.returnFocus = null; this.sessionId = 0; this.uploadRequest = 0; this.backgroundRequest = 0;
    this.uploadBusy = false; this.backgroundBusy = false;
    this.mode = 'custom'; this.background = { mode: 'raw' }; this.iconScale = 1; this.customColor = '#ffffff'; this.customEditing = false;
    this.init();
  }

  init() {
    this.createDialog();
    EventBus.on('iconStudio:open', ({ bookmark, returnFocus }) => this.show(bookmark, returnFocus));
    EventBus.on('iconStudio:openSiteBackground', ({ bookmark, returnFocus }) => this.showSiteBackground(bookmark, returnFocus));
  }

  createDialog() {
    this.dialog = document.createElement('div'); this.dialog.id = 'icon-studio'; this.dialog.className = 'dialog icon-studio hidden';
    this.dialog.setAttribute('role', 'dialog'); this.dialog.setAttribute('aria-modal', 'true'); this.dialog.setAttribute('aria-labelledby', 'icon-studio-title');
    this.dialog.innerHTML = `
      <div class="dialog-overlay"></div><div class="dialog-content icon-studio-content">
        <div class="dialog-header"><div><h3 id="icon-studio-title">图标</h3><div class="icon-studio-subtitle"></div></div><button class="dialog-close" data-action="close" aria-label="关闭">${iconSvg('x')}</button></div>
        <div class="icon-studio-body"><div class="icon-studio-editor">
          <section class="icon-studio-section icon-library-section"><div class="icon-studio-search-row"><input id="icon-library-search" type="search" placeholder="搜索图标" aria-label="搜索内置图标" autocomplete="off"><button type="button" class="text-button" data-action="browse-icons">全部</button><button type="button" class="studio-upload-button" data-action="upload" aria-label="上传图片">${iconSvg('arrow-up-from-line')}</button></div><div class="icon-studio-local-context" role="status" aria-live="polite"></div><div class="icon-studio-results"></div></section>
          <section class="icon-studio-section icon-upload-section"><input id="icon-upload-input" class="icon-upload-input hidden" type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp,image/gif"></section>
          <section class="icon-studio-section icon-prompt-section hidden"><textarea class="icon-prompt-text" readonly rows="7" aria-label="单枚图标生成提示词"></textarea><button type="button" class="btn btn-secondary" data-action="copy-prompt">复制提示词</button></section>
          <section class="icon-background-composer hidden"><div class="icon-studio-label">背景</div><p class="icon-studio-help icon-background-source"></p>
            <div class="icon-background-modes" role="group" aria-label="图标背景模式"><button type="button" class="btn btn-secondary" data-background-mode="raw">原样</button><button type="button" class="btn btn-secondary" data-background-mode="auto">融合</button><button type="button" class="btn btn-secondary" data-background-mode="black">黑</button><button type="button" class="btn btn-secondary" data-background-mode="white">白</button><button type="button" class="btn btn-secondary" data-background-mode="custom">自选</button></div>
            <div class="icon-custom-color hidden"><div class="icon-color-inputs"><input class="icon-color-native" type="color" value="#ffffff" aria-label="背景颜色"><input class="icon-color-hex" type="text" value="#ffffff" maxlength="7" spellcheck="false" aria-label="背景色 HEX"><button type="button" class="btn btn-secondary icon-eyedropper">取色</button></div></div>
          </section>
          <label class="icon-scale-control hidden"><span>缩放 <strong class="icon-scale-value">100%</strong></span><input class="icon-scale-input" type="range" min="40" max="400" step="5" value="100"></label>
          </div>
          <section class="icon-studio-preview hidden"><div class="icon-studio-preview-card bookmark-card"><div class="card-surface"><div class="card-icon-wrapper"><div class="card-icon"></div></div></div><div class="card-info"><div class="card-title"></div><div class="card-meta"></div></div></div><div class="icon-studio-preview-source"></div></section>
        </div><div class="dialog-footer icon-studio-footer"><div class="dialog-status icon-studio-status" role="status" aria-live="polite"></div><button class="text-button prompt-trigger" type="button" data-action="toggle-prompt">生成模板</button><div class="dialog-actions"><button class="btn btn-secondary" data-action="close">取消</button><button class="btn btn-primary" data-action="apply" disabled>应用图标</button></div></div>
      </div>`;
    const body = this.dialog.querySelector('.icon-studio-body');
    body.insertBefore(this.dialog.querySelector('.icon-studio-preview'), this.dialog.querySelector('.icon-studio-editor'));
    document.body.appendChild(this.dialog); this.bindDialogEvents();
  }

  bindDialogEvents() {
    this.dialog.querySelector('.dialog-overlay').addEventListener('click', () => this.hide());
    this.dialog.querySelectorAll('[data-action="close"]').forEach(button => button.addEventListener('click', () => this.hide()));
    this.dialog.querySelector('[data-action="apply"]').addEventListener('click', () => this.applySelectedIcon());
    this.dialog.querySelector('#icon-upload-input').addEventListener('change', event => this.handleUpload(event));
    this.dialog.querySelector('#icon-library-search').addEventListener('input', () => this.renderLibraryCandidates());
    this.dialog.querySelector('[data-action="browse-icons"]').addEventListener('click', () => { this.browseAll = true; this.dialog.querySelector('#icon-library-search').value = ''; this.renderLibraryCandidates(); });
    this.dialog.querySelector('[data-action="copy-prompt"]').addEventListener('click', () => this.copyPrompt());
    this.dialog.querySelectorAll('[data-background-mode]').forEach(button => button.addEventListener('click', () => this.setBackgroundMode(button.dataset.backgroundMode)));
    this.dialog.querySelector('.icon-scale-input').addEventListener('input', event => this.setIconScale(Number(event.target.value) / 100));
    this.dialog.querySelector('.icon-color-hex').addEventListener('input', event => {
      event.target.removeAttribute('aria-invalid');
      if (isValidHexColor(event.target.value)) this.setCustomColor(event.target.value);
    });
    this.dialog.querySelector('.icon-color-hex').addEventListener('change', event => {
      if (!isValidHexColor(event.target.value)) {
        event.target.setAttribute('aria-invalid', 'true');
        this.setStatus('请输入 #RRGGBB 格式的颜色。', true);
      }
    });
    this.dialog.querySelector('.icon-color-native').addEventListener('input', event => this.setCustomColor(event.target.value));
    this.dialog.querySelector('[data-action="upload"]').addEventListener('click', () => this.dialog.querySelector('#icon-upload-input').click());
    this.dialog.querySelector('[data-action="toggle-prompt"]').addEventListener('click', () => {
      const section = this.dialog.querySelector('.icon-prompt-section'); section.classList.toggle('hidden');
      if (!section.classList.contains('hidden')) { section.scrollIntoView({block:'nearest'}); section.querySelector('textarea').focus(); }
    });
    this.dialog.querySelector('.icon-eyedropper').addEventListener('click', () => this.pickScreenColor());
  }

  show(bookmark, returnFocus) {
    this.beginSession(returnFocus);
    this.bookmark = bookmark; this.selectedIcon = null; this.siteIcon = null; this.mode = 'custom';
    const existing = BookmarkStore.getCustomIcon(bookmark.id);
    this.upload = null;
    if (existing?.kind === 'builtin') {
      this.selectedIcon = getLibraryIconById(existing.iconId);
      this.resetIconPresentation();
      this.iconScale = normalizeIconScale(existing.scale);
    } else if (existing) {
      const record = typeof existing === 'string'
        ? { kind: isSvgRaw(existing) ? 'svg' : 'image', data: existing, background: { mode: 'raw' } }
        : existing;
      this.upload = { kind: record.kind || (isSvgRaw(record.data) ? 'svg' : 'image'), data: record.data };
      this.background = cloneIconBackground(record.background);
      this.iconScale = normalizeIconScale(record.scale);
      this.customColor = this.background.mode === 'solid' ? this.background.color : '#ffffff';

      this.customEditing = this.background.mode === 'solid' && !['#111111', '#ffffff'].includes(this.background.color);
    } else {
      this.upload = null;
      this.resetIconPresentation();
      const current = resolveBookmarkIcon(bookmark, { storage: BookmarkStore });
      if (current?.iconId) this.selectedIcon = getLibraryIconById(current.iconId);
      if (!this.selectedIcon && !bookmark.url) this.selectedIcon = null;
      if (!current && bookmark.url) {
        this.siteIcon = BookmarkStore.getSiteIcon(bookmark.url);
        if (this.siteIcon) { this.mode = 'site-background'; this.background = cloneIconBackground(BookmarkStore.getSiteIconBackground(bookmark.id)); this.iconScale = getIconScale(this.background); }
      }
    }
    this.dialog.querySelector('#icon-upload-input').value = ''; this.dialog.querySelector('.icon-studio-subtitle').textContent = bookmark.title || '未命名书签'; this.dialog.querySelector('.dialog-header h3').textContent = '图标';
    this.browseAll = false;
    this.dialog.querySelector('#icon-library-search').value = '';
    this.dialog.querySelector('.icon-prompt-section').classList.add('hidden');
    this.updatePrompt();
    this.dialog.querySelector('.icon-library-section').classList.remove('hidden'); this.dialog.querySelector('.icon-upload-section').classList.remove('hidden'); this.setStatus(''); this.renderLibraryCandidates(); this.updateAll(); this.dialog.classList.remove('hidden');
    this.dialog.querySelector('.dialog-close').focus();
  }

  showSiteBackground(bookmark, returnFocus) {
    const siteIcon = BookmarkStore.getSiteIcon(bookmark.url); if (!siteIcon) return;
    this.beginSession(returnFocus);
    this.bookmark = bookmark; this.selectedIcon = null; this.upload = null; this.siteIcon = siteIcon; this.mode = 'site-background'; this.background = cloneIconBackground(BookmarkStore.getSiteIconBackground(bookmark.id)); this.iconScale = getIconScale(this.background); this.customColor = this.background.mode === 'solid' ? this.background.color : '#ffffff'; this.customEditing = this.background.mode === 'solid' && !['#111111', '#ffffff'].includes(this.background.color);
    this.dialog.querySelector('.dialog-header h3').textContent = '网站图标背景'; this.dialog.querySelector('.icon-studio-subtitle').textContent = bookmark.title || '未命名书签'; this.dialog.querySelector('.icon-library-section').classList.add('hidden'); this.dialog.querySelector('.icon-upload-section').classList.add('hidden');
    this.dialog.querySelector('.icon-prompt-section').classList.add('hidden');
    this.setStatus(''); this.updateAll(); this.dialog.classList.remove('hidden');
    this.dialog.querySelector('.dialog-close').focus();
  }

  beginSession(returnFocus) {
    if (returnFocus) this.returnFocus = returnFocus;
    else if (!this.dialog.contains(document.activeElement)) this.returnFocus = document.activeElement;
    this.sessionId++;
    this.uploadRequest++;
    this.backgroundRequest++;
    this.uploadBusy = false;
    this.backgroundBusy = false;
    this.dialog.querySelector('.icon-color-hex').removeAttribute('aria-invalid');
  }

  resetIconPresentation() { this.backgroundRequest++; this.backgroundBusy = false; this.background = { mode: 'raw' }; this.iconScale = 1; this.customColor = '#ffffff'; this.customEditing = false; }
  hide() {
    this.sessionId++;
    this.uploadRequest++;
    this.backgroundRequest++;
    this.uploadBusy = false;
    this.backgroundBusy = false;
    if (this.bookmark) EventBus.emit('siteIcon:backgroundPreview', { id: this.bookmark.id, background: null });
    this.dialog.classList.add('hidden');
    if (this.returnFocus?.isConnected && !this.returnFocus.disabled && this.returnFocus.tabIndex !== -1 && !this.returnFocus.closest?.('[inert], [hidden], .hidden')) this.returnFocus.focus();
    else document.getElementById('more-trigger')?.focus();
    this.returnFocus = null;
  }

  renderLibraryCandidates() {
    const query = this.dialog.querySelector('#icon-library-search').value.trim();
    const browsing = Boolean(query || this.browseAll);
    const candidates = browsing
      ? searchLibraryIcons(query, { kind: this.bookmark.url ? 'website' : 'folder' })
      : getLibraryIconCandidates(this.bookmark, { limit: 48, kind: this.bookmark.url ? 'website' : 'folder' }).candidates;
    const container = this.dialog.querySelector('.icon-studio-results');
    container.classList.add('local-candidates');
    this.dialog.querySelector('.icon-studio-local-context').textContent = candidates.length ? '' : '没有匹配的图标';
    container.innerHTML = '';
    container.classList.toggle('hidden', !candidates.length);
    candidates.forEach(icon => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'icon-studio-local-tile'; button.innerHTML = `<span class="icon-studio-local-art"></span><span class="icon-studio-local-info"><span class="icon-studio-local-title">${this.escapeHtml(icon.title)}</span></span>`;
      const art = button.querySelector('.icon-studio-local-art');
      if (icon.type === 'svg') art.innerHTML = icon.svg;
      else { const image = document.createElement('img'); image.src = icon.value; image.alt = ''; image.loading = 'lazy'; art.appendChild(image); }
      const selected = this.selectedIcon?.id === icon.id;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.addEventListener('click', () => { if (this.uploadBusy) return; this.selectedIcon = icon; this.upload = null; this.siteIcon = null; this.mode = 'custom'; EventBus.emit('siteIcon:backgroundPreview', { id:this.bookmark.id, background:null }); this.resetIconPresentation(); this.setStatus(''); container.querySelectorAll('.icon-studio-local-tile').forEach(item => { item.classList.remove('selected'); item.setAttribute('aria-pressed', 'false'); }); button.classList.add('selected'); button.setAttribute('aria-pressed', 'true'); this.updatePrompt(); this.updateAll(); }); container.appendChild(button);
    });
  }

  async copyPrompt() {
    const field = this.dialog.querySelector('.icon-prompt-text');
    try { await navigator.clipboard.writeText(field.value); this.setStatus('提示词已复制，生成时请附上清晰品牌标识。'); }
    catch { field.focus(); field.select(); this.setStatus('请手动复制已选中的提示词。'); }
  }

  updatePrompt() {
    this.dialog.querySelector('.icon-prompt-text').value = buildIconPrompt(this.selectedIcon?.title || this.bookmark.title, undefined, this.bookmark.url ? 'website' : 'folder');
  }

  async handleUpload(event) {
    const file = event.target.files?.[0]; if (!file) return;
    const session = this.sessionId; const request = ++this.uploadRequest;
    this.backgroundRequest++;
    this.backgroundBusy = false;
    this.uploadBusy = true;
    this.setStatus('正在读取图标…');
    this.updateBusyState();
    try {
      const result = await readIconUpload(file);
      if (!this.isCurrentRequest(session, request, 'uploadRequest')) return;
      if (!result.ok) { event.target.value = ''; this.setStatus(result.reason, true); return; }
      this.upload = result; this.selectedIcon = null; this.siteIcon = null; this.mode = 'custom'; EventBus.emit('siteIcon:backgroundPreview', { id:this.bookmark.id, background:null }); this.resetIconPresentation(); this.dialog.querySelectorAll('.icon-studio-local-tile').forEach(item => item.classList.remove('selected')); this.setStatus(''); this.updateAll();
    } catch {
      if (this.isCurrentRequest(session, request, 'uploadRequest')) {
        event.target.value = '';
        this.setStatus('图标读取失败，请重新选择文件。', true);
      }
    } finally {
      if (this.isCurrentRequest(session, request, 'uploadRequest')) {
        this.uploadBusy = false;
        this.updateBusyState();
      }
    }
  }

  isCurrentRequest(session, request, key) {
    return session === this.sessionId && request === this[key] && !this.dialog.classList.contains('hidden');
  }

  setBackgroundMode(mode) {
    if (this.uploadBusy) return;
    this.backgroundRequest++;
    this.backgroundBusy = false;
    this.setStatus('');
    if (mode === 'raw') { this.background = { mode: 'raw' }; this.customEditing = false; }
    if (mode === 'black') { this.background = { mode: 'solid', color: '#111111' }; this.customEditing = false; }
    if (mode === 'white') { this.background = { mode: 'solid', color: '#ffffff' }; this.customEditing = false; }
    if (mode === 'custom') { this.background = { mode: 'solid', color: this.customColor }; this.customEditing = true; }
    if (mode === 'auto') { this.customEditing = false; void this.applyAutoBackground(); }
    this.updateAll();
  }

  async applyAutoBackground() {
    const source = this.currentIcon(); if (!source) return;
    const session = this.sessionId; const request = ++this.backgroundRequest;
    this.backgroundBusy = true;
    this.setStatus('正在分析图标第一帧边缘颜色…');
    this.updateBusyState();
    try {
      const analysis = await analyzeIconBackground(source);
      if (!this.isCurrentRequest(session, request, 'backgroundRequest') || source.value !== this.currentIcon()?.value) return;
      if (!analysis.ok) { this.background = { mode: 'raw' }; this.setStatus(`自动融合不可用：${analysis.reason}。请选择黑色、白色或自定义颜色。`, true); } else { this.background = { mode: 'auto', result: analysis.result }; this.setStatus(analysis.result.type === 'gradient' ? '已生成多色融合渐变。' : '已生成融合纯色背景。'); }
      this.updateAll();
    } catch {
      if (this.isCurrentRequest(session, request, 'backgroundRequest')) this.setStatus('自动融合失败，请重试或选择其他背景。', true);
    } finally {
      if (this.isCurrentRequest(session, request, 'backgroundRequest')) {
        this.backgroundBusy = false;
        this.updateBusyState();
      }
    }
  }

  setCustomColor(color) { if (!isValidHexColor(color)) return; this.backgroundRequest++; this.backgroundBusy = false; this.customColor = color.toLowerCase(); this.customEditing = true; this.background = { mode: 'solid', color: this.customColor }; this.dialog.querySelector('.icon-color-hex').removeAttribute('aria-invalid'); this.setStatus(''); this.updateAll(); }
  setIconScale(scale) { this.iconScale = normalizeIconScale(scale); this.updateAll(); }
  async pickScreenColor() {
    if (!('EyeDropper' in window)) return this.setStatus('当前 Chrome 不支持屏幕取色，请用颜色控件或 HEX 输入。', true);
    const session = this.sessionId;
    try {
      const result = await new EyeDropper().open();
      if (session === this.sessionId && !this.dialog.classList.contains('hidden')) this.setCustomColor(result.sRGBHex);
    } catch {}
  }

  currentIcon() { const current = this.upload || this.selectedIcon || this.siteIcon; return current ? { kind: current.type || current.kind || 'svg', value: current.data || current.svg || current.value } : null; }

  updateAll() {
    const current = this.currentIcon(); const enabled = Boolean(this.upload) || this.mode === 'site-background'; this.dialog.querySelector('.icon-background-composer').classList.toggle('hidden', !enabled); this.dialog.querySelector('.icon-background-source').textContent = this.mode === 'site-background' ? '来源：当前网站声明图标。' : '来源：上传原始图标文件。';
    this.dialog.querySelectorAll('[data-background-mode]').forEach(button => { const mode = button.dataset.backgroundMode; const active = mode === 'custom' ? this.customEditing : mode === 'black' ? !this.customEditing && this.background.mode === 'solid' && this.background.color === '#111111' : mode === 'white' ? !this.customEditing && this.background.mode === 'solid' && this.background.color === '#ffffff' : mode === this.background.mode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    this.dialog.querySelector('.icon-custom-color').classList.toggle('hidden', !this.customEditing); this.dialog.querySelector('.icon-scale-control').classList.toggle('hidden', !current); const scaleInput = this.dialog.querySelector('.icon-scale-input'); scaleInput.value = String(this.iconScale * 100); this.dialog.querySelector('.icon-scale-value').textContent = `${Math.round(this.iconScale * 100)}%`; this.renderPicker(); this.renderPreview(current); this.updateBusyState();
    if (this.mode === 'site-background' && this.bookmark) EventBus.emit('siteIcon:backgroundPreview', { id: this.bookmark.id, background: { ...cloneIconBackground(this.background), scale: this.iconScale } });
  }

  updateBusyState() {
    const busy = this.uploadBusy || this.backgroundBusy;
    const apply = this.dialog.querySelector('[data-action="apply"]');
    apply.disabled = !this.currentIcon() || busy;
    apply.setAttribute('aria-busy', String(busy));
    this.dialog.querySelector('#icon-upload-input').setAttribute('aria-busy', String(this.uploadBusy));
    this.dialog.querySelectorAll('[data-background-mode]').forEach(button => {
      button.disabled = this.uploadBusy;
      button.setAttribute('aria-busy', String(button.dataset.backgroundMode === 'auto' && this.backgroundBusy));
    });
    this.dialog.querySelectorAll('.icon-studio-local-tile').forEach(button => { button.disabled = this.uploadBusy; });
  }

  renderPicker() { this.dialog.querySelector('.icon-color-native').value = this.customColor; this.dialog.querySelector('.icon-color-hex').value = this.customColor; }

  renderPreview(current) {
    this.dialog.querySelector('.icon-studio-body').classList.add('has-preview');
    const preview = this.dialog.querySelector('.icon-studio-preview'); const card = preview.querySelector('.icon-studio-preview-card'); const icon = card.querySelector('.card-icon');
    icon.classList.toggle('icon-studio-placeholder', !current);
    preview.classList.remove('hidden'); icon.innerHTML = ''; icon.style.background = this.selectedIcon ? 'var(--color-builtin-icon-bg)' : backgroundCssValue(this.background); icon.style.setProperty('--icon-content-scale', String(this.iconScale)); if (!current) icon.innerHTML = iconSvg(this.bookmark.url ? 'bookmark' : 'folder'); else if (current.kind === 'svg') icon.innerHTML = current.value; else { const image = document.createElement('img'); image.className = 'card-icon-image'; image.src = current.value; image.alt = ''; icon.appendChild(image); }
    card.querySelector('.card-title').textContent = this.bookmark.title || '未命名书签'; card.querySelector('.card-meta').textContent = this.mode === 'site-background' ? this.domain() : this.selectedIcon ? this.selectedIcon.title : '上传图标'; preview.querySelector('.icon-studio-preview-source').textContent = !current ? '默认图标' : this.mode === 'site-background' ? '网站图标' : this.selectedIcon ? '内置图标' : '自定义图片';
  }

  domain() { try { return new URL(this.bookmark.url).hostname; } catch { return ''; } }
  applySelectedIcon() {
    const current = this.currentIcon(); if (!current || !this.bookmark || this.uploadBusy || this.backgroundBusy) return;
    try {
      if (this.mode === 'site-background') {
        const background = { ...(this.background.mode === 'auto' ? { ...this.background, sourceValue: current.value } : this.background), scale: this.iconScale };
        BookmarkStore.setSiteIconBackground(this.bookmark.id, background); EventBus.emit('siteIcon:backgroundApplied', { id: this.bookmark.id }); this.hide(); return;
      }
      const record = this.selectedIcon
        ? { version: 4, kind: 'builtin', iconId: this.selectedIcon.id, scale: this.iconScale }
        : createCustomIconRecord({ kind: current.kind, data: current.value, background: this.background, scale: this.iconScale });
      BookmarkStore.setCustomIcon(this.bookmark.id, record); EventBus.emit('icon:applied', { id: this.bookmark.id, iconData: record }); this.hide();
    } catch {
      this.setStatus('图标应用失败，请重试。', true);
    }
  }
  setStatus(message, isError = false) { const status = this.dialog.querySelector('.icon-studio-status'); status.textContent = message; status.classList.toggle('error', isError); }
  escapeHtml(text) { const div = document.createElement('div'); div.textContent = text || ''; return div.innerHTML; }
}

export default IconStudio;
