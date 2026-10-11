import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function readProjectFile(path) {
  return await readFile(new URL(path, root), 'utf8');
}

test('version metadata is documented from the manifest version', async () => {
  const manifest = JSON.parse(await readProjectFile('manifest.json'));
  const readme = await readProjectFile('README.md');
  const agents = await readProjectFile('AGENTS.md');
  const version = manifest.version;
  const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.ok(readme.includes(`当前版本：\`${version}\``));
  // 徽章底色可自由调整，但标签必须带上 manifest 版本并链接 manifest.json
  assert.match(readme, new RegExp(`\\[!\\[版本：${escaped(version)}\\]\\(https://img\\.shields\\.io/badge/version-${escaped(version)}-[0-9a-f]{6}\\)\\]\\(manifest\\.json\\)`));
  assert.match(readme, /actions\/workflows\/ci\.yml\/badge\.svg/);
  assert.match(readme, /\[manifest\.json\]\(manifest\.json\)/);
  assert.match(agents, /manifest\.json` 的 `version` 是安装版本号来源/);
  assert.doesNotMatch(readme, /CHANGELOG\.md|完整变更记录|\[Unreleased\]/);
  assert.match(agents, /文档只描述当前真实状态/);
});
