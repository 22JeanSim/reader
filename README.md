# reader

自托管在线阅读器: Rust(warp) 后端 + React 前端, 多书源搜索/书架/阅读器/换源/缓存/TTS 朗读.
本仓库为统一仓库: `backend/`(Rust) + `frontend/`(React) + `deploy/`(部署资产), 镜像由 GitHub Actions 构建推送 GHCR, 服务器只拉取不编译.

## 架构

```
浏览器 ──HTTPS :8888── 外层 caddy(TLS 通配证书, SSE 不压缩)
        ──HTTP :8080── 宿主 caddy(静态 dist 长缓存 + /reader3 反代 flush -1 + 封面长缓存)
        ──4396→8080── reader 容器(warp: API + SSE 搜索 + 书源抓取 + sqlite 缓存 + 内嵌 dist 兜底)
                          ├─ /data        命名 volume (杂项/遗留)
                          ├─ /storage     宿主 bind: sqlite + 封面 + 本地书
                          └─ camoufox     容器内按需 spawn (验证码/登录浏览器)
```

- 搜索: 多书源 SSE 流式聚合, 按书源置信度排序(成功率×速度因子), 死源 6h 跳过; 结果按「书名/作者/简介含关键词」收口
- 缓存: 目录(24h TTL)/正文(永久, md5(chapterUrl) 键)/书籍信息/搜索批次, 全 sqlite
- 换源: 书架书走后端 setBookSource; 未入架书纯前端切身份(不动书架)
- 前端会话: 搜索列表 sessionStorage 快照, 预览返回不重搜

## 仓库结构

```
backend/    Rust 后端 (src/, Cargo.toml, .cargo/config.toml 含 reqwest_unstable flag,
            scripts/camoufox_solver.py, web-ui/public/fonts 仅 epub 字体)
frontend/   React 前端 (vite + pnpm, /reader3 同源代理见 vite.config.ts)
deploy/     docker-compose.yml / .env.example / Caddyfile(宿主活配置) / pull-deploy.sh
Dockerfile  根上下文多阶段: frontend pnpm build → rust release → camoufox → 运行镜像
.github/    Actions: push main/tag → 构建镜像推 GHCR
```

## 本地开发

```bash
# 后端 (flag 必需: reqwest http3 实验特性)
cd backend && RUSTFLAGS='--cfg reqwest_unstable' cargo run

# 前端 (代理 /reader3 → 127.0.0.1:4396, 端口 8082)
cd frontend && pnpm install && pnpm dev
```

## 构建镜像

```bash
docker build -t reader .          # 根上下文, 含前端+后端+camoufox, 约 10-20 分钟
```

GitHub Actions 在 push main / tag `v*` 时自动构建并推送:
`ghcr.io/<owner>/reader:latest|<sha>|<semver>` (GHA 层缓存).

## 部署 (服务器)

1. 登录 GHCR (PAT 只需 `read:packages`):
   `echo $PAT | docker login ghcr.io -u <user> --password-stdin`
2. `cd deploy && cp .env.example .env` 填邀请码/管理密码
3. `./pull-deploy.sh` — 拉镜像、导出 dist 到 `deploy/web-dist`(宿主 caddy root)、起容器 4396
4. 宿主 caddy 用 `deploy/Caddyfile` (root 指向 deploy/web-dist; SSE 不压缩 + flush -1 + 封面长缓存是硬要求)
5. 旧部署迁移: `OLD_DATA_VOLUME=<旧匿名volume名> ./pull-deploy.sh` 自动搬 /data;
   storage 目录直接复用原 bind 路径

回滚: `docker compose -f deploy/docker-compose.yml up -d reader` 前改 image tag 为旧 sha 即可.

## 关键配置 (env)

| 变量 | 作用 |
|---|---|
| READER_APP_INVITECODE | 注册邀请码 |
| READER_APP_SECUREKEY | secure 模式管理密码 |
| READER_APP_WORKDIR | 数据根 (/storage) |
| READER_APP_WEB_ROOT | 静态 dist 路径 (镜像内 /app/web-ui/dist) |
| READER_TOC_CACHE_TTL_MS | 目录缓存 TTL (默认 24h) |
| SSRF_ALLOW_PRIVATE | 允许抓内网地址 (本地书/TTS) |
| READER_CAMOUFOX_URL | 外置 camoufox 服务地址 (缺省容器内自 spawn) |

## 性能基线 (本机实测, 缓存命中)

书架 6ms / 正文 35ms / 书签 5ms / 目录命中 ~10ms (缓存前置检查后) /
搜索首结果 0.3-0.6s (热门词) / 书源列表 lite 33KB (全量 1.4MB 仅书源页用)
