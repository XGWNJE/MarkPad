import assert from 'node:assert/strict';
import test from 'node:test';
import { setupDialog } from './helpers/dialog-harness.mjs';

for (const component of ['EditDialog', 'MoveDialog', 'IconStudio']) {
  test(`${component} announces a named modal dialog`, async () => {
    const { dialog, find } = await setupDialog(component);
    assert.equal(dialog.getAttribute('role'), 'dialog');
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    const headingId = dialog.getAttribute('aria-labelledby');
    assert.ok(headingId);
    assert.ok(find(`#${headingId}`));
  });
  test(`${component} returns focus to settings when its original control becomes inert`, async () => {
    const { instance, document, trigger } = await setupDialog(component);
    const hiddenControl = document.createElement('button');
    document.body.appendChild(hiddenControl);
    hiddenControl.closest = () => ({ inert: true });
    instance.returnFocus = hiddenControl;
    const before = trigger.focusCount;
    instance.hide();
    assert.equal(hiddenControl.focusCount || 0, 0);
    assert.equal(trigger.focusCount, before + 1);
    assert.equal(document.activeElement, trigger);
  });
}
