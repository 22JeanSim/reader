import { z } from "zod";
import { parseWith, post, type ApiRequestConfig } from "@/lib/api-client";
import { searchBookListSchema, type SearchBook } from "@/types/api";

/** `/searchBookMulti` 一次性返回: `{ lastIndex, list }` */
export const searchMultiResultSchema = z.object({
  /** 本轮搜索到的最后一个书源下标, 下次请求继续传它 */
  lastIndex: z.number(),
  list: searchBookListSchema,
});

/**
 * SSE(`/searchBookMultiSSE`, `/searchBookSourceSSE`)每批增量的 data 负载:
 * `{ lastIndex, data: SearchBook[] }`; `event: end` 的负载只有 `{ lastIndex }`.
 */
export const searchSSEBatchSchema = z.object({
  lastIndex: z.number(),
  data: searchBookListSchema.default([]),
});

export type SearchMultiResult = z.infer<typeof searchMultiResultSchema>;
export type SearchSSEBatch = z.infer<typeof searchSSEBatchSchema>;

/** 多源搜索耗时较长(后端最多 8 轮并发), 默认放宽超时 */
const MULTI_SEARCH_TIMEOUT = 120_000;

/** 单书源搜索 */
export async function searchBook(
  key: string,
  sourceUrl: string,
  page = 1,
  config?: ApiRequestConfig,
): Promise<SearchBook[]> {
  const data = await post<unknown>(
    "/searchBook",
    // warp 单源搜索参数名是 bookSource (URL 或完整源 JSON); bookSourceUrl 是 SSE 端点的参数名
    { key, bookSource: sourceUrl, page },
    config,
  );
  return parseWith(searchBookListSchema, data);
}

/**
 * 多书源搜索(非 SSE, 一次性返回).
 * 流式版本请用 `connectSSE("/searchBookMultiSSE", { key, lastIndex, concurrentCount }, handlers)`,
 * 每批负载用 searchSSEBatchSchema 校验.
 * @param lastIndex 上一次返回的 lastIndex, 首次传 -1
 */
export async function searchBookMulti(
  key: string,
  lastIndex = -1,
  concurrentCount?: number,
  searchSize?: number,
  config?: ApiRequestConfig,
): Promise<SearchMultiResult> {
  const data = await post<unknown>(
    "/searchBookMulti",
    { key, lastIndex, concurrentCount, searchSize },
    { timeout: MULTI_SEARCH_TIMEOUT, ...config },
  );
  // warp Rust 后端一次性返回平铺列表 (Kotlin 返回 {lastIndex, list}): 双形状兼容
  if (Array.isArray(data)) {
    return { lastIndex: -1, list: parseWith(searchBookListSchema, data) };
  }
  return parseWith(searchMultiResultSchema, data);
}
