import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

class Element {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.listeners = new Map();
    this.classList = { add() {}, remove() {} };
  }

  set innerHTML(value) {
    this.html = value;
    this.children = [];
  }

  appendChild(child) {
    child.parent = this;
    this.children.push(child);
  }

  insertBefore(child, reference) {
    this.children.splice(this.children.indexOf(child), 1);
    const index = reference ? this.children.indexOf(reference) : this.children.length;
    this.children.splice(index, 0, child);
  }

  get nextSibling() {
    return this.parent.children[this.parent.children.indexOf(this) + 1] || null;
  }

  querySelectorAll(selector) {
    return this.children.filter(child => child.className === selector.slice(1));
  }

  getBoundingClientRect() {
    return { left: 0, top: 0 };
  }

  addEventListener(event, listener) {
    this.listeners.set(event, listener);
  }

  click() {
    this.listeners.get('click')?.();
  }
}

async function setup(folders) {
  const grid = new Element();
  const events = [];
  let currentId = 'root';
  const source = await readFile(new URL('../components/BookmarkGrid.js', import.meta.url), 'utf8');
  const context = vm.createContext({
    document: { getElementById: () => grid, createElement: tag => new Element(tag) },
    EventBus: { on() {}, emit: event => events.push(event) },
    BookmarkStore: {
      getChildren: async id => folders[id],
      getNode: async id => ({ id }),
      getFolderChildCountMap: async () => new Map()
    },
    Router: {
      getRootId: () => 'root',
      getCurrent: () => ({ id: currentId })
    },
    BookmarkCard: class {
      constructor(data) {
        this.data = data;
        this.isFolder = !data.url;
        this.element = new Element();
        this.element.className = 'bookmark-card';
        this.element.dataset.id = data.id;
      }
      async render() { return this.element; }
      resolveSiteIconWhenVisible() {}
      releaseEffectsTransform() {}
    },
    iconSvg: name => `<svg data-icon="${name}"></svg>`,
    console,
    requestAnimationFrame: callback => callback(),
    window: { setTimeout: callback => callback() }
  });
  vm.runInContext(source.replace(/^import .*;\n/gm, '').replace('export default BookmarkGrid;', 'globalThis.BookmarkGrid = BookmarkGrid;'), context);
  const instance = new context.BookmarkGrid();
  await instance.ready;
  return { instance, grid, events, navigate: async id => { currentId = id; await instance.loadFolder(id); } };
}

const bookmark = id => ({ id, title: id, url: `https://${id}.example` });
const order = grid => grid.children.map(child => child.dataset.id || child.dataset.createKind);

test('creation cards follow bookmarks and dispatch the existing dialog actions', async () => {
  const { instance, grid, events } = await setup({ root: [bookmark('a'), bookmark('b')] });
  assert.deepEqual(order(grid), ['a', 'b', 'bookmark', 'folder']);
  assert.equal(instance.cards.size, 2);
  const actions = grid.querySelectorAll('.grid-create-card');
  for (const action of actions) {
    assert.equal(action.tagName, 'button');
    assert.equal(action.type, 'button');
    assert.equal(action.draggable, false);
    action.click();
  }
  assert.deepEqual(events, ['toolbar:newBookmark', 'toolbar:newFolder']);
  instance.selectAll();
  assert.deepEqual([...instance.selectedCards], ['a', 'b']);
});

test('empty folders retain both creation actions and refresh does not duplicate them', async () => {
  const { instance, grid, navigate } = await setup({ root: [bookmark('a')], empty: [] });
  await navigate('empty');
  assert.deepEqual(order(grid), ['bookmark', 'folder']);
  assert.equal(instance.cards.size, 0);
  await instance.refresh();
  assert.deepEqual(order(grid), ['bookmark', 'folder']);
  await navigate('root');
  assert.deepEqual(order(grid), ['a', 'bookmark', 'folder']);
});

test('moving a bookmark after the last bookmark preserves creation actions at the end', async () => {
  const { instance, grid } = await setup({ root: [bookmark('a'), bookmark('b'), bookmark('c')] });
  instance.applyOptimisticReorder('a', 'c', 'after');
  assert.deepEqual(order(grid), ['b', 'c', 'a', 'bookmark', 'folder']);
  instance.applyOptimisticReorder('a', 'b', 'before');
  assert.deepEqual(order(grid), ['a', 'b', 'c', 'bookmark', 'folder']);
  assert.equal(instance.cards.size, 3);
});
