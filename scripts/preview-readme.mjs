// Local screenshot fixture: production HTML, CSS and main.js; public sample data only.
// Run: node scripts/preview-readme.mjs, then open http://127.0.0.1:4179/.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const examples = [
  ['chatgpt', 'ChatGPT', 'https://chatgpt.com/'],
  ['deepseek', 'DeepSeek', 'https://chat.deepseek.com/'],
  ['kimi', 'Kimi', 'https://www.kimi.com/'],
  ['huggingface', 'Hugging Face', 'https://huggingface.co/'],
  ['gemini', 'Gemini', 'https://gemini.google.com/'],
  ['grok', 'Grok', 'https://grok.com/'],
  ['github', 'GitHub', 'https://github.com/'],
  ['figma', 'Figma', 'https://www.figma.com/'],
  ['stitch', 'Stitch', 'https://stitch.withgoogle.com/'],
  ['artstation', 'ArtStation', 'https://www.artstation.com/'],
  ['dribbble', 'Dribbble', 'https://dribbble.com/'],
  ['comfyui', 'ComfyUI', 'https://www.comfy.org/'],
  ['jimeng', '即梦AI', 'https://jimeng.jianying.com/'],
  ['runninghub', 'RunningHub', 'https://www.runninghub.cn/'],
  ['bilibili', 'BiliBili', 'https://www.bilibili.com/'],
  ['youtube', 'YouTube', 'https://www.youtube.com/'],
  ['gmail', 'Gmail', 'https://mail.google.com/'],
  ['outlook', 'Outlook', 'https://outlook.live.com/'],
  ['123pan', '123云盘', 'https://www.123pan.com/'],
  ['tencentcloud', '腾讯云', 'https://cloud.tencent.com/'],
  ['discord', 'Discord', 'https://discord.com/']
];

function installFixture(examples) {
  const defaults = { themeMode: 'dark', bookmarkIconStyle: 'clay', cardSize: '88', cardGap: '28', cardRadiusPercent: '32', cardFontFamily: 'system', cardTitleSize: '14', cardTitleTracking: '0', headerOpacity: '94' };
  for (const [key, value] of Object.entries(defaults)) localStorage.setItem(key, value);
  // Reset icon overrides on this local sample origin so screenshots use the bundled assets.
  for (const key of ['custom_icon_cache', 'site_icon_background_cache_v1']) localStorage.setItem(key, '{}');
  const sites = examples.map(([id, title, url], index) => ({ id, title, url, index: index + 3, parentId: '1' }));
  const folders = [['archive', '长期留存', [0, 1, 2, 3, 4, 5]], ['share', '分享', [14, 15, 16, 17]], ['visual', '视觉', [7, 8, 9, 10]]]
    .map(([id, title, entries], index) => ({ id, title, index, parentId: '1', children: entries.map((entry, index) => ({ ...sites[entry], id: `${id}-${sites[entry].id}`, parentId: id, index })) }));
  const tree = [{ id: '0', children: [{ id: '1', title: '书签栏', folderType: 'bookmarks-bar', children: [...folders, ...sites] }, { id: '2', title: '其他书签', folderType: 'other', children: [] }] }];
  const nodes = new Map();
  const indexNodes = node => { nodes.set(node.id, node); node.children?.forEach(indexNodes); };
  tree.forEach(indexNodes);
  const event = { addListener() {} };
  const stored = {};
  const forbidden = async () => { throw new Error('README preview: bookmark writes and navigation are disabled.'); };
  globalThis.chrome = {
    bookmarks: {
      ...Object.fromEntries(['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered'].map(name => [name, event])),
      getTree: async () => tree,
      getChildren: async id => nodes.get(id)?.children || [],
      get: async ids => [].concat(ids).map(id => nodes.get(id)).filter(Boolean),
      create: forbidden, update: forbidden, move: forbidden, remove: forbidden, removeTree: forbidden
    },
    storage: { local: {
      get: async keys => Object.fromEntries([].concat(keys).filter(key => key in stored).map(key => [key, stored[key]])),
      set: async values => Object.assign(stored, values),
      remove: async keys => [].concat(keys).forEach(key => { delete stored[key]; })
    } },
    runtime: { sendMessage: async () => ({ ok: false, reason: 'readme-preview' }) },
    tabs: { getCurrent: async () => ({ id: 1 }), create: forbidden, update: forbidden }
  };
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' };
http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let body;
    let type;
    if (pathname === '/__readme-fixture.js') {
      body = `(${installFixture.toString()})(${JSON.stringify(examples)});`;
      type = 'text/javascript';
    } else {
      const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      const relative = path.relative(root, file);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Outside repository');
      body = await fs.readFile(file);
      type = types[path.extname(file)] || 'application/octet-stream';
      if (file === path.join(root, 'index.html')) body = body.toString().replace('<script src="theme-init.js">', '<script src="/__readme-fixture.js"></script>\n  <script src="theme-init.js">');
    }
    response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}).listen(4179, '127.0.0.1', () => console.log('README screenshot fixture: http://127.0.0.1:4179/'));
