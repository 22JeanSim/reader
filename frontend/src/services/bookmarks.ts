import { z } from "zod";

import { get, parseWith, post, type ApiRequestConfig } from "@/lib/api-client";

/**
 * 书签增删成功后按后端语义本地写回 react-query 缓存 (不自动 refetch), 避免
 * 「写入成功但列表还是旧数据」的时序竞争; staleTime 给 5s 窗口, 让「窗口重新
 * 聚焦」等自动 refetch 不至于太频繁.
 */
export const BOOKMARK_CACHE_TTL_MS = 5_000;

/** react-query 缓存键前缀: warp getBookmarks 必传 bookUrl 按书取, 缓存随书分键 */
export const BOOKMARKS_QUERY_KEY = ["bookmarks"] as const;

/** 某本书的书签缓存键 */
export function bookmarksQueryKey(bookUrl: string) {
  return [...BOOKMARKS_QUERY_KEY, bookUrl] as const;
}

/**
 * warp Bookmark 实体 wire 形状 (src/model/bookmark.rs):
 * 主键 (bookUrl, title); paragraphIndex 即 legacy chapterPos (serde alias);
 * createdAt 为毫秒时间戳. getBookmarks 返回它, saveBookmark 提交它.
 */
export const bookmarkWireSchema = z.object({
  bookUrl: z.string().default(""),
  /** 书签唯一键 (主键之一), 必填: 空 title 会被后端拒为「参数错误」 */
  title: z.string().default(""),
  bookName: z.string().default(""),
  bookAuthor: z.string().default(""),
  chapterName: z.string().default(""),
  bookText: z.string().default(""),
  content: z.string().default(""),
  paragraphIndex: z.number().default(0),
  chapterIndex: z.number().default(0),
  createdAt: z.number().default(0),
});

export const bookmarkWireListSchema = z.array(bookmarkWireSchema);

export type BookmarkWire = z.infer<typeof bookmarkWireSchema>;

/**
 * 内部书签模型: UI 形状保持不变 (time/chapterIndex/chapterPos/chapterName/
 * bookText/content), wire↔内部 由 bookmarkToWire/bookmarkFromWire 双向映射:
 * title=chapterName+(「#」+paragraphIndex 若 >0), paragraphIndex↔chapterPos,
 * createdAt↔time.
 */
export const bookmarkSchema = z.object({
  /** 归属书籍链接: getBookmarks/deleteBookmark(s) 必传, wire 主键之一 */
  bookUrl: z.string().default(""),
  /** 创建时间戳(ms), 映射 wire createdAt */
  time: z.number().default(0),
  bookName: z.string().default(""),
  bookAuthor: z.string().default(""),
  chapterIndex: z.number().default(0),
  /** 段首字符在整章文本中的位置, 与 Book.durChapterPos 同语义; 映射 wire paragraphIndex */
  chapterPos: z.number().default(0),
  chapterName: z.string().default(""),
  /** 书签摘要: 加书签时所在段落的纯文本 */
  bookText: z.string().default(""),
  /** 用户备注 */
  content: z.string().default(""),
});

export const bookmarkListSchema = z.array(bookmarkSchema);

export type Bookmark = z.infer<typeof bookmarkSchema>;

/** 新建书签入参: time 缺省取当前时间 */
export type NewBookmark = Omit<Bookmark, "time"> & { time?: number };

/** 用于从书签里筛出本书的书籍标识 */
export interface BookRef {
  bookUrl: string;
}

/** 补齐 time, 得到可直接提交/入缓存的 Bookmark */
export function createBookmark(input: NewBookmark): Bookmark {
  return { ...input, time: input.time ?? Date.now() };
}

/**
 * 内部书签 → wire 唯一键 title: chapterName + "#" + chapterPos (chapterPos>0 时).
 * chapterName 为空回退「第 N 章」, 保证 title 非空 (空 title 后端拒收).
 * 同一 (bookUrl, title) 即同一条书签: 重复保存覆盖, 删除按它匹配.
 */
export function bookmarkTitle(bookmark: Bookmark): string {
  const base =
    bookmark.chapterName.length > 0
      ? bookmark.chapterName
      : `第 ${bookmark.chapterIndex + 1} 章`;
  return bookmark.chapterPos > 0 ? `${base}#${bookmark.chapterPos}` : base;
}

/** 内部 → wire (saveBookmark 提交全对象) */
export function bookmarkToWire(bookmark: Bookmark): BookmarkWire {
  return {
    bookUrl: bookmark.bookUrl,
    title: bookmarkTitle(bookmark),
    bookName: bookmark.bookName,
    bookAuthor: bookmark.bookAuthor,
    chapterName: bookmark.chapterName,
    bookText: bookmark.bookText,
    content: bookmark.content,
    paragraphIndex: bookmark.chapterPos,
    chapterIndex: bookmark.chapterIndex,
    createdAt: bookmark.time,
  };
}

/** wire → 内部 (getBookmarks 列表项) */
export function bookmarkFromWire(wire: BookmarkWire): Bookmark {
  return {
    bookUrl: wire.bookUrl,
    time: wire.createdAt,
    bookName: wire.bookName,
    bookAuthor: wire.bookAuthor,
    chapterIndex: wire.chapterIndex,
    chapterPos: wire.paragraphIndex,
    chapterName: wire.chapterName,
    bookText: wire.bookText,
    content: wire.content,
  };
}

/** 按阅读顺序排序: 章节 → 章内位置 → 时间 */
function byReadingOrder(a: Bookmark, b: Bookmark): number {
  if (a.chapterIndex !== b.chapterIndex) {
    return a.chapterIndex - b.chapterIndex;
  }
  if (a.chapterPos !== b.chapterPos) {
    return a.chapterPos - b.chapterPos;
  }
  return a.time - b.time;
}

/** 取出某本书的书签 (按阅读顺序); warp 已按 bookUrl 返回, 这里兜底再滤一遍 */
export function bookmarksOfBook(list: Bookmark[], book: BookRef): Bookmark[] {
  return list
    .filter((bookmark) => bookmark.bookUrl === book.bookUrl)
    .sort(byReadingOrder);
}

/** 与 warp saveBookmark 一致: 按主键 (bookUrl, title) upsert, 其余追加 */
export function upsertBookmark(list: Bookmark[], bookmark: Bookmark): Bookmark[] {
  const title = bookmarkTitle(bookmark);
  const rest = list.filter(
    (item) => !(item.bookUrl === bookmark.bookUrl && bookmarkTitle(item) === title),
  );
  return [...rest, bookmark];
}

/** 与 warp deleteBookmark(s) 一致: 按主键 (bookUrl, title) 移除 */
export function removeBookmarks(list: Bookmark[], targets: Bookmark[]): Bookmark[] {
  if (targets.length === 0) {
    return list;
  }
  const keys = new Set(targets.map((target) => `${target.bookUrl}\u0000${bookmarkTitle(target)}`));
  return list.filter((item) => !keys.has(`${item.bookUrl}\u0000${bookmarkTitle(item)}`));
}

/** 某本书的全部书签 (warp getBookmarks 必传 bookUrl); 从未加过书签时返回空数组 */
export async function getBookmarks(
  bookUrl: string,
  config?: ApiRequestConfig,
): Promise<Bookmark[]> {
  const data = await get<unknown>("/getBookmarks", { bookUrl }, config);
  return parseWith(bookmarkWireListSchema, data).map(bookmarkFromWire);
}

/** 保存书签 (提交 wire 全对象); 同 (bookUrl, title) 已有书签时后端覆盖 */
export async function saveBookmark(bookmark: Bookmark, config?: ApiRequestConfig): Promise<void> {
  await post<unknown>("/saveBookmark", bookmarkToWire(bookmark), config);
}

/** 删除单条书签 (后端按 bookUrl + title 匹配) */
export async function deleteBookmark(bookmark: Bookmark, config?: ApiRequestConfig): Promise<void> {
  await post<unknown>(
    "/deleteBookmark",
    { bookUrl: bookmark.bookUrl, title: bookmarkTitle(bookmark) },
    config,
  );
}

/** 批量删除书签, 用于「清空本书书签」; ids 为书签标题 (warp delete_bookmarks 契约) */
export async function deleteBookmarks(
  bookmarks: Bookmark[],
  config?: ApiRequestConfig,
): Promise<void> {
  if (bookmarks.length === 0) {
    return;
  }
  const bookUrl = bookmarks[0]?.bookUrl ?? "";
  await post<unknown>(
    "/deleteBookmarks",
    { bookUrl, ids: bookmarks.map(bookmarkTitle) },
    config,
  );
}
