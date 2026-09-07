import * as React from "react";

import { cn } from "./cn";

export interface CoverImageProps extends React.ComponentProps<"div"> {
  /** 封面地址(原站 URL 热链); 为空或加载失败(含防盗链拒绝)时渲染书脊兜底封面 */
  src?: string | null;
  /** 替代文本, 通常传书名; 书脊兜底态下作为封面主标题 */
  alt: string;
  /** 书脊兜底封面的作者行(空值时不渲染该行) */
  author?: string | null;
  /** 书脊兜底封面底部的引言(line-clamp-3, 空值时不渲染) */
  intro?: string | null;
}

/** 书脊默认配色(朱砂 → 深褐, 取自砚台原型): 取模意外越界时的兜底 */
const DEFAULT_SPINE: readonly [from: string, to: string] = ["#8a3d34", "#4a211d"];

/** 书脊配色: 6 组「起始色 → 结束色」渐变对(前三组取自砚台原型 novels.cover, 后三组同一墨色系延展) */
const SPINE_GRADIENTS: ReadonlyArray<readonly [from: string, to: string]> = [
  DEFAULT_SPINE,
  ["#3c4a7d", "#232a4c"],
  ["#2f6d75", "#1c4148"],
  ["#6b5a2f", "#3a3018"],
  ["#4a6b3c", "#243a1e"],
  ["#6d3f63", "#3a2135"],
];

/** 书脊上的文字色(砚台原型: 近白的暖调 oklch) */
const SPINE_COLOR = "oklch(0.97 0.02 90)";

/** 按书名 FNV-1a hash 稳定选一组渐变: 同一本书的书脊配色永远不变 */
function spineBackground(title: string): string {
  let hash = 2166136261;
  for (let index = 0; index < title.length; index += 1) {
    hash ^= title.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const [from, to] = SPINE_GRADIENTS[Math.abs(hash) % SPINE_GRADIENTS.length] ?? DEFAULT_SPINE;
  return `linear-gradient(150deg, ${from}, ${to})`;
}

/**
 * 书籍封面: 3:4 书本形容器(左书脊侧近直角, 右翻口侧圆角) + 懒加载淡入.
 *
 * src 缺失或加载失败时渲染砚台原型的书脊兜底封面: 按书名 hash 取一组渐变,
 * 左侧压暗带 + 高光细线模拟书脊, 内嵌衬线书名 / 作者 / 引言.
 */
export function CoverImage({ src, alt, author, intro, className, ...props }: CoverImageProps) {
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = React.useState<string | null>(null);

  const usable = typeof src === "string" && src.length > 0;
  const failed = !usable || failedSrc === src;
  const loaded = usable && loadedSrc === src;

  if (failed) {
    const authorText = author?.trim() ?? "";
    const introText = intro?.trim() ?? "";

    return (
      <div
        role="img"
        aria-label={alt}
        style={{ backgroundImage: spineBackground(alt), color: SPINE_COLOR }}
        className={cn(
          "relative flex aspect-3/4 flex-col justify-between overflow-hidden rounded-r-md rounded-l-sm p-4 shadow-lg ring-1 ring-black/10",
          className,
        )}
        {...props}
      >
        {/* 书脊: 左侧压暗带 + 高光细线 */}
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-2 bg-black/25" />
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-2 w-px bg-white/25" />

        <div className="relative min-w-0">
          <p className="font-display text-lg leading-tight font-semibold text-balance">{alt}</p>
          {authorText.length > 0 ? (
            <p className="mt-1 truncate text-[11px] tracking-wide text-white/70">{authorText}</p>
          ) : null}
        </div>

        {introText.length > 0 ? (
          <p className="relative line-clamp-3 font-display text-[11px] leading-snug text-pretty text-white/75">
            {introText}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative aspect-3/4 overflow-hidden rounded-r-md rounded-l-sm bg-surface-muted shadow-lg ring-1 ring-black/10",
        className,
      )}
      {...props}
    >
      <img
        src={src ?? undefined}
        alt={alt}
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={(event) => {
          // 1x1 纯色之类的退化封面视觉上等于无封面: 转书脊兜底
          const img = event.currentTarget;
          if (img.naturalWidth < 8 || img.naturalHeight < 8) {
            setFailedSrc(src ?? null);
            return;
          }
          setLoadedSrc(src ?? null);
        }}
        onError={() => setFailedSrc(src ?? null)}
        className={cn(
          "absolute inset-0 size-full object-cover transition-opacity duration-200 ease-out",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
      {loaded ? null : <div aria-hidden className="absolute inset-0 animate-pulse bg-surface-muted" />}
    </div>
  );
}
