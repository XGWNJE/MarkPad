import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Element as BaseElement } from './grid-harness.mjs';
import { createCustomIconRecord, isValidHexColor, normalizeIconScale } from '../../core/icons/IconUploadProcessor.js';
import { backgroundCssValue, cloneIconBackground, getIconScale } from '../../core/icons/IconBackground.js';

// A small DOM stand-in for state tests. Layout, clipping, and focus-ring rendering
// are intentionally left to browser acceptance rather than simulated here.
export class Element extends BaseElement {
  constructor(tagName = 'div') {
    super(tagName.toUpperCase());
    this.value = '';
    this.disabled = false;
  }

  get id() { return this.getAttribute('id'); }
  set id(value) { this.setAttribute('id', value); }
  get textContent() { return this.text || this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.text = String(value); this.replaceChildren(); }
  get innerHTML() { return this.html || this.text || ''; }
  set innerHTML(value) {
    this.html = value;
    this.text = '';
    this.replaceChildren();
    const stack = [this];
    for (const token of value.match(/<[^>]*>|[^<]+/g) || []) {
      if (token.startsWith('</')) { stack.pop(); continue; }
      if (!token.startsWith('<')) { stack.at(-1).text = (stack.at(-1).text || '') + token; continue; }
      const tag = token.match(/^<([\w-]+)/)?.[1];
      if (!tag) continue;
      const child = new Element(tag);
      for (const match of token.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
        if (match.index === 1) continue;
        child.setAttribute(match[1], match[2] ?? '');
        if (match[1] === 'disabled') child.disabled = true;
        if (match[1] === 'value') child.value = match[2];
      }
      stack.at(-1).appendChild(child);
      if (!['input', 'img', 'br', 'hr'].includes(tag) && !token.endsWith('/>')) stack.push(child);
    }
  }

  prepend(child) { this.insertBefore(child, this.firstChild); }
  select() { this.selected = true; }
  focus() { super.focus(); if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map(item => item.trim());
    const match = (node, part) => {
      if (part.endsWith(':not([disabled])')) return !node.disabled && match(node, part.slice(0, -':not([disabled])'.length));
      if (part.startsWith('.')) return node.classList.contains(part.slice(1));
      if (part.startsWith('#')) return node.id === part.slice(1);
      const attribute = part.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
      if (attribute) return attribute[2] === undefined ? node.getAttribute(attribute[1]) !== null : node.getAttribute(attribute[1]) === attribute[2];
      return node.tagName.toLowerCase() === part.toLowerCase();
    };
    const matches = node => selectors.some(item => {
      const parts = item.split(/\s+/);
      if (!match(node, parts.pop())) return false;
      let ancestor = node.parentElement;
      while (parts.length) {
        const part = parts.pop();
        while (ancestor && !match(ancestor, part)) ancestor = ancestor.parentElement;
        if (!ancestor) return false;
        ancestor = ancestor.parentElement;
      }
      return true;
    });
    const result = [];
    const visit = parent => parent.children.forEach(child => { if (matches(child)) result.push(child); visit(child); });
    visit(this);
    return result;
  }
  dispatch(name, details = {}) {
    if (name === 'click' && this.disabled) return;
    for (const listener of this.listeners.get(name) || []) listener({ target: this, preventDefault() {}, ...details });
  }
  click() { this.dispatch('click'); }
}

export async function setupDialog(name, storeOverrides = {}, dependencyOverrides = {}) {
  const body = new Element('body'); body.connected = true;
  const events = [];
  const listeners = new Map();
  const EventBus = {
    on(event, listener) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(listener); },
    emit(event, payload) { events.push([event, payload]); for (const listener of listeners.get(event) || []) listener(payload); }
  };
  const document = {
    body, activeElement: null,
    createElement(tag) { const element = new Element(tag); element.ownerDocument = document; return element; },
    getElementById(id) { return body.querySelector(`#${id}`); },
    addEventListener() {}
  };
  const trigger = document.createElement('button'); trigger.id = 'menu-trigger'; body.appendChild(trigger); trigger.focus();
  if (name !== 'IconStudio') {
    const dialog = document.createElement('div'); dialog.className = 'dialog hidden'; dialog.id = name === 'EditDialog' ? 'edit-dialog' : 'move-dialog';
    dialog.innerHTML = `<div class="dialog-overlay"></div><div class="dialog-content"><div class="dialog-header"><h3 id="edit-dialog-title"></h3><button data-action="close"></button></div><div class="dialog-body">${name === 'EditDialog' ? '<div><input id="edit-title"></div><div><input id="edit-url"></div>' : '<div id="move-dialog-tree"></div>'}</div><div class="dialog-footer"><button data-action="cancel">取消</button><button id="${name === 'EditDialog' ? 'edit-dialog-confirm' : 'move-dialog-confirm'}">确认</button></div></div>`;
    body.appendChild(dialog);
  }
  const writes = [];
  const store = {
    async update(...args) { writes.push(['update', ...args]); },
    async move(...args) { writes.push(['move', ...args]); },
    async getFolderTree() { return [{ id: 'root', title: '书签栏', children: [{ id: 'F', title: '文件夹' }] }]; },
    async getNode(id) { return { id, title: id, parentId: 'root' }; },
    getCustomIcon() { return null; }, getSiteIcon() { return { kind: 'image', value: 'https://site.test/icon.png' }; }, getSiteIconBackground() { return { mode: 'raw' }; },
    setCustomIcon(...args) { writes.push(['custom', ...args]); }, setSiteIconBackground(...args) { writes.push(['background', ...args]); },
    ...storeOverrides
  };
  const context = vm.createContext({
    document, EventBus, BookmarkStore: store, Router: { getCurrent: () => ({ id: 'root' }) },
    iconSvg: () => '', getLibraryIconCandidates: () => ({ candidates: [] }),
    createCustomIconRecord, isValidHexColor, normalizeIconScale, backgroundCssValue, cloneIconBackground, getIconScale,
    readIconUpload: async () => ({ ok: true, kind: 'svg', data: '<svg></svg>' }),
    analyzeIconBackground: async () => ({ ok: true, result: { type: 'solid', color: '#445566' } }),
    isSvgRaw: value => /^<svg/.test(value), window: {}, URL, console: { error() {} },
    ...dependencyOverrides
  });
  const source = (await readFile(new URL(`../../components/${name}.js`, import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '').replace(`export default ${name};`, `globalThis.Component = ${name};`);
  vm.runInContext(source, context, { filename: `${name}.js` });
  const instance = new context.Component();
  // Nodes parsed from the template inherit document focus behavior.
  const setOwner = node => { node.ownerDocument = document; node.children.forEach(setOwner); }; setOwner(body);
  return { instance, document, events, writes, store, trigger, dialog: instance.dialog, find: selector => instance.dialog.querySelector(selector) };
}
