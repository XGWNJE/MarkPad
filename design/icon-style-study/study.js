(() => {
  'use strict';
  const { samples, styles, reviewNotes = [] } = window.MARKPAD_ICON_STUDY;
  const $ = id => document.getElementById(id);
  let activeStyle = 'A';
  let activeSample = samples[0].id;
  let detailStyle = 'A';
  let detailSample = samples[0].id;
  const descriptions = {
    A: '保留熟悉的品牌图形，用统一的石白底色、比例与留白整理整页面板。',
    B: '品牌轮廓化为同一组温润石色，以轻微厚度与投影表达浅浮雕。',
    C: '用松绿骨架和杏橙细节，重新画出每个入口的功能与性格。',
    D: '相同的原创符号，换成圆润的海盐色渐变与轻立体层次。',
    E: '品牌图形成为可以触摸的软陶小物，保留原有色彩与识别特征。',
    F: '原创符号变成有厚度的磨砂玻璃，以青绿透光与暖橙点睛。',
  };
  function asset(style, sample) { return `icons/${style.folder}/${sample.id}.${style.format.toLowerCase() === 'svg' ? 'svg' : 'png'}`; }
  function image(style, sample) {
    const img = document.createElement('img');
    img.src = asset(style, sample); img.alt = `${sample.title} · ${style.name}`; img.width = 256; img.height = 256;
    img.addEventListener('error', () => { const note = document.createElement('span'); note.className = 'asset-missing'; note.textContent = '素材尚未就绪'; img.replaceWith(note); });
    return img;
  }
  function card(style, sample, compare = false) {
    const figure = document.createElement('figure'); figure.className = 'icon-item';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'icon-card'; button.setAttribute('aria-label', `放大 ${sample.title}，${style.name}`); button.dataset.style = style.id; button.dataset.sample = sample.id;
    button.append(image(style, sample));
    const overlay = document.createElement('span'); overlay.className = 'icon-overlay'; overlay.textContent = sample.title;
    const meta = document.createElement('small'); meta.textContent = sample.meaning; overlay.append(meta); button.append(overlay);
    button.addEventListener('click', () => showDetail(style.id, sample.id));
    const caption = document.createElement('figcaption');
    if (compare) { const letter = document.createElement('span'); letter.textContent = style.id; caption.append(letter, document.createTextNode(style.name)); }
    else caption.textContent = sample.title;
    const sub = document.createElement('small'); sub.textContent = compare ? `${style.route} · ${style.format}` : sample.group; caption.append(sub);
    const note = reviewNotes.find(n => n.style === style.id && n.sample === sample.id);
    if (note) { const status = document.createElement('small'); status.className = 'review-note'; status.textContent = '局部待修边'; status.title = note.text; caption.append(status); }
    figure.append(button, caption); return figure;
  }
  function renderCollection() {
    const style = styles.find(s => s.id === activeStyle);
    $('style-meta').textContent = `方向 ${style.id} / ${style.route} / ${style.format}`;
    $('style-heading').textContent = style.name;
    $('style-description').textContent = descriptions[style.id];
    $('palette').replaceChildren(...style.colors.map(color => { const swatch = document.createElement('span'); swatch.style.backgroundColor = color; swatch.title = color; return swatch; }));
    $('collection-grid').replaceChildren(...samples.map(sample => card(style, sample)));
    document.querySelectorAll('.style-tab').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.style === activeStyle)));
  }
  function renderCompare() {
    const sample = samples.find(s => s.id === activeSample);
    $('compare-heading').textContent = sample.title;
    $('case-select').value = activeSample;
    $('compare-grid').replaceChildren(...styles.map(style => card(style, sample, true)));
    document.querySelectorAll('.case-strip button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sample === activeSample)));
  }
  function setView(view) {
    $('collection-view').hidden = view !== 'collection'; $('compare-view').hidden = view !== 'compare';
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    if (view === 'compare') { renderCompare(); document.querySelectorAll('.style-tab').forEach(b => b.setAttribute('aria-pressed', 'false')); }
    else renderCollection();
  }
  function selectCase(id) { activeSample = id; renderCompare(); }
  function moveCase(delta) { const index = samples.findIndex(s => s.id === activeSample); selectCase(samples[(index + delta + samples.length) % samples.length].id); }
  function showDetail(styleId, sampleId) {
    detailStyle = styleId; detailSample = sampleId; renderDetail();
    if (!$('detail-dialog').open) $('detail-dialog').showModal();
  }
  function renderDetail() {
    const style = styles.find(s => s.id === detailStyle), sample = samples.find(s => s.id === detailSample);
    $('detail-title').textContent = sample.title; $('detail-meta').textContent = `${style.id} / ${style.name}`;
    $('detail-light').replaceChildren(image(style, sample)); $('detail-dark').replaceChildren(image(style, sample));
    $('asset-link').href = asset(style, sample);
    const note = reviewNotes.find(n => n.style === style.id && n.sample === sample.id);
    $('detail-status').textContent = note ? note.text : `${style.format} 原图 · ${style.route} · ${style.material}`;
    $('detail-status').classList.toggle('review-note', Boolean(note));
    $('detail-styles').replaceChildren(...styles.map(s => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'detail-style'; b.setAttribute('aria-label', `查看 ${s.name}`); b.setAttribute('aria-pressed', String(s.id === detailStyle));
      b.append(image(s, sample), document.createTextNode(`${s.id} ${s.short}`)); b.addEventListener('click', () => { detailStyle = s.id; renderDetail(); }); return b;
    }));
  }
  for (const style of styles) {
    const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'style-tab'; tab.dataset.style = style.id; tab.setAttribute('aria-pressed', String(style.id === activeStyle));
    const letter = document.createElement('span'); letter.className = 'style-letter'; letter.textContent = style.id;
    const info = document.createElement('span'), title = document.createElement('strong'), sub = document.createElement('small'); title.textContent = style.name; sub.textContent = style.short; info.append(title, sub); tab.append(letter, info);
    tab.addEventListener('click', () => { activeStyle = style.id; setView('collection'); }); $('style-nav').append(tab);
  }
  for (const sample of samples) {
    const option = document.createElement('option'); option.value = sample.id; option.textContent = sample.title; $('case-select').append(option);
    const button = document.createElement('button'); button.type = 'button'; button.dataset.sample = sample.id; button.textContent = sample.title; button.addEventListener('click', () => selectCase(sample.id)); $('case-strip').append(button);
  }
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  $('case-select').addEventListener('change', e => selectCase(e.target.value));
  $('prev-case').addEventListener('click', () => moveCase(-1)); $('next-case').addEventListener('click', () => moveCase(1));
  $('theme-toggle').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme !== 'dark'; document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    $('theme-label').textContent = dark ? '深色' : '浅色'; $('theme-toggle').setAttribute('aria-label', `切换为${dark ? '浅色' : '深色'}主题`);
  });
  function updateSize() { const size = Number($('card-size').value); document.documentElement.style.setProperty('--study-card-size', `${size}px`); $('size-label').value = `${size}px`; }
  $('card-size').addEventListener('input', updateSize); $('reset-size').addEventListener('click', () => { $('card-size').value = '122'; updateSize(); });
  $('panel-mode').addEventListener('change', e => document.body.classList.toggle('panel-mode', e.target.checked));
  $('close-detail').addEventListener('click', () => $('detail-dialog').close());
  $('detail-dialog').addEventListener('click', e => { if (e.target === $('detail-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });
  renderCollection();
})();
