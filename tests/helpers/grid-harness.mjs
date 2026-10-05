import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { getMoveDestination, getPreviewOrder } from '../../core/DragOrder.js';

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export class Element {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.parentElement = null;
    this.classes = new Set();
    this.style = { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; }, getPropertyValue(name) { return this[name] || ''; } };
    this.classList = {
      add: (...names) => names.forEach(name => this.classes.add(name)),
      remove: (...names) => names.forEach(name => this.classes.delete(name)),
      contains: name => this.classes.has(name),
      toggle: (name, force) => { const enabled = force ?? !this.classes.has(name); if (enabled) this.classes.add(name); else this.classes.delete(name); return enabled; },
      replace: (oldName, newName) => { if (!this.classes.delete(oldName)) return false; this.classes.add(newName); return true; }
    };
  }

  get className() { return [...this.classes].join(' '); }
  set className(value) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
  get parent() { return this.parentElement; }
  get isConnected() { return this.connected || Boolean(this.parentElement?.isConnected); }
  get nextSibling() { const siblings = this.parentElement?.children || []; return siblings[siblings.indexOf(this) + 1] || null; }
  get firstChild() { return this.children[0] || null; }
  get childNodes() { return this.children; }
  get innerHTML() { return this.html || ''; }
  set innerHTML(value) { this.html = value; this.replaceChildren(); }

  appendChild(child) {
    if (child.fragment) { for (const item of [...child.children]) this.appendChild(item); return child; }
    child.remove();
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  append(...children) { children.forEach(child => this.appendChild(child)); }
  insertBefore(child, reference) {
    if (child === reference) return child;
    child.remove();
    const index = reference ? this.children.indexOf(reference) : this.children.length;
    if (index < 0) throw new Error('insertBefore reference is not a child');
    child.parentElement = this;
    this.children.splice(index, 0, child);
    return child;
  }
  removeChild(child) { const index = this.children.indexOf(child); if (index < 0) throw new Error('Not a child'); this.children.splice(index, 1); child.parentElement = null; return child; }
  remove() { if (this.parentElement) this.parentElement.removeChild(this); }
  replaceChildren(...children) { for (const child of [...this.children]) child.remove(); this.append(...children); }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'class') this.className = String(value);
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  querySelectorAll(selector) {
    const directOnly = selector.startsWith(':scope > ');
    const selectors = selector.replace(/^:scope > /, '').split(',').map(item => item.trim());
    const matches = child => selectors.some(item => item.startsWith('.') ? child.classList.contains(item.slice(1)) : item === '[data-id]' ? Boolean(child.dataset.id) : child.tagName === item);
    const result = [];
    const visit = parent => { for (const child of parent.children) { if (matches(child)) result.push(child); if (!directOnly) visit(child); } };
    visit(this);
    return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getBoundingClientRect() { const index = this.parentElement?.children.indexOf(this) || 0; return { left: index * 140, top: 0, width: 120, height: 120, right: index * 140 + 120, bottom: 120 }; }
  addEventListener(name, listener) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(listener); }
  removeEventListener(name, listener) { this.listeners.get(name)?.delete(listener); }
  click() { for (const listener of this.listeners.get('click') || []) listener({ target: this }); }
  focus() { this.focusCount = (this.focusCount || 0) + 1; }
}

const copy = value => structuredClone(value);
export const bookmark = id => ({ id, title: id, url: `https://${id.toLowerCase()}.example` });
export const defaultFolders = () => ({ root: [bookmark('A'), bookmark('B'), { id: 'F', title: 'F' }, bookmark('C'), { id: 'G', title: 'G' }], F: [bookmark('F1')], G: [], other: [bookmark('X')] });

export async function setupGrid({ folders = defaultFolders(), rootId = 'root', eventTiming = 'early' } = {}) {
  const grid = new Element();
  grid.connected = true;
  grid.id = 'bookmark-grid';
  grid.className = 'bookmark-grid';
  const status = new Element();
  const errors = [];
  const eventListeners = new Map();
  const pendingEvents = new Set();
  const emitted = [];
  const EventBus = {
    on(name, listener) { if (!eventListeners.has(name)) eventListeners.set(name, new Set()); eventListeners.get(name).add(listener); return () => eventListeners.get(name).delete(listener); },
    emit(name, details) {
      emitted.push([name, details]);
      for (const listener of eventListeners.get(name) || []) {
        try {
          const result = listener(details);
          if (result?.then) {
            const pending = Promise.resolve(result).catch(error => errors.push(error)).finally(() => pendingEvents.delete(pending));
            pendingEvents.add(pending);
          }
        } catch (error) { errors.push(error); }
      }
    }
  };
  let currentId = rootId;
  const Router = {
    getRootId: () => rootId,
    getCurrent: () => ({ id: currentId }),
    push(id) { currentId = id; EventBus.emit('navigate', { id }); },
    goToIndex() { currentId = rootId; EventBus.emit('navigate', { id: rootId }); }
  };
  const lists = new Map(Object.entries(folders).map(([id, children]) => [id, children.map(child => child.id)]));
  const nodes = new Map(Object.entries(folders).map(([id]) => [id, { id, title: id }]));
  for (const children of Object.values(folders)) for (const child of children) nodes.set(child.id, copy(child));
  const normalize = () => { for (const [parentId, ids] of lists) ids.forEach((id, index) => Object.assign(nodes.get(id), { parentId, index })); };
  normalize();
  const get = id => { const node = nodes.get(id); if (!node) throw new Error(`Can't find bookmark for id: ${id}`); return copy(node); };
  const moveCalls = [];
  const getCalls = [];
  const readCalls = [];
  const queuedEvents = [];
  const childGates = new Map();
  const renderGates = new Map();
  let nextMoveError = null;
  let nextGetError = null;
  let nextChildrenError = null;
  let moveGate = null;
  const model = {
    order: id => [...(lists.get(id) || [])],
    node: get,
    moveCalls, getCalls, readCalls,
    rejectNextMove(error = new Error('Move denied')) { nextMoveError = error; },
    rejectNextGet(error = new Error('Node unavailable')) { nextGetError = error; },
    rejectNextChildren(error = new Error('Read denied')) { nextChildrenError = error; },
    gateNextMove() { const gate = deferred(); const started = deferred(); moveGate = { gate, started }; return { started: started.promise, release: gate.resolve }; },
    gateChildren(id) { const gate = deferred(); const started = deferred(); childGates.set(id, { gate, started }); return { started: started.promise, release: gate.resolve }; },
    gateRender(id) { const gate = deferred(); const started = deferred(); renderGates.set(id, { gate, started }); return { started: started.promise, release: gate.resolve }; },
    async flushMovedEvents() { for (const details of queuedEvents.splice(0)) EventBus.emit('moved', details); await settle(); },
    async move(id, parentId, requestedIndex) {
      moveCalls.push({ id, parentId, index: requestedIndex });
      if (moveGate) { const currentGate = moveGate; moveGate = null; currentGate.started.resolve(); await currentGate.gate.promise; }
      if (nextMoveError) { const error = nextMoveError; nextMoveError = null; throw error; }
      const source = get(id);
      const destinationId = parentId ?? source.parentId;
      const oldChildren = lists.get(source.parentId);
      const newChildren = lists.get(destinationId);
      if (!newChildren) throw new Error('Invalid destination folder');
      const oldIndex = oldChildren.indexOf(id);
      let index = requestedIndex ?? newChildren.length;
      if (!Number.isInteger(index) || index < 0 || index > newChildren.length) throw new Error('Invalid bookmark index');
      // Chromium BookmarkModel::Move accepts insertion slots in the original
      // children list. It adjusts forward moves itself and emits no event for
      // an unchanged slot. The model deliberately does not use DragOrder.js.
      if (oldChildren === newChildren && (index === oldIndex || index === oldIndex + 1)) return get(id);
      if (oldChildren === newChildren && index > oldIndex) index--;
      oldChildren.splice(oldIndex, 1);
      newChildren.splice(index, 0, id);
      normalize();
      const details = { id, parentId: destinationId, index, oldParentId: source.parentId, oldIndex };
      if (eventTiming === 'early') EventBus.emit('moved', details);
      else queuedEvents.push(details);
      return get(id);
    },
    async externalMove(id, parentId, index) { await model.move(id, parentId, index); await model.flushMovedEvents(); }
  };
  const BookmarkStore = {
    async getChildren(id) {
      readCalls.push(id);
      if (nextChildrenError) { const error = nextChildrenError; nextChildrenError = null; throw error; }
      if (!lists.has(id)) throw new Error(`Can't find folder for id: ${id}`);
      const children = lists.get(id).map(get);
      const gate = childGates.get(id);
      if (gate) { childGates.delete(id); gate.started.resolve(); await gate.gate.promise; }
      return children;
    },
    async getNode(id) { return nodes.has(id) ? get(id) : null; },
    async getFolderChildCountMap() { return new Map([...lists].map(([id, children]) => [id, children.length])); },
    move: (...args) => model.move(...args)
  };
  const chrome = { bookmarks: { async get(ids) {
    getCalls.push(copy(ids));
    if (nextGetError) { const error = nextGetError; nextGetError = null; throw error; }
    return (Array.isArray(ids) ? ids : [ids]).map(get);
  } } };
  const lifecycle = { created: [], rendered: [], destroyed: [], observed: [], updated: [], folderEntrances: [] };
  class BookmarkCard {
    constructor(data, container, options = {}) {
      this.data = copy(data);
      this.options = copy(options);
      this.container = container;
      this.isFolder = !data.url;
      this.selected = false;
      this.element = null;
      lifecycle.created.push(this);
    }
    async render() {
      const gate = renderGates.get(this.data.id);
      if (gate) { renderGates.delete(this.data.id); gate.started.resolve(); await gate.gate.promise; }
      this.element = new Element();
      this.element.className = 'bookmark-card';
      this.element.dataset.id = this.data.id;
      lifecycle.rendered.push(this);
      return this.element;
    }
    async update(data) { this.data = { ...this.data, ...copy(data) }; if ('childCount' in data) this.options.childCount = data.childCount; lifecycle.updated.push(this); }
    resolveSiteIconWhenVisible() { if (!this.element?.isConnected) throw new Error('Observed website icon before mounting'); lifecycle.observed.push(this); }
    releaseEffectsTransform() {}
    clearDropIndicator() {}
    updateIcon() {}
    destroy() { lifecycle.destroyed.push(this); this.element?.remove(); }
  }
  class GridDragController {
    constructor(owner) { this.owner = owner; }
    capturePositions() { return new Map(); }
    animateLayout() {}
    showStatus(message) { status.textContent = message; }
    cancel() {}
  }
  const CardNavigation = {
    open(_card, { mode, prepare, navigate }) {
      if (mode === 'current') return Promise.resolve(prepare?.()).then(value => navigate(value)).then(() => true);
      return Promise.resolve(navigate()).then(() => true);
    },
    cancel() {},
    enterFolder(element) { lifecycle.folderEntrances.push(element.children.map(child => child.dataset.id || child.dataset.createKind)); },
    cancelFolderEntrance() {}
  };
  const document = {
    getElementById: id => id === 'bookmark-grid' ? grid : status,
    createElement: tag => new Element(tag),
    createDocumentFragment: () => Object.assign(new Element(), { fragment: true }),
    addEventListener() {}, removeEventListener() {}, querySelectorAll: selector => grid.querySelectorAll(selector)
  };
  const source = await readFile(new URL('../../components/BookmarkGrid.js', import.meta.url), 'utf8');
  const context = vm.createContext({
    document, EventBus, BookmarkStore, Router, BookmarkCard, GridDragController, CardNavigation,
    getMoveDestination, getPreviewOrder, chrome,
    iconSvg: name => `<svg data-icon="${name}"></svg>`,
    console: { error: (...args) => errors.push(args), warn: (...args) => errors.push(args), log() {} },
    requestAnimationFrame: callback => { callback(0); return 1; }, cancelAnimationFrame() {},
    setTimeout, clearTimeout, queueMicrotask,
    window: { setTimeout, clearTimeout, matchMedia: () => ({ matches: true }), addEventListener() {}, removeEventListener() {} }
  });
  vm.runInContext(source.replace(/^import[\s\S]*?;\r?\n/gm, '').replace('export default BookmarkGrid;', 'globalThis.BookmarkGrid = BookmarkGrid;'), context);
  const instance = new context.BookmarkGrid();
  await instance.ready;
  async function settle() {
    await new Promise(resolve => setImmediate(resolve));
    while (pendingEvents.size) await Promise.all([...pendingEvents]);
    await new Promise(resolve => setImmediate(resolve));
  }
  return {
    instance, grid, model, lifecycle, errors, emitted, status, EventBus, settle,
    order: () => grid.children.filter(child => child.classList.contains('bookmark-card')).map(child => child.dataset.id),
    fullOrder: () => grid.children.map(child => child.dataset.id || child.dataset.createKind),
    async navigate(id) { currentId = id; await instance.loadFolder(id); },
    startNavigate(id) { currentId = id; return instance.loadFolder(id); }
  };
}
