import assert from 'node:assert/strict';
import test from 'node:test';
import { deferred, setupGrid } from './helpers/grid-harness.mjs';
import { setupNavigation } from './helpers/navigation-harness.mjs';

test('background navigation opens immediately without animation and suppresses a duplicate click', async () => {
  const h = await setupNavigation(); const card = await h.makeBookmarkCard();
  const opening = card.open(); const duplicate = card.open();
  assert.deepEqual(h.calls, [['create', { url: 'https://a.example/', active: false }]]);
  assert.equal(duplicate, opening);
  assert.equal(h.animations.length, 0);
  assert.equal(h.clock.tasks.size, 0);
  assert.equal(await opening, true);
  assert.equal(card.opening, false);
});

test('current-page navigation immediately updates the source tab without animation or a timer', async () => {
  const h = await setupNavigation({ mode: 'current' }); const card = await h.makeBookmarkCard();
  const opening = card.open();
  assert.deepEqual(h.calls, [['getCurrent']]);
  h.setActiveTab(84);
  assert.equal(await opening, true);
  assert.deepEqual(h.calls, [['getCurrent'], ['update', 17, { url: 'https://a.example/' }]]);
  assert.equal(h.clock.now, 0);
  assert.equal(h.clock.tasks.size, 0);
  assert.equal(h.animations.length, 0);
  assert.equal(card.opening, false);
});

test('a slow source lookup navigates as soon as it resolves without a visual delay', async () => {
  const h = await setupNavigation(); const source = deferred(); const navigated = [];
  const opening = h.navigation.open(h.card, { mode: 'current', prepare: () => source.promise, navigate: tab => navigated.push(tab.id) });
  await h.flush(); assert.deepEqual(navigated, []);
  assert.equal(h.card.opening, true);
  assert.equal(h.animations.length, 0);
  assert.equal(h.clock.tasks.size, 0);
  source.resolve({ id: 7 });
  assert.equal(await opening, true);
  assert.deepEqual(navigated, [7]);
  assert.equal(h.clock.now, 0);
  assert.equal(h.card.opening, false);
});

test('reduced motion does not wait for a visual timer before using the prepared source tab', async () => {
  const h = await setupNavigation({ mode: 'current', reducedMotion: true }); const card = await h.makeBookmarkCard();
  const opening = card.open(); await h.flush();
  assert.equal(await opening, true);
  assert.deepEqual(h.calls, [['getCurrent'], ['update', 17, { url: 'https://a.example/' }]]);
  assert.equal(h.clock.now, 0);
  assert.equal(h.animations.length, 0);
  assert.equal(card.opening, false);
});

test('explicit cancel releases busy state and prevents a late preparation from navigating', async () => {
  const h = await setupNavigation(); const source = deferred(); let navigated = 0;
  const opening = h.navigation.open(h.card, { mode: 'current', prepare: () => source.promise, navigate: () => navigated++ });
  h.navigation.cancel(h.card);
  assert.equal(await opening, false);
  assert.equal(h.card.opening, false);
  source.resolve({ id: 7 }); await h.flush();
  assert.equal(navigated, 0);
  assert.equal(h.animations.length, 0);
});

test('navigation failure restores a card for a later successful click', async () => {
  const h = await setupNavigation(); let failed = true; let calls = 0;
  const navigate = () => { calls++; return failed ? Promise.reject(new Error('tab denied')) : Promise.resolve(); };
  assert.equal(await h.navigation.open(h.card, { mode: 'new', navigate }), false);
  assert.equal(h.card.opening, false);
  assert.equal(h.errors.length, 1);
  failed = false;
  const opening = h.navigation.open(h.card, { mode: 'new', navigate });
  assert.equal(await opening, true);
  assert.equal(calls, 2);
  assert.equal(h.card.opening, false);
});

test('a preparation failure restores the card without ever invoking navigation', async () => {
  const h = await setupNavigation(); let navigated = 0;
  const opening = h.navigation.open(h.card, {
    mode: 'current', prepare: () => Promise.reject(new Error('source tab unavailable')), navigate: () => navigated++
  });
  assert.equal(await opening, false);
  assert.equal(navigated, 0);
  assert.equal(h.card.opening, false);
  assert.equal(h.errors.length, 1);
});

test('current-tab API failure releases busy state and a missing ID never falls back to the active tab', async () => {
  let updates = 0;
  const failed = await setupNavigation({ mode: 'current', tabs: {
    update: () => { updates++; return Promise.reject(new Error('update denied')); }
  } });
  const failedCard = await failed.makeBookmarkCard(); const failedOpen = failedCard.open();
  assert.equal(await failedOpen, false);
  assert.equal(updates, 1);
  assert.equal(failedCard.opening, false);
  assert.equal(failed.animations.length, 0);
  const missing = await setupNavigation({ mode: 'current', tabs: { getCurrent: () => Promise.resolve({}) } });
  const missingCard = await missing.makeBookmarkCard(); const missingOpen = missingCard.open();
  assert.equal(await missingOpen, false);
  assert.equal(missing.calls.length, 0, 'an unknown source must not invoke Chrome update with an omitted ID');
  assert.equal(missingCard.opening, false);
});

for (const lifecycle of ['destroy', 'drag']) {
  test(`${lifecycle} cancels a pending source lookup and its late URL update`, async () => {
    const h = await setupNavigation({ mode: 'current' }); const card = await h.makeBookmarkCard();
    const opening = card.open();
    if (lifecycle === 'destroy') card.destroy(); else card.setInteractionPaused(true);
    assert.equal(await opening, false);
    await h.advance(1000);
    assert.equal(h.calls.some(([name]) => name === 'update'), false);
    assert.equal(card.opening, false);
  });
}

test('losing visibility retains the captured source tab and opens without a timer', async () => {
  const h = await setupNavigation({ mode: 'current' }); const card = await h.makeBookmarkCard();
  const opening = card.open(); h.setActiveTab(84);
  h.document.hidden = true; h.document.visibilityState = 'hidden'; h.document.fire('visibilitychange');
  await h.flush();
  assert.deepEqual(h.calls, [['getCurrent'], ['update', 17, { url: 'https://a.example/' }]]);
  assert.equal(h.clock.now, 0);
  assert.equal(await opening, true);
  assert.equal(h.clock.tasks.size, 0);
  assert.equal(card.opening, false);
});

test('blur does not change the prepared navigation target or add a delay', async () => {
  const h = await setupNavigation({ mode: 'current' }); const card = await h.makeBookmarkCard();
  const opening = card.open(); h.setActiveTab(84); h.window.fire('blur'); await h.flush();
  assert.deepEqual(h.calls, [['getCurrent'], ['update', 17, { url: 'https://a.example/' }]]);
  assert.equal(h.clock.now, 0);
  assert.equal(await opening, true);
  assert.equal(h.clock.tasks.size, 0);
  assert.equal(card.opening, false);
});

for (const event of ['pagehide', 'pageshow']) {
  test(`${event} releases a pending lookup and busy state without a late current-tab update`, async () => {
    const h = await setupNavigation({ mode: 'current' }); const card = await h.makeBookmarkCard();
    const opening = card.open();
    h.window.fire(event);
    assert.equal(await opening, false);
    await h.advance(1000);
    assert.equal(card.opening, false);
    assert.equal(h.element.getAttribute('aria-busy'), null);
    assert.equal(h.calls.some(([name]) => name === 'update'), false);
    assert.equal(h.animations.length, 0);
    assert.equal(h.window.listeners.get('blur')?.size || 0, 0);
    assert.equal(h.document.listeners.get('visibilitychange')?.size || 0, 0);
  });
}

test('background API rejection immediately releases busy state', async () => {
  const h = await setupNavigation({ tabs: { create: () => Promise.reject(new Error('tab denied')) } });
  const card = await h.makeBookmarkCard();
  const opening = card.open(); await h.flush();
  assert.equal(await opening, false);
  assert.equal(h.clock.now, 0);
  assert.equal(card.opening, false);
  assert.equal(h.element.getAttribute('aria-busy'), null);
  assert.equal(h.animations.length, 0);
});

test('the first touch reveals text and only the second touch enters navigation', async () => {
  const h = await setupNavigation(); const card = await h.makeBookmarkCard(); card.bindEvents();
  const tap = () => {
    h.element.fire('pointerdown', { pointerType: 'touch', clientX: 80, clientY: 80 });
    h.element.fire('pointerup'); h.element.fire('click');
  };
  tap();
  assert.equal(card.textRevealed, true);
  assert.equal(h.calls.length, 0);
  assert.equal(h.animations.length, 0);
  tap();
  assert.deepEqual(h.calls, [['create', { url: 'https://a.example/', active: false }]]);
  assert.equal(card.opening, true);
  assert.equal(h.animations.length, 0);
  await h.flush();
  assert.equal(card.opening, false);
});

test('Ctrl-click selects a card without invoking tabs or navigation animations', async () => {
  const h = await setupNavigation(); const card = await h.makeBookmarkCard(); card.bindEvents();
  h.element.fire('click', { ctrlKey: true });
  assert.equal(card.selected, true);
  assert.equal(h.events[0][0], 'card:select');
  assert.equal(h.calls.length, 0);
  assert.equal(h.animations.length, 0);
  assert.equal(card.opening, false);
});

test('folder opening navigates immediately and grid entrance runs only for a committed directory change', async () => {
  const h = await setupNavigation(); const card = await h.makeBookmarkCard({ id: 'F', title: '文件夹' });
  const opening = card.open();
  assert.equal(h.events[0][0], 'card:openFolder');
  assert.equal(h.events[0][1].id, 'F');
  await h.advance(1000); assert.equal(await opening, true);
  const grid = await setupGrid();
  assert.equal(grid.lifecycle.folderEntrances.length, 0);
  await grid.instance.refresh(); assert.equal(grid.lifecycle.folderEntrances.length, 0);
  await grid.navigate('F'); assert.equal(grid.lifecycle.folderEntrances.length, 1);
  await grid.instance.refresh(); await grid.navigate('F');
  assert.equal(grid.lifecycle.folderEntrances.length, 1);
  await grid.navigate('root'); assert.equal(grid.lifecycle.folderEntrances.length, 2);
  await grid.instance.moveCard({ draggedId: 'A', targetId: 'C', action: 'after' });
  assert.equal(grid.lifecycle.folderEntrances.length, 2);
  assert.deepEqual(grid.errors, []);
});

test('canceling a folder entrance releases all animations without changing its items', async () => {
  const h = await setupNavigation(); const grid = h.createElement('div');
  h.document.body.appendChild(grid);
  grid.appendChild(h.element);
  const before = [...grid.children];
  h.navigation.enterFolder(grid);
  assert.ok(h.animations.length > 0);
  h.navigation.cancelFolderEntrance(grid);
  await h.flush();
  assert.equal(h.animations.every(animation => animation.cancelled), true);
  assert.deepEqual(grid.children, before);
});
