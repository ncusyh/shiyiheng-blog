# shi 的个人博客 — shiyiheng.top

深夜代码风格的个人博客，带管理后台：随时更换首页图片、发布文章。
这是一份**可独立部署**的完整代码（Node.js + Express + SQLite），
从 Muse 里带后台的版本完整复刻而来——Muse 里的互动应用不能对外公开、
数据也不会离开 Muse，所以要绑定自己的域名 `shiyiheng.top`，必须用下面这套代码部署。

> 域名是在**其他注册商**注册的（不是阿里云/腾讯云），下面 DNS 部分按**通用注册商**写法，
> 不针对某一家的后台菜单；只要找到你注册商的「DNS 管理 / DNS Records」就能按步骤操作。

## 功能

- 访客首页：终端窗口 + 首页大图 + 博客名 / 签名 / 关于，文章列表、标签筛选、点开读全文
- 文章管理：写文章、存草稿 / 正式发布，支持摘要、标签、封面图、正文（空行分段）、编辑、删除
- 首页与设置：随时上传新图替换首页图（也可恢复默认图），改博客名、一句话签名、「关于我」
- 风格：深色底 `#0c1210`、荧光绿 `#4ade80`、蓝 `#6cb6ff`、等宽字体 JetBrains Mono、闪烁光标
- 数据：SQLite 单文件（Node 内置 `node:sqlite`，无需外部数据库、无需编译原生模块）；图片存在 `uploads/`，通过 `/uploads/...` 访问

## 目录结构

```
blog-deploy/
├── server.js            # 后端入口（Express + API）
├── db.js                # SQLite 建表与默认设置（域名 shiyiheng.top）
├── package.json         # npm start 启动
├── public/
│   ├── index.html       # 单页应用：预览博客 / 文章管理 / 首页与设置
│   ├── app.js           # 前端逻辑
│   ├── style.css        # 深夜代码样式
│   └── hero-default.svg # 默认首页图
├── uploads/             # 上传的图片（不进 Git，靠持久卷保存）
├── data/                # SQLite 数据库 blog.db（不进 Git，靠持久卷保存）
├── Dockerfile           # Docker 部署
├── railway.toml         # Railway 配置（Dockerfile 构建）
├── render.yaml          # 备选：Render（仅试用，见下）
├── .env.example         # 环境变量模板（不要把真实密码写进去）
└── README.md            # 本文件
```

## 接口一览（与原版后台操作一一对应）

| 操作 | 接口 |
|---|---|
| 查设置 getSettings | `GET /api/settings` |
| 改设置 updateSettings | `PUT /api/settings` |
| 换首页图 setHeroImage | `POST /api/hero`（表单字段 `image`） |
| 恢复默认图 resetHeroImage | `POST /api/hero/reset` |
| 文章列表 listArticles | `GET /api/articles`（默认已发布；`?status=all` 看全部；`?tag=xxx` 筛选） |
| 读全文 getArticle | `GET /api/articles/:id` |
| 新建 createArticle | `POST /api/articles`（`title, summary, body, tags, status=draft\|published`，可带 `cover` 图片） |
| 更新 updateArticle | `PUT /api/articles/:id` |
| 删除 deleteArticle | `DELETE /api/articles/:id` |
| 通用传图 | `POST /api/upload`（字段 `image`，返回 `{url}`） |
| 健康检查 | `GET /api/health` |

## 本地运行

```bash
cd blog-deploy
npm install
npm start
# 打开 http://localhost:3000
# 默认数据为空：先在「首页与设置」里确认博客名/签名，再去「文章管理」发第一篇。
```

---

## 部署（推荐）：GitHub + Railway

全程不需要在自己电脑上搭服务器。思路：代码推到你自己的 GitHub 仓库 → Railway 从 GitHub 拉代码部署 → 在 Railway 里绑 `shiyiheng.top` → 回注册商改 DNS。

### 第 1 步：把代码推到 GitHub

在 github.com 上新建一个仓库，例如名字 `shiyiheng-blog`，**不要**勾选自动生成 README（本地已有），
建好后按 GitHub 页面上显示的地址操作（下面以 `shi` 为用户名示例，换成你自己的用户名）：

```bash
cd blog-deploy
git init
git add .
git commit -m "个人博客：深夜代码风格 + 管理后台"
git branch -M main
git remote add origin https://github.com/你的用户名/shiyiheng-blog.git
git push -u origin main
```

> 检查：推完后仓库里应该有 `server.js`、`Dockerfile`、`railway.toml`，但**不应该**有 `node_modules/`、
> `data/*.db`、`uploads/` 里的图片（`.gitignore` 已排除）。

### 第 2 步：在 Railway 里从 GitHub 部署

1. 打开 [railway.app](https://railway.app)，用 GitHub 账号登录（点 `Login with GitHub`）。
2. 点 `New Project` → `Deploy from GitHub repo` → 授权并选择刚推上去的 `shiyiheng-blog` 仓库。
3. Railway 会按 `railway.toml` + `Dockerfile` 自动构建、部署。等状态变成绿色 `Active`。
4. 点进服务 → `Settings` → `Networking` → `Generate Domain`，先拿到一个 Railway 临时域名，
   例如 `shiyiheng-blog-production-xxxx.up.railway.app`，打开确认博客能正常访问。
   这一步是验证部署成功，后面绑定自己的域名还要用它做 DNS 目标。

### 第 3 步：配持久化存储（关键，否则重启丢数据）

SQLite 数据库和上传的图片都在服务器本地文件里，Railway 默认重启/重新部署后会丢。
必须加持久卷：

1. 在 Railway 项目里点进你的服务 → `Settings` → `Volumes` → `Add Volume`。
2. 挂载路径（Mount Path）填 **`/app/data`**，大小 1 GB 就够。
   - `DB_PATH` 默认就是 `/app/data/blog.db`（Dockerfile 里已设），数据库会落在卷里。
   - 注意：`uploads/` 目前也在容器本地。Railway 的 Volume 只能挂一个路径，
     为保险起见，正式使用时建议把上传也落在卷里——本项目已在 `Dockerfile` 把工作目录设为 `/app`，
     若你把卷挂到 `/app/data` 后仍担心图片丢失，优先方案是：定期在后台把重要图片另存一份，
     或后续把 `uploads/` 改为对象存储（见文末「待改进」）。
3. 再部署一次，确认之前发过的文章和换过的首页图还在。

> 更稳妥的做法（可选）：把 Volume 挂到 `/app/data` 后，手工把 `uploads` 也纳入备份；
> 本包已把 `DB_PATH` 指向卷内，数据库不丢是已验证的重点。

### 第 4 步：设置环境变量

在 Railway 服务 → `Variables` 里添加（`Raw Editor` 也行）：

| 变量 | 值 | 说明 |
|---|---|---|
| `NODE_ENV` | `production` | 生产模式 |
| `DB_PATH` | `/app/data/blog.db` | 数据库落在持久卷里 |
| `ADMIN_PASSWORD` | 你自己想一个强密码 | **务必设置**，见下「安全提醒」 |

`PORT` 不用自己设，Railway 会自动注入。

### 第 5 步：在 Railway 里绑定自定义域名

1. 服务 → `Settings` → `Networking` → `Domains` → `Custom Domain`。
2. 先加 `shiyiheng.top`，再加 `www.shiyiheng.top`（两个都加，访客两种写法都能打开）。
3. Railway 会为每个域名显示一条 DNS 目标（Target / CNAME 值），
   通常是一串以 `.up.railway.app` 结尾的主机名，例如 `xxx.up.railway.app`。
   **把这串值抄下来，下一步 DNS 解析就填它。**
4. 先不要急着点验证，等第 6 步 DNS 生效后再回来看，Railway 会自动签发 HTTPS 证书，
   状态变绿即完成（一般几分钟到 1 小时）。

### 第 6 步：在域名注册商处改 DNS（通用写法）

去你注册域名的那家网站登录，找到域名 `shiyiheng.top` 的 **DNS 管理 / DNS Records / 域名解析**（各家叫法不同，位置一般在域名列表 → 管理 → DNS），按下面加两条记录：

| 主机记录 / Name / Host | 类型 Type | 值 / Value / Points to | 说明 |
|---|---|---|---|
| `www` | `CNAME` | 第 5 步抄下的 Railway 目标主机名（如 `xxx.up.railway.app`） | `www.shiyiheng.top` 指向 Railway |
| `@` | `CNAME` 或 `ALIAS` / `ANAME` | 同上，Railway 目标主机名 | `shiyiheng.top`（不带 www）指向 Railway |

注意事项：

- 有的注册商**不允许 `@` 用 CNAME**（DNS 规范限制），这时就选它提供的 `ALIAS` 或 `ANAME` 类型，
  值一样填 Railway 目标；如果既没有 ALIAS 也没有 ANAME，就只保留 `www` 的 CNAME，
  并在 Railway 里确认主域名用 `www.shiyiheng.top`，再把裸域名做 301 跳转到 www（或反过来）。
- 如果注册商已有同名旧记录（比如旧的 `@` A 记录 / `www` CNAME），先删掉或改掉它，否则会冲突。
- TTL 保持默认即可（一般 300 秒或 1 小时）。
- 生效时间：通常 10 分钟～1 小时，少数注册商要几小时。可用命令行验证：
  `nslookup www.shiyiheng.top` 或 `dig www.shiyiheng.top CNAME`，看到指向 Railway 的主机名即生效。
- 之后访问 `https://shiyiheng.top` 和 `https://www.shiyiheng.top`，都应打开你的博客。

> **备案说明：Railway 是海外托管，不需要 ICP 备案。**
> 只有把网站放在中国大陆的服务器上（阿里云、腾讯云等国内云厂商）才需要先备案才能用域名访问。
> 你的域名在别处注册不影响这一点：注册商在哪、托管在哪是两回事，备案看的是**服务器位置**。

### 部署后检查清单

- [ ] `https://shiyiheng.top` 能打开，样式是深夜代码风
- [ ] 登录后台（同一个网址，切到「文章管理」）发一篇测试文章，设为「正式发布」，再刷新首页能看到
- [ ] 上传一张首页图，刷新后首页大图变了；再点「恢复默认图」能恢复
- [ ] 在 Railway 里重新部署一次，文章和图片还在（验证持久卷生效）

---

## 备选：VPS / Docker 自行部署

如果你以后想放在自己的 VPS 上：

```bash
# 在 VPS 上
git clone https://github.com/你的用户名/shiyiheng-blog.git
cd shiyiheng-blog
# 数据目录挂到宿主机，重启不丢
docker build -t shiyiheng-blog .
docker run -d --name blog --restart always \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DB_PATH=/app/data/blog.db \
  -e ADMIN_PASSWORD=请改成你自己的强密码 \
  -v /srv/blog-data:/app/data \
  -v /srv/blog-uploads:/app/uploads \
  shiyiheng-blog
```

再用 Nginx 反代 `3000` 端口到 `shiyiheng.top`，用 Certbot 申请 HTTPS 证书。
VPS 若在海外同样不需要备案；在大陆的 VPS 需要备案。

> `render.yaml` 也已提供，但 Render 免费实例没有持久磁盘，SQLite 和上传图片会在重启后丢失，
> 只适合临时试用，不推荐正式用。

## 安全提醒（重要）

- **后台目前没有登录页。** `ADMIN_PASSWORD` 未设置时，任何人打开网址都能进后台改图、发文章、删文章。
  上线前务必在 Railway `Variables`（或 VPS 的 `-e` 参数）里设置一个强密码；设置后，
  前端在首次执行写操作（保存设置、换图、发文章）时会弹窗索要密码，密码只存在浏览器 `sessionStorage`，不会写进代码和仓库。
- **不要把真实密码写进代码、`.env` 或 GitHub。** `.env.example` 只是模板，里面没有真实密码。
- 图片上传限制为 PNG / JPEG / WebP / GIF，单张 8 MB；不要上传可执行文件。

## 待改进（未做、可后续加）

- `uploads/` 与 `data/` 共用持久卷之外的对象存储（如 Cloudflare R2 / S3），彻底避免图片丢失
- 真正的账号登录（用户名 + 密码哈希、登录态），替代现在的单密码请求头
- 文章 Markdown 渲染、RSS、搜索、评论

## 本地验证记录（本包交付时）

- `npm install` 通过，`node server.js` 能启动
- `GET /api/settings` 返回域名 `shiyiheng.top` 与默认设置
- `GET /api/articles` 初始为空数组；新建草稿 / 发布后列表能查到，删除后恢复为空
- 首页图上传 `POST /api/hero` 返回 `/uploads/...` 且能 200 访问，`POST /api/hero/reset` 后恢复 `null`（默认图）
- 首页 `/` 能加载，样式与三页签正常
