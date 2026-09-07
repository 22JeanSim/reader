import { z } from "zod";

import { parseWith, post } from "@/lib/api-client";
import { bookContentSchema, type BookContent } from "@/services/book";
import {
  bookChapterListSchema,
  bookSchema,
  searchBookListSchema,
  type Book,
  type BookChapter,
  type BookSource,
  type SearchBook,
} from "@/types/api";

/**
 * 工作台测试接口: 全部 POST + inline bookSource(不入库, 后端 resolve_book_source
 * 见 `{` 前缀即按完整源对象解析), 因此「未保存的编辑中规则」也能直接验证.
 */

/** 抓取类测试走外网书源, 超时口径与 services/book 一致 */
const TEST_TIMEOUT = 120_000;

/**
 * bookSource 一律传 JSON 字符串: /searchBook 的 body 解析只认字符串形态
 * (as_str), 其余接口 param_of 对字符串原样透传, 两种后端读参路径都安全.
 */
function inlineBody(source: BookSource, extra: Record<string, unknown>): Record<string, unknown> {
  return { ...extra, bookSource: JSON.stringify(source) };
}

/**
 * 详情测试: 后端 /getBookInfo 有 6h DB 缓存 + 进程内缓存, 均按 URL 为键且无
 * refresh 参数——调试必须每次真跑当前规则, 给 URL 追加时间戳参数改变缓存键
 * (目标站点普遍忽略未知查询参数, 规则解析不受影响).
 */
export async function testBookInfo(url: string, source: BookSource): Promise<Book> {
  const freshUrl = `${url}${url.includes("?") ? "&" : "?"}_wb=${Date.now()}`;
  const data = await post<unknown>(
    "/getBookInfo",
    inlineBody(source, { url: freshUrl }),
    { timeout: TEST_TIMEOUT },
  );
  return parseWith(bookSchema, data);
}

/** 完整目录测试: refresh=1 跳过后端 5 分钟目录缓存, 跟随 nextTocUrl 翻页 */
export async function testChapterList(url: string, source: BookSource): Promise<BookChapter[]> {
  const data = await post<unknown>("/getChapterList", inlineBody(source, { url, refresh: 1 }), {
    timeout: TEST_TIMEOUT,
  });
  return parseWith(bookChapterListSchema, data);
}

/** getChapterListByRule 双形态: 网源调试回纯章节数组, 本地书语义回 {book, chapters} */
const chapterListByRuleSchema = z.union([
  bookChapterListSchema,
  z
    .object({ book: z.unknown().optional(), chapters: bookChapterListSchema })
    .transform((value) => value.chapters),
]);

/** 目录规则单页测试: 只跑一次 ruleToc(不翻页), 快速定位 chapterList/chapterName 规则 */
export async function testChapterListByRule(
  url: string,
  source: BookSource,
): Promise<BookChapter[]> {
  const data = await post<unknown>("/getChapterListByRule", inlineBody(source, { url }), {
    timeout: TEST_TIMEOUT,
  });
  return parseWith(chapterListByRuleSchema, data);
}

/**
 * 正文测试: 不传 bookUrl——后端正文缓存与进度回写都以 bookUrl 为条件,
 * 缺省即每次直抓直解析, 且不会污染书架进度.
 */
export async function testBookContent(url: string, source: BookSource): Promise<BookContent> {
  const data = await post<unknown>("/getBookContent", inlineBody(source, { url }), {
    timeout: TEST_TIMEOUT,
  });
  return parseWith(bookContentSchema, data);
}

/** 搜索测试: /searchBook 单源搜索, key 走书源 searchUrl */
export async function testSearch(
  key: string,
  source: BookSource,
  page = 1,
): Promise<SearchBook[]> {
  const data = await post<unknown>("/searchBook", inlineBody(source, { key, page }), {
    timeout: TEST_TIMEOUT,
  });
  return parseWith(searchBookListSchema, data);
}

/** 书海测试: /exploreBook, url = 发现菜单里的 ruleFindUrl(可含 {{page}}, 后端替换) */
export async function testExplore(
  ruleFindUrl: string,
  source: BookSource,
  page = 1,
): Promise<SearchBook[]> {
  const data = await post<unknown>("/exploreBook", inlineBody(source, { url: ruleFindUrl, page }), {
    timeout: TEST_TIMEOUT,
  });
  return parseWith(searchBookListSchema, data);
}
