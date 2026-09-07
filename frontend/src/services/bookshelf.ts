import {
  get,
  parseWith,
  post,
  type ApiRequestConfig,
} from "@/lib/api-client";
import {
  bookGroupListSchema,
  bookListSchema,
  bookSchema,
  type Book,
  type BookGroup,
} from "@/types/api";

/**
 * saveBook 入参: 后端 `bodyAsJson.mapTo(Book)`, 缺失字段用实体默认值补齐.
 * SearchBook 结构上满足该类型, 搜索结果可直接加入书架.
 */
export type SaveBookInput = Partial<Book> & Pick<Book, "bookUrl" | "origin">;

/** saveBookGroup 入参: 新增分组只需 groupName, 编辑时带上 groupId */
export type SaveBookGroupInput = Partial<BookGroup> & Pick<BookGroup, "groupName">;

/** @param refresh true 时后端会刷新每本书的最新章节(较慢) */
export async function getBookshelf(
  refresh?: boolean,
  config?: ApiRequestConfig,
): Promise<Book[]> {
  const data = await get<unknown>("/getBookshelf", { refresh: refresh ? 1 : undefined }, config);
  return parseWith(bookListSchema, data);
}

export async function saveBook(book: SaveBookInput, config?: ApiRequestConfig): Promise<Book> {
  const data = await post<unknown>("/saveBook", book, config);
  // warp Rust 后端 saveBook 返回 data=null (Kotlin 返回完整 Book):
  // null 时由入参构造乐观 Book 作为缓存条目, 字段缺省与后端实体默认值一致,
  // 各调用方的延迟对账会再用服务端真值替换.
  if (data === null || data === undefined) {
    return {
      tocUrl: "",
      originName: "",
      name: "",
      author: "",
      type: 0,
      group: 0,
      latestChapterTime: 0,
      lastCheckTime: 0,
      lastCheckCount: 0,
      totalChapterNum: 0,
      durChapterIndex: 0,
      durChapterPos: 0,
      durChapterTime: 0,
      canUpdate: true,
      order: 0,
      originOrder: 0,
      useReplaceRule: false,
      ...book,
    };
  }
  return parseWith(bookSchema, data);
}

/** 后端按 Book 实体解析, 只需 bookUrl */
export async function deleteBook(url: string, config?: ApiRequestConfig): Promise<void> {
  await post<unknown>("/deleteBook", { bookUrl: url }, config);
}

/** 后端 body 是 Book 对象数组 */
export async function deleteBooks(urls: string[], config?: ApiRequestConfig): Promise<void> {
  await post<unknown>(
    "/deleteBooks",
    urls.map((bookUrl) => ({ bookUrl })),
    config,
  );
}

export async function getBookGroups(config?: ApiRequestConfig): Promise<BookGroup[]> {
  const data = await get<unknown>("/getBookGroups", undefined, config);
  return parseWith(bookGroupListSchema, data);
}

export async function saveBookGroup(
  group: SaveBookGroupInput,
  config?: ApiRequestConfig,
): Promise<void> {
  // warp 入参按模型 wire 名 (id/name), 出参才是 legacy groupId/groupName — 此处反向映射
  await post<unknown>(
    "/saveBookGroup",
    {
      id: group.groupId ?? 0,
      name: group.groupName,
      order: group.order ?? 0,
      show: group.show ?? true,
    },
    config,
  );
}

export async function deleteBookGroup(groupId: number, config?: ApiRequestConfig): Promise<void> {
  await post<unknown>("/deleteBookGroup", { groupId }, config);
}

/** 修改书籍所属分组, 后端参数名是 bookUrl */
export async function saveBookGroupId(
  url: string,
  groupId: number,
  config?: ApiRequestConfig,
): Promise<void> {
  await post<unknown>("/saveBookGroupId", { bookUrl: url, groupId }, config);
}

/** 删除服务器上的章节缓存 */
export async function deleteBookCache(url: string, config?: ApiRequestConfig): Promise<void> {
  await post<unknown>("/deleteBookCache", { url }, config);
}
