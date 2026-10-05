import EventBus from '../core/EventBus.js';
import { getPreviewOrder, hitTestSlots } from '../core/DragOrder.js';

/** 单次原生拖拽：固定插槽命中、可中断让位动画、松手一次写入。 */
export default class GridDragController {
  constructor(owner) {
    this.owner = owner;
    this.grid = owner.grid;
    this.animations = new Map();
    this.saving = false;
    EventBus.on('card:dragstart', ({ id }) => this.begin(id));
    EventBus.on('card:dragend', () => this.cancel());
    document.addEventListener('dragover', event => this.onDragOver(event), true);
    document.addEventListener('drop', event => this.onDrop(event), true);
    document.addEventListener('dragend', () => this.cancel(), true);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') this.cancel();
    }, true);
    window.addEventListener('blur', () => this.cancel());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.cancel();
    });
    window.addEventListener('resize', () => this.cancel());
    document.addEventListener('scroll', () => {
      if (!this.session || !this.lastPointer) return;
      this.updateCandidate(this.candidateAt(this.lastPointer));
      this.schedulePreview();
    }, true);
  }

  duration() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
    const token = getComputedStyle(this.grid).getPropertyValue('--card-motion-duration').trim();
    const value = parseFloat(token);
    return Number.isFinite(value) ? value * (token.endsWith('ms') ? 1 : 1000) : 180;
  }

  capturePositions() {
    const positions = new Map([...this.owner.cards].map(([id, card]) => [id, card.element.getBoundingClientRect()]));
    if (this.dropPosition) {
      positions.set(this.dropPosition.id, this.dropPosition.rect);
      this.dropPosition = null;
    }
    return positions;
  }

  clearMotion() {
    this.animations.forEach(animation => animation.cancel());
    this.animations.clear();
    this.owner.cards.forEach(card => {
      card.element.style.transition = '';
      card.element.style.transform = '';
      card.element.classList.remove('drag-saving-source');
    });
  }

  animateLayout(previous) {
    this.clearMotion();
    const duration = this.duration();
    const easing = getComputedStyle(this.grid).getPropertyValue('--card-motion-ease').trim() || 'cubic-bezier(0.2, 0, 0, 1)';
    // 所有布局读取完成后再写动画，避免每张卡片轮流触发布局。
    const next = this.capturePositions();
    this.owner.cards.forEach((card, id) => {
      const before = previous.get(id);
      const after = next.get(id);
      const dx = before ? before.left - after.left : 0;
      const dy = before ? before.top - after.top : 0;
      if (!duration || (!dx && !dy) || !card.element.animate) {
        card.setInteractionPaused(Boolean(this.session || this.saving));
        return;
      }
      card.setInteractionPaused(true);
      const animation = card.element.animate([
        { transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }
      ], { duration, easing });
      this.animations.set(id, animation);
      animation.finished.catch(() => {}).then(() => {
        if (this.animations.get(id) !== animation) return;
        this.animations.delete(id);
        card.setInteractionPaused(Boolean(this.session || this.saving));
      });
    });
  }

  begin(id) {
    this.cancel();
    if (this.saving || this.owner.isLoading || !this.owner.cards.has(id)) {
      this.owner.cards.get(id)?.element.classList.remove('is-dragging');
      return;
    }
    this.clearMotion();
    const rect = this.grid.getBoundingClientRect();
    const slots = [...this.owner.cards].map(([slotId, card]) => ({
      id: slotId, isFolder: card.isFolder, rect: card.element.getBoundingClientRect()
    }));
    this.session = { id, slots, ids: slots.map(slot => slot.id), gridLeft: rect.left, gridTop: rect.top, candidate: null };
    this.owner.cards.forEach(card => card.setInteractionPaused(true));
    this.grid.classList.add('drag-active');
  }

  isSideTarget(event) {
    return Boolean(event.target.closest?.('#drag-move-panel, #drag-delete-zone'));
  }

  currentSlots() {
    const rect = this.grid.getBoundingClientRect();
    const dx = rect.left - this.session.gridLeft;
    const dy = rect.top - this.session.gridTop;
    return this.session.slots.map(slot => ({ ...slot, rect: {
      left: slot.rect.left + dx, right: slot.rect.right + dx,
      top: slot.rect.top + dy, bottom: slot.rect.bottom + dy,
      width: slot.rect.width, height: slot.rect.height
    } }));
  }

  candidateAt(event) {
    const rect = this.grid.getBoundingClientRect();
    if (this.isSideTarget(event) || event.clientX < rect.left - 24 || event.clientX > rect.right + 24 ||
        event.clientY < rect.top - 24 || event.clientY > rect.bottom + 24) return null;
    if (event.target.closest?.('.grid-create-card')) {
      const lastId = this.session.ids[this.session.ids.length - 1];
      return lastId === this.session.id ? null : { targetId: lastId, action: 'after', central: false };
    }
    return hitTestSlots(this.currentSlots(), this.session.id, event.clientX, event.clientY);
  }

  onDragOver(event) {
    if (!this.session) return;
    const candidate = this.candidateAt(event);
    if (candidate || this.grid.contains(event.target)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }
    this.lastPointer = { clientX: event.clientX, clientY: event.clientY, target: event.target };
    this.updateCandidate(candidate);
  }

  updateCandidate(candidate) {
    const session = this.session;
    if (!session) return;
    const key = candidate ? `${candidate.targetId}:${candidate.central ? 'central' : candidate.action}` : '';
    if (session.key === key) return;
    session.key = key;
    clearTimeout(this.dwellTimer);
    this.clearFolderState();
    session.candidate = candidate;
    if (candidate?.central) {
      const card = this.owner.cards.get(candidate.targetId);
      card.element.classList.add('drop-pending');
      this.setLabel(card.element.getBoundingClientRect(), '停留后移入文件夹');
      this.dwellTimer = setTimeout(() => {
        if (this.session !== session || session.key !== key) return;
        session.candidate = { ...candidate, action: 'into' };
        card.element.classList.remove('drop-pending');
        card.element.classList.add('drop-into');
        this.setLabel(card.element.getBoundingClientRect(), '移入文件夹');
        this.schedulePreview();
      }, 350);
    } else {
      this.label?.remove();
    }
    this.schedulePreview();
  }

  schedulePreview() {
    if (this.previewFrame) return;
    this.previewFrame = requestAnimationFrame(() => {
      this.previewFrame = null;
      this.preview();
    });
  }

  preview() {
    if (!this.session) return;
    const { ids, id, candidate } = this.session;
    if (!candidate && !this.session.previewed) return;
    this.session.previewed = true;
    // 移入提示保留原排布，减少文件夹在进入状态时移动。
    const previewIds = candidate && !candidate.central && candidate.action !== 'into'
      ? getPreviewOrder(ids, id, candidate.targetId, candidate.action) : ids;
    const slots = this.currentSlots();
    const original = new Map(slots.map(slot => [slot.id, slot.rect]));
    const duration = this.duration();
    previewIds.forEach((cardId, index) => {
      // 原生拖拽源在松手前保持原 DOM 位置，防止浏览器取消拖拽。
      if (cardId === id) return;
      const element = this.owner.cards.get(cardId).element;
      const from = original.get(cardId);
      const to = slots[index].rect;
      element.style.transition = duration ? 'transform var(--card-motion-duration) var(--card-motion-ease)' : 'none';
      element.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px)`;
    });
    if (!candidate || candidate.action === 'into') {
      this.placeholder?.remove();
      if (candidate?.action === 'into') this.setLabel(original.get(candidate.targetId), '移入文件夹');
      return;
    }
    if (candidate.central) {
      this.placeholder?.remove();
      this.setLabel(original.get(candidate.targetId), '停留后移入文件夹');
      return;
    }
    if (!this.placeholder) {
      this.placeholder = document.createElement('div');
      this.placeholder.className = 'grid-drop-placeholder';
      this.placeholder.setAttribute('aria-hidden', 'true');
    }
    const slot = slots[previewIds.indexOf(id)].rect;
    this.position(this.placeholder, slot);
    document.body.appendChild(this.placeholder);
  }

  position(element, rect) {
    Object.assign(element.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  }

  setLabel(rect, text) {
    if (!this.label) {
      this.label = document.createElement('div');
      this.label.className = 'grid-drop-label';
    }
    this.label.textContent = text;
    Object.assign(this.label.style, { left: `${rect.left + rect.width / 2}px`, top: `${rect.bottom + 8}px` });
    document.body.appendChild(this.label);
  }

  clearFolderState() {
    this.owner.cards.forEach(card => card.element.classList.remove('drop-pending', 'drop-into'));
  }

  async onDrop(event) {
    if (!this.session) return;
    if (this.isSideTarget(event)) {
      // 侧栏需要先读 activeDragId 并派发自己的动作。
      queueMicrotask(() => this.cancel());
      return;
    }
    const hit = this.candidateAt(event);
    const previous = this.session.candidate;
    const candidate = hit && previous?.action === 'into' && hit.central && hit.targetId === previous.targetId
      ? { ...hit, action: 'into' } : hit;
    if (!candidate || (candidate.central && candidate.action !== 'into')) {
      this.cancel();
      return;
    }
    event.preventDefault();
    const draggedId = this.session.id;
    if (event.dataTransfer.getData('text/plain') !== draggedId) {
      this.cancel();
      return;
    }
    this.saving = true;
    if (candidate.action !== 'into') {
      const order = getPreviewOrder(this.session.ids, draggedId, candidate.targetId, candidate.action);
      this.dropPosition = { id: draggedId, rect: this.currentSlots()[order.indexOf(draggedId)].rect };
    }
    this.owner.cards.get(draggedId).element.classList.add('drag-saving-source');
    this.finish(true);
    try {
      await this.owner.moveCard({ draggedId, targetId: candidate.targetId, action: candidate.action });
    } finally {
      this.saving = false;
      const positions = this.capturePositions();
      this.animateLayout(positions);
    }
  }

  finish(keepPreview = false) {
    if (!this.session) return;
    this.session = null;
    this.lastPointer = null;
    clearTimeout(this.dwellTimer);
    cancelAnimationFrame(this.previewFrame);
    this.previewFrame = null;
    this.placeholder?.remove();
    this.label?.remove();
    this.clearFolderState();
    this.grid.classList.remove('drag-active');
    this.owner.cards.forEach(card => card.element.classList.remove('is-dragging'));
    EventBus.emit('drag:sessionEnd');
    if (!keepPreview) {
      const previous = this.capturePositions();
      this.animateLayout(previous);
    }
  }

  cancel() {
    this.finish();
  }

  showStatus(message) {
    if (!this.status) {
      this.status = document.createElement('div');
      this.status.className = 'grid-operation-status';
      this.status.setAttribute('role', 'status');
      document.body.appendChild(this.status);
    }
    this.status.textContent = message;
    this.status.hidden = false;
    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => { this.status.hidden = true; }, 5000);
  }
}
