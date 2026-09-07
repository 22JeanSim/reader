import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui";
import { ApiError } from "@/lib/api-client";
import { reportError } from "@/lib/errors";
import {
  deleteBookSources,
  getBookSources,
  getInvalidBookSources,
  getSourceStats,
  saveBookSources,
  type InvalidBookSource,
} from "@/services/sources";
import type { BookSource } from "@/types/api";

/** 服务端状态 query key: ["sources"] 与搜索页(进度总数)、书海页(书源下拉)共享; 写操作后本地写回 + 延迟对账 */
export const SOURCES_QUERY_KEY = ["sources"] as const;
export const INVALID_SOURCES_QUERY_KEY = ["invalidSources"] as const;

/** 分组 tab 的哨兵值: 加前缀避免与真实分组名冲突 */
export const SOURCE_GROUP_ALL = "__all__";
export const SOURCE_GROUP_UNGROUPED = "__ungrouped__";
/** 未分组 tab 的展示名(与旧 Vue 前端一致) */
export const UNGROUPED_LABEL = "未分组";

const EMPTY_SOURCES: BookSource[] = [];
const EMPTY_INVALID: InvalidBookSource[] = [];

/** 归一化后端/网络异常里的可展示文案: 原始技术串进 console, UI 只给人话 */
export function sourceErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : "";
  if (raw.trim().length === 0) return fallback;
  return reportError(raw, fallback);
}

export interface SourceGroupItem {
  /** tab 值: 哨兵或 bookSourceGroup 原文 */
  value: string;
  name: string;
  count: number;
}

/**
 * 分组 tab 数据源: 全部 + 各非空 bookSourceGroup + 未分组.
 * 分组按整串聚合(不拆逗号/分号, 与旧 Vue 前端一致), 保持首次出现顺序.
 */
export function buildSourceGroups(sources: BookSource[]): SourceGroupItem[] {
  const counts = new Map<string, number>();
  let ungrouped = 0;
  for (const source of sources) {
    const group = source.bookSourceGroup.trim();
    if (group.length === 0) {
      ungrouped += 1;
      continue;
    }
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  const items: SourceGroupItem[] = [
    { value: SOURCE_GROUP_ALL, name: "全部", count: sources.length },
  ];
  for (const [name, count] of counts) {
    items.push({ value: name, name, count });
  }
  if (ungrouped > 0) {
    items.push({ value: SOURCE_GROUP_UNGROUPED, name: UNGROUPED_LABEL, count: ungrouped });
  }
  return items;
}

/** 分组 + 关键词本地过滤: 关键词命不区分大小写, 匹配名称/地址/分组/注释 */
export function filterSources(
  sources: BookSource[],
  group: string,
  keyword: string,
): BookSource[] {
  let inGroup = sources;
  if (group === SOURCE_GROUP_UNGROUPED) {
    inGroup = sources.filter((source) => source.bookSourceGroup.trim().length === 0);
  } else if (group !== SOURCE_GROUP_ALL) {
    inGroup = sources.filter((source) => source.bookSourceGroup === group);
  }
  const query = keyword.trim().toLowerCase();
  if (query.length === 0) return inGroup;
  return inGroup.filter(
    (source) =>
      source.bookSourceName.toLowerCase().includes(query) ||
      source.bookSourceUrl.toLowerCase().includes(query) ||
      source.bookSourceGroup.toLowerCase().includes(query) ||
      source.bookSourceComment.toLowerCase().includes(query),
  );
}

export interface UseBookSourcesResult {
  sources: BookSource[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
}

/** 书源列表: queryKey ["sources"], 进入页面即拉最新(其他端/切片可能刚改过书源) */
export function useBookSources(): UseBookSourcesResult {
  const query = useQuery({
    queryKey: SOURCES_QUERY_KEY,
    queryFn: () => getBookSources(),
    refetchOnMount: "always",
  });

  return {
    sources: query.data ?? EMPTY_SOURCES,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * 后端 getStorage 有 5 秒读缓存且 saveStorage 不会使其失效:
 * 写入后立即重拉会读到旧数据(开关回跳、导入的书源"不出现").
 * 因此写成功后一律按已知结果本地写回 ["sources"], 越过读缓存窗口后再延迟失效一次与服务端对齐.
 */
const RECONCILE_DELAY_MS = 6000;

function scheduleSourcesReconcile(queryClient: QueryClient): void {
  window.setTimeout(() => {
    void queryClient.invalidateQueries({ queryKey: SOURCES_QUERY_KEY });
  }, RECONCILE_DELAY_MS);
}

/** 本地写回新增/更新: 按 bookSourceUrl 去重, 已存在的原位覆盖、新地址追加(与后端 upsert 语义一致) */
function upsertSourcesIntoCache(queryClient: QueryClient, list: BookSource[]): void {
  const cached = queryClient.getQueryData<BookSource[]>(SOURCES_QUERY_KEY);
  if (cached === undefined) return;
  const merged = new Map(cached.map((source) => [source.bookSourceUrl, source]));
  for (const source of list) {
    merged.set(source.bookSourceUrl, source);
  }
  queryClient.setQueryData<BookSource[]>(SOURCES_QUERY_KEY, [...merged.values()]);
}

/** 本地写回删除 */
function removeSourcesFromCache(queryClient: QueryClient, urls: ReadonlySet<string>): void {
  const cached = queryClient.getQueryData<BookSource[]>(SOURCES_QUERY_KEY);
  if (cached === undefined) return;
  queryClient.setQueryData<BookSource[]>(
    SOURCES_QUERY_KEY,
    cached.filter((source) => !urls.has(source.bookSourceUrl)),
  );
}

/** 批量新增/更新书源(导入、JSON 编辑共用); 成功提示由调用方按场景给出 */
export function useSaveBookSources() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (list: BookSource[]) => saveBookSources(list),
    onSuccess: (_data, list) => {
      upsertSourcesIntoCache(queryClient, list);
      scheduleSourcesReconcile(queryClient);
    },
    onError: (error) => {
      toast.error(sourceErrorMessage(error, "保存书源失败"));
    },
  });
}

/**
 * 启用/禁用开关: 先乐观写回 ["sources"] 缓存(整对象提交, 保留探索规则等其他字段),
 * 失败回滚并提示; 成功后不立即重拉(后端读缓存会返回旧值), 延迟对账.
 */
export function useToggleSourceEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ url, enabled }: { url: string; enabled: boolean }) => {
      const cached = queryClient.getQueryData<BookSource[]>(SOURCES_QUERY_KEY) ?? EMPTY_SOURCES;
      const target = cached.find((source) => source.bookSourceUrl === url);
      if (target === undefined) {
        throw new ApiError("书源数据已过期, 请刷新后重试");
      }
      const next = { ...target, enabled };
      queryClient.setQueryData<BookSource[]>(
        SOURCES_QUERY_KEY,
        cached.map((source) => (source.bookSourceUrl === url ? next : source)),
      );
      try {
        await saveBookSources([next]);
      } catch (error) {
        queryClient.setQueryData<BookSource[]>(SOURCES_QUERY_KEY, cached);
        throw error;
      }
    },
    onSuccess: () => {
      scheduleSourcesReconcile(queryClient);
    },
    onError: (error) => {
      toast.error(sourceErrorMessage(error, "切换启用状态失败"));
    },
  });
}

/** 批量删除书源; 成功后本地写回缓存并提示 */
export function useDeleteBookSources() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (urls: string[]) => deleteBookSources(urls),
    onSuccess: (_data, urls) => {
      removeSourcesFromCache(queryClient, new Set(urls));
      scheduleSourcesReconcile(queryClient);
      toast.success(urls.length > 1 ? `已删除 ${urls.length} 个书源` : "已删除书源");
    },
    onError: (error) => {
      toast.error(sourceErrorMessage(error, "删除书源失败"));
    },
  });
}

export interface UseInvalidBookSourcesResult {
  invalidSources: InvalidBookSource[];
  /** 检测请求进行中 */
  isChecking: boolean;
  /** 最近一次检测成功的时间戳(ms); 本次会话还没成功过为 null */
  lastCheckedAt: number | null;
  error: Error | null;
  /** 手动触发检测(点「检测失效」时调用) */
  check: () => void;
}

/** 失效书源检测: 数据来自后端搜索/换源时写入的短期缓存, 只在手动触发时请求 */
export function useInvalidBookSources(): UseInvalidBookSourcesResult {
  const query = useQuery({
    queryKey: INVALID_SOURCES_QUERY_KEY,
    queryFn: () => getInvalidBookSources(),
    enabled: false,
    retry: false,
  });

  return {
    invalidSources: query.data ?? EMPTY_INVALID,
    isChecking: query.isFetching,
    lastCheckedAt: query.dataUpdatedAt > 0 ? query.dataUpdatedAt : null,
    error: query.error,
    check: query.refetch,
  };
}

/** 书源置信度统计: 书源页徽标与清理无效源依据; 搜索行为会持续刷新 */
export const SOURCE_STATS_QUERY_KEY = ["sourceStats"] as const;

export function useSourceStats() {
  return useQuery({
    queryKey: SOURCE_STATS_QUERY_KEY,
    queryFn: () => getSourceStats(),
    staleTime: 60_000,
  });
}
