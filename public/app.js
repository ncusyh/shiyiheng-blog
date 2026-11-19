// 前端：3 个页签（预览博客 / 文章管理 / 首页与设置）+ 文章阅读
// 后端接口见 server.js：GET/PUT /api/settings，POST /api/hero、/api/hero/reset、/api/upload，
// GET/POST/PUT/DELETE /api/articles。若服务器设置了 ADMIN_PASSWORD，写操作需带密码。
const $ = (s) => document.querySelector(s);
let settings = null, published = [], allArticles = [], activeTag = '', adminPassword = sessionStorage.getItem('admin_pw') || '';

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2500);
}
function headers(isJson) {
  const h = {}; if (isJson) h['Content-Type'] = 'application/json';
  if (adminPassword) h['X-Admin-Password'] = adminPassword;
  return h;
}
async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (res.status === 401) {
    const pw = prompt('请输入管理员密码（服务器 ADMIN_PASSWORD）：');
    if (pw === null) throw new Error('已取消');
    adminPassword = pw; sessionStorage.setItem('admin_pw', pw);
    const retry = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), 'X-Admin-Password': pw } });
    if (!retry.ok) throw new Error((await retry.json().catch(() => ({}))).error || '请求失败');
    return retry.json();
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '请求失败');
  return res.json();
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (s) => (s || '').slice(0, 10);

// ---------- 页签 ----------
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === b));
  for (const t of ['preview', 'articles', 'settings']) $('#tab-' + t).classList.toggle('hidden', t !== b.dataset.tab);
  if (b.dataset.tab === 'articles') loadAdmin();
}));

// ---------- 设置 / 首页 ----------
async function loadSettings() {
  settings = await api('/api/settings');
  document.title = `${settings.blog_name} — ${settings.domain}`;
  $('#brandName').textContent = settings.blog_name; $('#brandDomain').textContent = settings.domain;
  $('#termUrl').textContent = settings.domain; $('#settingsDomain').textContent = settings.domain;
  $('#heroName').textContent = settings.blog_name; $('#heroTagline').textContent = settings.tagline; $('#heroAbout').textContent = settings.about;
  const hero = settings.hero_image_url || '/hero-default.svg';
  $('#heroImg').src = hero; $('#settingsHero').src = hero;
  $('#sName').value = settings.blog_name; $('#sTagline').value = settings.tagline; $('#sAbout').value = settings.about;
}
$('#settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    settings = await api('/api/settings', { method: 'PUT', headers: headers(true), body: JSON.stringify({ blog_name: $('#sName').value, tagline: $('#sTagline').value, about: $('#sAbout').value }) });
    await loadSettings(); toast('设置已保存');
  } catch (err) { toast(err.message); }
});
$('#uploadHero').addEventListener('click', async () => {
  const f = $('#heroFile').files[0]; if (!f) return toast('请先选择一张图片');
  const fd = new FormData(); fd.append('image', f);
  try { settings = await api('/api/hero', { method: 'POST', headers: headers(false), body: fd }); await loadSettings(); toast('首页图已更换'); }
  catch (err) { toast(err.message); }
});
$('#resetHero').addEventListener('click', async () => {
  try { settings = await api('/api/hero/reset', { method: 'POST', headers: headers(true) }); await loadSettings(); toast('已恢复默认图'); }
  catch (err) { toast(err.message); }
});

// ---------- 预览：已发布文章 + 标签筛选 + 阅读 ----------
async function loadPublished() {
  published = await api('/api/articles' + (activeTag ? `?tag=${encodeURIComponent(activeTag)}` : ''));
  const tags = [...new Set((await api('/api/articles')).flatMap((a) => a.tags))];
  $('#tagFilters').innerHTML = `<button class="tag ${!activeTag ? 'active' : ''}" data-t="">全部</button>` +
    tags.map((t) => `<button class="tag ${activeTag === t ? 'active' : ''}" data-t="${esc(t)}">${esc(t)}</button>`).join('');
  document.querySelectorAll('#tagFilters .tag').forEach((b) => b.addEventListener('click', () => { activeTag = b.dataset.t; loadPublished(); }));
  $('#articleList').innerHTML = published.length ? published.map((a) => `
    <article class="article" data-id="${a.id}">
      ${a.cover_image_url ? `<img class="cover" src="${esc(a.cover_image_url)}" alt="封面">` : ''}
      <h3>${esc(a.title)}</h3><p>${esc(a.summary || '')}</p>
      <div class="meta"><span>${fmtDate(a.created_at)}</span>${a.tags.map((t) => `<span>#${esc(t)}</span>`).join('')}</div>
    </article>`).join('') : '<div class="empty">还没有已发布的文章，去「文章管理」写第一篇吧。</div>';
  document.querySelectorAll('#articleList .article').forEach((el) => el.addEventListener('click', () => openReader(el.dataset.id)));
}
async function openReader(id) {
  try {
    const a = await api('/api/articles/' + id);
    $('#readerTitle').textContent = a.title;
    $('#readerMeta').innerHTML = `<span>${fmtDate(a.created_at)}</span>${a.tags.map((t) => `<span>#${esc(t)}</span>`).join('')}`;
    const c = $('#readerCover'); if (a.cover_image_url) { c.src = a.cover_image_url; c.classList.remove('hidden'); } else c.classList.add('hidden');
    $('#readerBody').innerHTML = String(a.body || '').split(/\n\s*\n/).map((p) => `<p>${esc(p.trim())}</p>`).join('') || '<p>（正文为空）</p>';
    $('#reader').classList.remove('hidden'); $('#reader').scrollIntoView({ behavior: 'smooth' });
  } catch (err) { toast(err.message); }
}
$('#closeReader').addEventListener('click', () => $('#reader').classList.add('hidden'));

// ---------- 文章管理 ----------
async function loadAdmin() {
  allArticles = await api('/api/articles?status=all');
  $('#adminList').innerHTML = allArticles.length ? allArticles.map((a) => `
    <div class="article" style="cursor:default">
      <h3>${esc(a.title)} <span class="badge ${a.status}">${a.status === 'published' ? '已发布' : '草稿'}</span></h3>
      <p>${esc(a.summary || '')}</p>
      <div class="meta"><span>${fmtDate(a.created_at)}</span>${a.tags.map((t) => `<span>#${esc(t)}</span>`).join('')}</div>
      <div class="row" style="margin-top:10px">
        <button class="btn ghost" data-edit="${a.id}">编辑</button>
        <button class="btn danger" data-del="${a.id}">删除</button>
      </div>
    </div>`).join('') : '<div class="empty">还没有文章，先在上面写一篇吧。</div>';
  document.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
    const a = await api('/api/articles/' + b.dataset.edit);
    $('#articleId').value = a.id; $('#aTitle').value = a.title; $('#aSummary').value = a.summary || '';
    $('#aTags').value = a.tags.join(', '); $('#aBody').value = a.body || '';
    $('#coverPreview').textContent = a.cover_image_url ? '当前封面：' + a.cover_image_url + '（不重新选图则保持不变）' : '';
    $('#editorTitle').textContent = '编辑文章'; window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
  document.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('确定删除这篇文章吗？删除后无法恢复。')) return;
    try { await api('/api/articles/' + b.dataset.del, { method: 'DELETE', headers: headers(true) }); toast('已删除'); loadAdmin(); loadPublished(); }
    catch (err) { toast(err.message); }
  }));
}
async function submitArticle(status) {
  const id = $('#articleId').value;
  const fd = new FormData();
  fd.append('title', $('#aTitle').value.trim()); fd.append('summary', $('#aSummary').value);
  fd.append('tags', $('#aTags').value); fd.append('body', $('#aBody').value); fd.append('status', status);
  const cover = $('#aCover').files[0]; if (cover) fd.append('cover', cover);
  if (!$('#aTitle').value.trim()) return toast('标题不能为空');
  try {
    if (id) await api('/api/articles/' + id, { method: 'PUT', headers: headers(false), body: fd });
    else await api('/api/articles', { method: 'POST', headers: headers(false), body: fd });
    toast(status === 'published' ? '已发布' : '已存为草稿');
    resetForm(); loadAdmin(); loadPublished();
  } catch (err) { toast(err.message); }
}
function resetForm() {
  $('#articleForm').reset(); $('#articleId').value = ''; $('#coverPreview').textContent = ''; $('#editorTitle').textContent = '写新文章';
}
$('#saveDraft').addEventListener('click', () => submitArticle('draft'));
$('#publishBtn').addEventListener('click', () => submitArticle('published'));
$('#resetForm').addEventListener('click', resetForm);

// ---------- 启动 ----------
loadSettings().catch((e) => toast(e.message));
loadPublished().catch((e) => toast(e.message));
