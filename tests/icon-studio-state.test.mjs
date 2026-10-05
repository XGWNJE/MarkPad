import assert from 'node:assert/strict';
import test from 'node:test';
import { setupDialog } from './helpers/dialog-harness.mjs';
import { deferred } from './helpers/grid-harness.mjs';

const bookmark = { id: 'A', title: '书签', url: 'https://site.test/' };
const uploadEvent = name => ({ target: { files: [{ name }], value: name } });

test('icon upload busy state prevents applying the previous icon and read failure allows retry', async () => {
  const gate = deferred();
  const saved = { kind: 'svg', data: '<svg id="saved"></svg>', scale: 1.5, background: { mode: 'raw' } };
  const { instance, find, writes } = await setupDialog('IconStudio', { getCustomIcon: () => saved }, { readIconUpload: () => gate.promise });
  instance.show(bookmark);
  const apply = find('[data-action="apply"]'); const label = apply.textContent;
  const inputEvent = uploadEvent('broken.svg');
  const reading = instance.handleUpload(inputEvent);
  assert.equal(apply.disabled, true);
  assert.equal(apply.getAttribute('aria-busy'), 'true');
  instance.applySelectedIcon(); assert.equal(writes.length, 0);
  gate.reject(new Error('file read failed')); await reading;
  assert.equal(apply.disabled, false);
  assert.equal(apply.getAttribute('aria-busy'), 'false');
  assert.equal(apply.textContent, label);
  assert.equal(instance.currentIcon().value, saved.data);
  assert.equal(instance.iconScale, 1.5);
  assert.equal(find('.icon-studio-status').classList.contains('error'), true);
  assert.equal(inputEvent.target.value, '');
  instance.applySelectedIcon();
  assert.equal(writes[0][0], 'custom');
  assert.equal(writes[0][2].data, saved.data);
  assert.equal(writes[0][2].scale, 1.5);
});

test('only the latest upload updates the preview and rejected validation leaves the last valid icon', async () => {
  const first = deferred(); const second = deferred(); let call = 0;
  const { instance, find } = await setupDialog('IconStudio', {}, {
    readIconUpload: () => { call++; return call === 1 ? first.promise : call === 2 ? second.promise : Promise.resolve({ ok: false, reason: '尺寸不足' }); }
  });
  instance.show(bookmark);
  assert.equal(find('.icon-studio-results').classList.contains('hidden'), true);
  assert.equal(find('.icon-studio-body').classList.contains('has-preview'), false);
  const firstRead = instance.handleUpload(uploadEvent('first.svg'));
  const secondRead = instance.handleUpload(uploadEvent('second.svg'));
  first.resolve({ ok: true, kind: 'svg', data: '<svg id="first"></svg>' }); await firstRead;
  assert.equal(find('[data-action="apply"]').disabled, true);
  assert.equal(instance.currentIcon(), null);
  second.resolve({ ok: true, kind: 'svg', data: '<svg id="second"></svg>' }); await secondRead;
  assert.equal(instance.currentIcon().value, '<svg id="second"></svg>');
  assert.equal(instance.iconScale, 1);
  assert.equal(find('.icon-studio-body').classList.contains('has-preview'), true);
  assert.equal(find('[data-action="apply"]').disabled, false);
  await instance.handleUpload(uploadEvent('bad.png'));
  assert.equal(instance.currentIcon().value, '<svg id="second"></svg>');
  assert.match(find('.icon-studio-status').textContent, /尺寸不足/);
  assert.equal(find('[data-action="apply"]').disabled, false);
});

test('late upload results cannot alter a newly opened studio or its apply state', async () => {
  const gate = deferred();
  const { instance, find } = await setupDialog('IconStudio', {}, { readIconUpload: () => gate.promise });
  instance.show(bookmark); const reading = instance.handleUpload(uploadEvent('old.svg'));
  instance.hide(); instance.show({ ...bookmark, id: 'B', title: '新书签' });
  gate.resolve({ ok: true, kind: 'svg', data: '<svg id="old"></svg>' }); await reading;
  assert.equal(instance.bookmark.id, 'B');
  assert.equal(instance.currentIcon(), null);
  assert.equal(find('[data-action="apply"]').disabled, true);
  assert.equal(find('[data-action="apply"]').getAttribute('aria-busy'), 'false');
  assert.equal(find('.icon-studio-status').textContent, '');
});

test('changing background mode cancels an old analysis without disabling the current choice', async () => {
  const gate = deferred();
  const { instance, find } = await setupDialog('IconStudio', {}, { analyzeIconBackground: () => gate.promise });
  instance.showSiteBackground(bookmark);
  const analyzing = instance.applyAutoBackground();
  assert.equal(find('[data-action="apply"]').disabled, true);
  instance.setBackgroundMode('black');
  assert.equal(find('[data-action="apply"]').disabled, false);
  gate.resolve({ ok: true, result: { type: 'solid', color: '#abc123' } }); await analyzing;
  assert.equal(instance.background.mode, 'solid');
  assert.equal(instance.background.color, '#111111');
  assert.equal(find('[data-background-mode="black"]').getAttribute('aria-pressed'), 'true');
  assert.equal(find('.icon-studio-status').textContent, '');
});

test('analysis rejection leaves the current display usable and reports retry outside the apply button', async () => {
  const { instance, find, writes } = await setupDialog('IconStudio', {}, { analyzeIconBackground: async () => { throw new Error('decode failed'); } });
  instance.showSiteBackground(bookmark); instance.setIconScale(2);
  await instance.applyAutoBackground();
  assert.equal(find('[data-action="apply"]').disabled, false);
  assert.equal(find('[data-action="apply"]').textContent, '应用图标');
  assert.equal(find('.icon-studio-status').classList.contains('error'), true);
  instance.applySelectedIcon();
  assert.equal(writes[0][0], 'background');
  assert.equal(writes[0][2].scale, 2);
});
