# reader 生产部署: 拉 GHCR 镜像 + 导出 dist 给宿主 caddy + compose 起容器
# 用法: GHCR_PAT=xxx ./pull-deploy.sh   (或先 docker login ghcr.io 再裸跑)
set -euo pipefail
cd "$(dirname "$0")"

IMAGE="${IMAGE:-ghcr.io/hehecat/reader:latest}"
OLD_DATA_VOLUME="${OLD_DATA_VOLUME:-}"   # 旧匿名 volume 名(迁移用), 留空则跳过迁移

if ! docker info >/dev/null 2>&1; then
  echo "docker 不可用" >&2; exit 1
fi
if [ -n "${GHCR_PAT:-}" ]; then
  echo "$GHCR_PAT" | docker login ghcr.io -u "${GHCR_USER:-hehecat}" --password-stdin
fi

docker compose pull

# dist 导出: 宿主 caddy 静态服务 / 长缓存头 / SSE 排除规则都在宿主 caddy 侧,
# 容器只出 API+兜底静态; 这里把镜像内 dist 拷到 ./web-dist 供 caddy root 使用
docker create --name reader-dist-extract "$IMAGE" true >/dev/null
trap 'docker rm -f reader-dist-extract >/dev/null' EXIT
rm -rf web-dist
docker cp reader-dist-extract:/app/web-ui/dist ./web-dist

# 一次性数据迁移: 旧部署的匿名 /data volume → compose 命名 volume reader_data
if [ -n "$OLD_DATA_VOLUME" ]; then
  if [ -z "$(docker run --rm -v reader_data:/d alpine:3.20 ls -A /d 2>/dev/null)" ]; then
    echo "迁移旧数据 volume: $OLD_DATA_VOLUME -> reader_data"
    docker run --rm -v "$OLD_DATA_VOLUME":/from -v reader_data:/to alpine:3.20 \
      sh -c 'cp -a /from/. /to/'
  else
    echo "reader_data 非空, 跳过迁移"
  fi
fi

docker compose up -d
docker compose ps
echo "部署完成: 4396 -> 容器 8080; 宿主 caddy root 指向 $(pwd)/web-dist"
