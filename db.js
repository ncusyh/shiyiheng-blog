// SQLite 初始化：settings（键值）+ articles（文章）
// 数据库文件位置：环境变量 DB_PATH，默认 ./data/blog.db
// Railway 上请挂载持久卷到 /app/data（见 railway.toml），否则重启会丢数据。
// 实现说明：用 Node 内置的 node:sqlite（Node 22+，无需原生编译）。
// 原计划用 better-sqlite3，但在 Node 24 沙箱里 node-gyp 下载头文件被拦、
// 本地编不过；内置 sqlite 零依赖、Railway 上同样可用，API 与原来保持一致。
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'blog.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    cover_image_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
  CREATE INDEX IF NOT EXISTS idx_articles_created ON articles(created_at DESC);
`);

const DEFAULTS = {
  domain: 'shiyiheng.top',
  blog_name: 'shi 的博客',
  tagline: '$ whoami // 分享代码、工具与复盘',
  about: '欢迎来到我的博客。这里记录代码、工具与复盘。',
  hero_image_url: '', // 空 = 使用默认首页图
};

const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSetting = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);
for (const [k, v] of Object.entries(DEFAULTS)) {
  if (!getSetting.get(k)) setSetting.run(k, v);
}

function getSettings() {
  const out = {};
  for (const row of db.prepare('SELECT key, value FROM settings').all()) out[row.key] = row.value;
  return {
    domain: out.domain || DEFAULTS.domain,
    blog_name: out.blog_name || DEFAULTS.blog_name,
    tagline: out.tagline ?? DEFAULTS.tagline,
    about: out.about ?? DEFAULTS.about,
    hero_image_url: out.hero_image_url || null, // null = 默认图（对应原版 getSettings 语义）
  };
}

function updateSettings(patch) {
  const allowed = ['blog_name', 'tagline', 'about', 'domain', 'hero_image_url'];
  for (const k of allowed) {
    if (patch[k] !== undefined) setSetting.run(k, String(patch[k] ?? ''));
  }
  return getSettings();
}

module.exports = { db, getSettings, updateSettings };
