import assert from 'node:assert/strict';
import test from 'node:test';

import { createCustomIconRecord, readIconUpload, validateIconUpload } from '../core/icons/IconUploadProcessor.js';

test('accepts the requested static and animated upload MIME types', () => {
  for (const type of ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
    assert.deepEqual(validateIconUpload({ type, size: 1024 }), { ok: true });
  }
  assert.equal(validateIconUpload({ type: 'image/avif', size: 1024 }).ok, false);
});

test('bitmap uploads keep the original GIF or APNG data URL instead of canvas transcoding', async () => {
  const original = 'data:image/gif;base64,animated-original-bytes';
  const result = await readIconUpload(
    { type: 'image/gif', size: 1024 },
    {
      readDataUrl: async () => original,
      loadImage: async () => ({ naturalWidth: 512, naturalHeight: 512 })
    }
  );

  assert.deepEqual(result, { ok: true, kind: 'image', data: original });
});

test('bitmap uploads still enforce original decoded dimensions', async () => {
  const result = await readIconUpload(
    { type: 'image/png', size: 1024 },
    {
      readDataUrl: async () => 'data:image/png;base64,raw',
      loadImage: async () => ({ naturalWidth: 255, naturalHeight: 256 })
    }
  );

  assert.equal(result.ok, false);
  assert.match(result.reason, /256/);
});

test('SVG uploads are sanitized while keeping safe SMIL animation markup', async () => {
  const result = await readIconUpload({
    type: 'image/svg+xml',
    size: 1024,
    text: async () => '<svg viewBox="0 0 24 24"><circle r="4"><animate attributeName="r" values="2;4;2" dur="1s" repeatCount="indefinite"/></circle><script>alert(1)</script></svg>'
  });

  assert.equal(result.ok, true);
  assert.match(result.data, /<animate\b/);
  assert.doesNotMatch(result.data, /script/i);
});

test('solid-background metadata wraps the original animated source without altering it', () => {
  const record = createCustomIconRecord({
    kind: 'image',
    data: 'data:image/png;base64,apng-bytes',
    backgroundMode: 'solid',
    backgroundColor: '#AABBCC'
  });

  assert.equal(record.data, 'data:image/png;base64,apng-bytes');
  assert.deepEqual(record.background, { mode: 'solid', color: '#aabbcc' });
});
