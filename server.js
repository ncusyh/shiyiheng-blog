// shi 的个人博客 — Express + SQLite 单体应用
// 对应原版 Muse 后台的操作：
//   getSettings / updateSettings / setHeroImage / resetHeroImage
//   listArticles / getArticle / createArticle / updateArticle / deleteArticle
// 运行：npm install && npm start ，默认端口 3000（环境变量 PORT）
// 管理员密码：见 README。未设置 ADMIN_PASSWORD 时后台不设锁（仅限本地/可信环境）；
// 设置后，写操作需在请求头带 X-Admin-Password，前端会在首次写操作时弹窗索要并记在 sessionStorage。
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db, getSettings, updateSettings } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- 上传 ----------
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 单图 8 MB
  fileFilter: (_req, file, cb) => {
    cb(ALLOWED_MIME.has(file.mimetype) ? null : new Error('只支持 PNG / JPEG / WebP / GIF 图片'), ALLOWED_MIME.has(file.mimetype));
  },
});

// ---------- 可选的管理员密码（不设密码即不锁，仅作部署提醒，见 README） ----------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return next();
  if (req.headers['x-admin-password'] === ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: '需要管理员密码' });
}

// ---------- 工具 ----------
function parseTags(raw) {
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); if (Array.isArray(p)) return p.map((t) => String(t).trim()).filter(Boolean); } catch { /* 不是 JSON，按逗号分 */ }
    return raw.split(/[,，、\s]+/).map((t) => t.trim()).filter(Boolean);
  }
  return [];
}
function publicArticle(row) {
  if (!row) return null;
  return { ...row, tags: parseTags(row.tags) }; // listArticles 不含 body
}
function fullArticle(row) {
  if (!row) return null;
  return { ...row, tags: parseTags(row.tags) }; // getArticle 含 body
}
function isValidStatus(s) { return s === 'draft' || s === 'published'; }

// ---------- 设置 ----------
app.get('/api/settings', (_req, res) => res.json(getSettings()));
app.put('/api/settings', requireAdmin, (req, res) => {
  res.json(updateSettings(req.body || {}));
});

// 首页图：上传替换
app.post('/api/hero', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传图片文件' });
  const url = `/uploads/${req.file.filename}`;
  res.json(updateSettings({ hero_image_url: url }));
});
// 首页图：恢复默认
app.post('/api/hero/reset', requireAdmin, (_req, res) => {
  res.json(updateSettings({ hero_image_url: '' }));
});

// 通用图片上传（文章封面用），返回 { url }
app.post('/api/upload', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传图片文件' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ---------- 文章 ----------
app.get('/api/articles', (req, res) => {
  const { status, tag } = req.query;
  let rows;
  if (status === 'all') {
    rows = db.prepare('SELECT id, title, summary, tags, status, cover_image_url, created_at, updated_at FROM articles ORDER BY created_at DESC, id DESC').all();
  } else if (status === 'draft') {
    rows = db.prepare("SELECT id, title, summary, tags, status, cover_image_url, created_at, updated_at FROM articles WHERE status='draft' ORDER BY created_at DESC, id DESC").all();
  } else {
    // 默认只列已发布（访客视角）
    rows = db.prepare("SELECT id, title, summary, tags, status, cover_image_url, created_at, updated_at FROM articles WHERE status='published' ORDER BY created_at DESC, id DESC").all();
  }
  let out = rows.map(publicArticle);
  if (tag) out = out.filter((a) => a.tags.includes(tag));
  res.json(out);
});

app.get('/api/articles/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '文章不存在' });
  res.json(fullArticle(row));
});

app.post('/api/articles', requireAdmin, upload.single('cover'), (req, res) => {
  const { title, summary = '', body = '', status = 'draft' } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: '标题不能为空' });
  if (!isValidStatus(status)) return res.status(400).json({ error: 'status 只能是 draft 或 published' });
  const cover_image_url = req.file ? `/uploads/${req.file.filename}` : (req.body.cover_image_url || null);
  const info = db.prepare(
    'INSERT INTO articles (title, summary, body, tags, status, cover_image_url) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(String(title).trim(), String(summary), String(body), JSON.stringify(parseTags(req.body.tags)), status, cover_image_url);
  res.status(201).json(fullArticle(db.prepare('SELECT * FROM articles WHERE id = ?').get(info.lastInsertRowid)));
});

app.put('/api/articles/:id', requireAdmin, upload.single('cover'), (req, res) => {
  const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '文章不存在' });
  const b = req.body || {};
  const next = {
    title: b.title !== undefined ? String(b.title).trim() : row.title,
    summary: b.summary !== undefined ? String(b.summary) : row.summary,
    body: b.body !== undefined ? String(b.body) : row.body,
    tags: b.tags !== undefined ? JSON.stringify(parseTags(b.tags)) : row.tags,
    status: b.status !== undefined ? b.status : row.status,
    cover_image_url: req.file ? `/uploads/${req.file.filename}` : (b.cover_image_url !== undefined ? (b.cover_image_url || null) : row.cover_image_url),
  };
  if (!next.title) return res.status(400).json({ error: '标题不能为空' });
  if (!isValidStatus(next.status)) return res.status(400).json({ error: 'status 只能是 draft 或 published' });
  db.prepare(
    "UPDATE articles SET title=?, summary=?, body=?, tags=?, status=?, cover_image_url=?, updated_at=datetime('now') WHERE id=?"
  ).run(next.title, next.summary, next.body, next.tags, next.status, next.cover_image_url, req.params.id);
  res.json(fullArticle(db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id)));
});

app.delete('/api/articles/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM articles WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: '文章不存在' });
  res.json({ ok: true });
});

// ---------- 健康检查 / 兜底 ----------
app.get('/api/health', (_req, res) => res.json({ ok: true, domain: getSettings().domain }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ---------- 错误处理 ----------
app.use((err, _req, res, _next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: '图片超过 8 MB' });
  res.status(400).json({ error: err.message || '请求失败' });
});

app.listen(PORT, () => console.log(`博客已启动：http://localhost:${PORT}（域名 shiyiheng.top 部署后指向此处）`));
