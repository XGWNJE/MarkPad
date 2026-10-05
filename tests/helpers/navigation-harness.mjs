import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Element as BaseElement, deferred } from './grid-harness.mjs';

class Clock {
  constructor() { this.now = 0; this.sequence = 0; this.tasks = new Map(); }
  setTimeout(callback, delay = 0) {
    const id = ++this.sequence;
    this.tasks.set(id, { callback, at: this.now + Math.max(0, delay) });
    return id;
  }
  clearTimeout(id) { this.tasks.delete(id); }
  advance(amount) {
    const until = this.now + amount;
    while (true) {
      const entry = [...this.tasks].filter(([, task]) => task.at <= until)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
      if (!entry) break;
      this.tasks.delete(entry[0]); this.now = entry[1].at; entry[1].callback();
    }
    this.now = until;
  }
}

class MotionElement extends BaseElement {
  constructor(clock, animations, tag = 'div') { super(tag); this.clock = clock; this.animations = animations; }
  animate(keyframes, options) {
    const gate = deferred();
    // The real module uses a timer rather than reading Animation.finished.
    // Native finished promises are lazy; keep this eagerly created fake quiet.
    gate.promise.catch(() => {});
    const animation = { keyframes, options, target: this, cancelled: false, finished: gate.promise };
    const timer = this.clock.setTimeout(gate.resolve, options.duration || 0);
    animation.cancel = () => {
      if (animation.cancelled) return;
      animation.cancelled = true; this.clock.clearTimeout(timer); gate.reject(new Error('Animation cancelled'));
    };
    this.animations.push(animation);
    return animation;
  }
  fire(name, details = {}) {
    const event = { target: this, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...details };
    for (const callback of [...this.listeners.get(name) || []]) callback(event);
    return event;
  }
}

export async function setupNavigation({ reducedMotion = false, mode = 'new', tabs: tabOverrides = {} } = {}) {
  const clock = new Clock(); const animations = []; const errors = []; const calls = []; const events = [];
  const createElement = tag => new MotionElement(clock, animations, tag);
  const document = createElement('document'); document.hidden = false; document.visibilityState = 'visible';
  document.documentElement = createElement('html'); document.body = createElement('body'); document.body.connected = true;
  document.createElement = createElement; document.getElementById = () => null;
  const content = createElement('div'); content.className = 'grid-scroll-inner'; document.body.appendChild(content);
  const toolbar = createElement('div'); toolbar.className = 'toolbar'; document.body.appendChild(toolbar);
  document.querySelector = selector => selector === '.grid-scroll-inner' ? content : selector === '.toolbar' ? toolbar : null;
  const window = createElement('window');
  window.matchMedia = () => ({ matches: reducedMotion });
  window.setTimeout = clock.setTimeout.bind(clock); window.clearTimeout = clock.clearTimeout.bind(clock);
  let activeTabId = 17;
  const tabs = {
    getCurrent() { calls.push(['getCurrent']); return Promise.resolve({ id: activeTabId }); },
    create(details) { calls.push(['create', structuredClone(details)]); return Promise.resolve({ id: 99, ...details }); },
    update(id, details) { calls.push(['update', id, structuredClone(details)]); return Promise.resolve({ id, ...details }); },
    ...tabOverrides
  };
  const effects = { setPaused() {}, releaseTransform() {} };
  const context = vm.createContext({
    document, window, chrome: { tabs }, AbortController,
    localStorage: { getItem: () => mode },
    console: { error: (...args) => errors.push(args), warn() {}, log() {} },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    setTimeout: clock.setTimeout.bind(clock), clearTimeout: clock.clearTimeout.bind(clock),
    requestAnimationFrame: callback => clock.setTimeout(() => callback(clock.now), 16), cancelAnimationFrame: clock.clearTimeout.bind(clock),
    queueMicrotask, performance: { now: () => clock.now },
    EventBus: { emit: (name, payload) => events.push([name, payload]) },
    CardEffects: { attach: () => effects, detach() {} },
    releaseMenu() {}, activateMenu() {}, bindMenuKeyboard() {},
    BookmarkStore: {}, URL
  });
  const source = (await readFile(new URL('../../components/CardNavigation.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '').replace(/^export default (.+);\s*$/m, 'globalThis.CardNavigation = $1;');
  vm.runInContext(source, context, { filename: 'CardNavigation.js' });
  const navigation = context.CardNavigation;
  const element = createElement('div'); element.className = 'bookmark-card'; document.body.appendChild(element);
  const surface = createElement('div'); surface.className = 'card-surface'; element.appendChild(surface);
  const states = [];
  const card = { element, destroyed: false, interactionPaused: false, opening: false,
    setOpening(value) { this.opening = value; states.push(value); } };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const advance = async amount => { clock.advance(amount); await flush(); };
  const makeBookmarkCard = async (data = { id: 'A', title: 'A', url: 'https://a.example/' }) => {
    if (!context.BookmarkCard) {
      const source = (await readFile(new URL('../../components/BookmarkCard.js', import.meta.url), 'utf8'))
        .replace(/^import .*;\r?\n/gm, '').replace('export default BookmarkCard;', 'globalThis.BookmarkCard = BookmarkCard;');
      vm.runInContext(source, context, { filename: 'BookmarkCard.js' });
    }
    const result = new context.BookmarkCard(data);
    result.element = element; result.effects = effects;
    return result;
  };
  return { navigation, card, element, surface, content, toolbar, document, window, clock, tabs, calls, events, animations, errors, states,
    createElement, flush, advance, makeBookmarkCard, setActiveTab(id) { activeTabId = id; } };
}
