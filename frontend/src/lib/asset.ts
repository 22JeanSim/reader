import { getAccessToken } from "@/lib/storage";

/**
 * https 页面里 http 图片资源会被 mixed-content 拦截 (啃书封面图床等 http 源):
 * 改走后端 /assets/proxy (磁盘缓存 + 防盗链 Referer + SSRF 口径一致).
 * http 部署 (localhost 调试) 与 https/非 http: 资源保持直连.
 */
export function proxiedAssetUrl(url: string, referer?: string): string {
  if (typeof window === "undefined") {
    return url;
  }
  if (window.location.protocol !== "https:") {
    return url;
  }
  if (!url.startsWith("http:")) {
    return url;
  }
  const params = new URLSearchParams({ url });
  if (referer !== undefined && referer !== "") {
    params.set("referer", referer);
  }
  const token = getAccessToken();
  if (token !== null) {
    params.set("accessToken", token);
  }
  return `/assets/proxy?${params.toString()}`;
}
