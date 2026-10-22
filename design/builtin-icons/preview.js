import { BUILTIN_ICON_CATALOG as catalog } from '../../core/icons/BuiltinIconCatalog.js';
import { getLibraryIconById } from '../../core/icons/IconLibraryProvider.js';

// This page uses production components with an in-memory Chrome API fixture.
// It never connects to the user's bookmark store or any exported address.
const event = { addListener() {} };
const sampleIds = ['chatgpt', 'deepseek', 'huggingface', 'github', 'figma', 'bilibili', 'youtube', '123pan', 'gmail', 'outlook', 'tencentcloud', 'visionguard', 'archive', 'share', 'visual'];
const nodes = catalog.map(icon => ({ id: icon.id, title: icon.title, parentId: 'preview', ...(icon.kind === 'website' ? { url: `https://example.invalid/${icon.id}` } : { children: [] }) }));
const manual = [
  { id: 'manual-console', title: '控制台', url: 'https://example.invalid/console', parentId: 'preview' },
  { id: 'manual-cloud', title: '服务器 - 轻量云 - 控制台', url: 'https://example.invalid/cloud', parentId: 'preview' },
  { id: 'manual-tripo', title: 'AI 3D模型生成器', url: 'https://example.invalid/3d', parentId: 'preview' }
];
const samples = sampleIds.map(id => nodes.find(node => node.id === id));
let selectedNodes = samples;
const forbidden = async () => { throw new Error('对照页只使用测试数据，禁止写入书签。'); };
globalThis.chrome = {
  bookmarks: {
    ...Object.fromEntries(['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered'].map(key => [key, event])),
    getTree: async () => [{ id: '0', children: [{ id: 'preview', title: '图标对照', children: [...nodes, ...manual] }] }],
    getChildren: async id => id === 'preview' ? selectedNodes : [],
    get: async ids => [...nodes, ...manual].filter(node => [].concat(ids).includes(node.id)),
    create: forbidden, update: forbidden, move: forbidden, remove: forbidden, removeTree: forbidden
  },
  storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
  runtime: { sendMessage: async () => ({ ok: false, reason: 'isolated-preview' }) },
  tabs: { create: forbidden, update: forbidden }
};

const html = new DOMParser().parseFromString(await (await fetch('../../index.html')).text(), 'text/html');
html.body.querySelectorAll('script').forEach(script => script.remove());
document.body.replaceChildren(...html.body.children);
const [
  { default: BookmarkStore }, { default: Router }, { default: EventBus },
  { default: BookmarkGrid }, { default: SettingsPanel }, { default: IconStudio }, { setPanelVisible, activateMenu, closeMenus }, { iconSvg }
] = await Promise.all([
  import('../../core/BookmarkStore.js'), import('../../core/Router.js'), import('../../core/EventBus.js'),
  import('../../components/BookmarkGrid.js'), import('../../components/SettingsPanel.js'), import('../../components/IconStudio.js'), import('../../core/MenuInteraction.js'), import('../../core/IconLibrary.js')
]);
BookmarkStore.customIcons = new Map();
BookmarkStore.siteIconBackgrounds = new Map();
BookmarkStore.siteIcons = new Map();
BookmarkStore.resolveSiteIcon = async () => null;
Router.setRoot('preview', '图标对照');
const grid = new BookmarkGrid();
new SettingsPanel();
new IconStudio();
await grid.ready;
document.getElementById('app').classList.remove('page-enter-pending');
document.getElementById('breadcrumb').textContent = 'MarkPad / 内置图标';
document.getElementById('breadcrumb').classList.add('visible');
document.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = iconSvg(element.dataset.icon); });
const panel = document.getElementById('menu-panel');
const trigger = document.getElementById('menu-trigger');
trigger.addEventListener('click', () => {
  if (panel.classList.contains('visible')) closeMenus();
  else {
    setPanelVisible(panel, trigger, true);
    activateMenu(panel, returnFocus => setPanelVisible(panel, trigger, false, { returnFocus }), { trigger });
  }
});
EventBus.on('settings:close', () => closeMenus({ returnFocus: true }));
EventBus.on('iconStudio:open', () => closeMenus());
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    const studio = document.querySelector('#icon-studio:not(.hidden)');
    if (studio) studio.querySelector('[data-action="close"]').click();
    else closeMenus({ returnFocus: true });
  }
});

const controls = document.createElement('div');
controls.className = 'preview-controls';
controls.innerHTML = '<strong>两套内置图标 · 91 类</strong><label>查看范围<select id="preview-range"><option value="samples">15 个代表案例</option><option value="all">全部 91 类</option><option value="manual">泛名称手动选择</option></select></label><label>同项对比<select id="preview-case" aria-label="同项对比案例"></select></label><button type="button" id="preview-compare">并排放大</button><span class="preview-caption">设置可切换图标风格、浅深主题与卡片尺寸。右键可试用图标工坊。所有书签均为测试数据。</span>';
document.getElementById('toolbar').after(controls);
const cases = controls.querySelector('#preview-case');
for (const icon of catalog) { const option = document.createElement('option'); option.value = icon.id; option.textContent = icon.title; cases.appendChild(option); }
cases.value = 'chatgpt';
controls.querySelector('#preview-range').addEventListener('change', async event => {
  selectedNodes = event.target.value === 'all' ? nodes : event.target.value === 'manual' ? manual : samples;
  BookmarkStore.invalidateCache();
  await grid.refresh();
});
const modal = document.createElement('dialog');
modal.className = 'preview-compare';
modal.innerHTML = '<header><h2></h2><button class="btn btn-secondary" type="button">关闭</button></header><div class="preview-pair"><figure><img class="card-icon-image" alt="品牌软陶"><figcaption>品牌软陶 · 256px PNG</figcaption></figure><figure><img class="card-icon-image" alt="彩色扁平"><figcaption>彩色扁平 · 可编辑 SVG</figcaption></figure></div><p class="preview-footnote">两套使用相同品牌参考与留白比例。透明软陶沿用卡片柔灰底板。</p>';
document.body.appendChild(modal);
modal.querySelector('button').addEventListener('click', () => modal.close());
controls.querySelector('#preview-compare').addEventListener('click', () => {
  const id = cases.value;
  modal.querySelector('h2').textContent = catalog.find(icon => icon.id === id).title;
  const images = modal.querySelectorAll('img');
  images[0].src = getLibraryIconById(id, { style: 'clay' }).value;
  images[1].src = getLibraryIconById(id, { style: 'flat' }).value;
  modal.showModal();
});
