import { z } from "zod";

import { get, parseWith, post, type ApiRequestConfig } from "@/lib/api-client";

/**
 * RSS 订阅接口 (RssSourceController):
 * - `/getRssSources` GET → RssSource[]
 * - `/saveRssSource` POST → 单源 upsert(名称/链接为空时后端报错)
 * - `/saveRssSources` POST → 批量 upsert(无效条目后端静默跳过, 表单保存不用它)
 * - `/deleteRssSource` POST → body {sourceUrl}
 * - `/getRssArticles` POST → {sourceUrl, sortName, sortUrl, page}, data 为 Gson 序列化的
 *   Kotlin Pair: {first: RssArticle[], second: 下一页 URL}(second 为 null 时被 Gson 省略)
 * - `/getRssContent` POST → {sourceUrl, link, origin}, data 为正文 HTML 字符串
 *   (源未配置 ruleContent 时为空串; 渲染前必须经 DOMPurify 清洗)
 */

/**
 * 可空文本字段: Gson/Vert.x 对 null 字段有时省略、有时显式输出 null,
 * 统一归一化成 "" 让消费端免于三态判断.
 */
const text = z.string().nullish().transform((value) => value ?? "");

/** RssSource (io.legado.app.data.entities.RssSource), 字段名与后端 JSON 严格对齐 */
export const rssSourceSchema = z.object({
  sourceUrl: z.string().default(""),
  sourceName: z.string().default(""),
  sourceIcon: text,
  sourceGroup: text,
  sourceComment: text,
  enabled: z.boolean().default(true),
  /** 并发率 */
  concurrentRate: text,
  /** 请求头(JSON 字符串) */
  header: text,
  loginUrl: text,
  loginCheckJs: text,
  /** 分类地址: 每行 `名称::URL` */
  sortUrl: text,
  /** 只有单个地址(不解析 sortUrl 分类) */
  singleUrl: z.boolean().default(false),
  /** 列表样式: 0 标题+摘要, 1 大图, 2 无图(展示层约定) */
  articleStyle: z.number().default(0),
  ruleArticles: text,
  ruleNextPage: text,
  ruleTitle: text,
  rulePubDate: text,
  ruleDescription: text,
  ruleImage: text,
  ruleLink: text,
  ruleContent: text,
  style: text,
  enableJs: z.boolean().default(true),
  loadWithBaseUrl: z.boolean().default(true),
  customOrder: z.number().default(0),
});

export const rssSourceListSchema = z.array(rssSourceSchema);

/** RssArticle (io.legado.app.data.entities.RssArticle) */
export const rssArticleSchema = z.object({
  /** 文章来源(= 订阅的 sourceUrl) */
  origin: text,
  /** 所属分类名 */
  sort: text,
  title: text,
  order: z.number().default(0),
  /** 文章原文链接(后端已按源地址补全为绝对地址) */
  link: text,
  pubDate: text,
  description: text,
  /** 内嵌正文: 仅默认 RSS 解析器会填充, 规则解析时为空 */
  content: text,
  image: text,
  read: z.boolean().default(false),
  variable: text,
});

/** `/getRssArticles` 的 data: Kotlin Pair 的 Gson 序列化 */
export const rssArticlesPageSchema = z.object({
  first: z.array(rssArticleSchema).default([]),
  /** 下一页 URL; 为 null 时 Gson 省略该键, 无 ruleNextPage 时恒缺省 */
  second: text,
});

/** `/getRssContent` 的 data: 正文 HTML 字符串 */
export const rssContentSchema = text;

export type RssSource = z.output<typeof rssSourceSchema>;
export type RssArticle = z.output<typeof rssArticleSchema>;
export type RssArticlesPage = z.output<typeof rssArticlesPageSchema>;

export async function getRssSources(config?: ApiRequestConfig): Promise<RssSource[]> {
  const data = await get<unknown>("/getRssSources", undefined, config);
  return parseWith(rssSourceListSchema, data);
}

/** 单个新增/更新(按 sourceUrl upsert); 名称/链接为空时后端返回错误文案 */
export async function saveRssSource(source: RssSource, config?: ApiRequestConfig): Promise<void> {
  await post<unknown>("/saveRssSource", source, config);
}

/** 批量新增/更新; 注意后端会静默跳过名称/链接为空的条目 */
export async function saveRssSources(
  list: RssSource[],
  config?: ApiRequestConfig,
): Promise<void> {
  await post<unknown>("/saveRssSources", list, config);
}

export async function deleteRssSource(url: string, config?: ApiRequestConfig): Promise<void> {
  await post<unknown>("/deleteRssSource", { sourceUrl: url }, config);
}

export interface RssArticlesParams {
  sourceUrl: string;
  /** 分类名(可空) */
  sortName: string;
  /** 分类地址(空时后端回落到 sourceUrl) */
  sortUrl: string;
  /** 页码, 从 1 开始 */
  page: number;
}

export async function getRssArticles(
  params: RssArticlesParams,
  config?: ApiRequestConfig,
): Promise<RssArticlesPage> {
  const data = await post<unknown>("/getRssArticles", params, config);
  return parseWith(rssArticlesPageSchema, data);
}

export interface RssContentParams {
  sourceUrl: string;
  /** 文章原文链接 */
  link: string;
  /** 文章来源(= 订阅 sourceUrl), 后端必填 */
  origin: string;
}

export async function getRssContent(
  params: RssContentParams,
  config?: ApiRequestConfig,
): Promise<string> {
  const data = await post<unknown>("/getRssContent", params, config);
  return parseWith(rssContentSchema, data);
}

export interface ParsedRssSources {
  sources: RssSource[];
  /** 校验失败或缺 sourceUrl 被丢弃的条目数 */
  skipped: number;
  /** JSON 层面的错误; null 表示可解析 */
  error: string | null;
}

/**
 * 解析粘贴的订阅 JSON 文本: 支持数组或单个对象两种形态.
 * 每个条目过 rssSourceSchema(补齐默认值), 空 sourceUrl 或校验失败的条目计入 skipped.
 */
export function parseRssSourcesText(rawText: string): ParsedRssSources {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return { sources: [], skipped: 0, error: null };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { sources: [], skipped: 0, error: `JSON 解析失败: ${reason}` };
  }
  if (typeof raw !== "object" || raw === null) {
    return { sources: [], skipped: 0, error: "内容不是 RSS 订阅 JSON" };
  }
  const items: unknown[] = Array.isArray(raw) ? raw : [raw];
  const merged = new Map<string, RssSource>();
  let skipped = 0;
  for (const item of items) {
    const parsed = rssSourceSchema.safeParse(item);
    if (parsed.success && parsed.data.sourceUrl.trim().length > 0) {
      merged.set(parsed.data.sourceUrl, parsed.data);
    } else {
      skipped += 1;
    }
  }
  return { sources: [...merged.values()], skipped, error: null };
}

export interface RssSort {
  name: string;
  url: string;
}

/**
 * 把 sortUrl 按行拆成 `名称::URL` 分类(与旧 Vue 前端一致的客户端解析,
 * 不支持 `<js>` / `@js:` 形态); singleUrl 或 sortUrl 为空时返回空数组.
 */
export function parseSortUrls(source: RssSource): RssSort[] {
  if (source.singleUrl || source.sortUrl.trim().length === 0) {
    return [];
  }
  return source.sortUrl
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split("::");
      const name = (parts[0] ?? "").trim();
      return { name, url: (parts[1] ?? name).trim() };
    })
    .filter((sort) => sort.url.length > 0);
}
