import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import * as React from "react";

import { toast } from "@/components/ui";
import { ApiError } from "@/lib/api-client";
import { humanizeError, reportError } from "@/lib/errors";
import {
  deleteRssSource,
  getRssArticles,
  getRssContent,
  getRssSources,
  saveRssSource,
  type RssArticle,
  type RssSource,
  type RssSort,
} from "@/services/rss";

/** 服务端状态 query key: ["rssSources"]; 写操作后本地写回 + 延迟对账(与书源切片同套路) */
export const RSS_SOURCES_QUERY_KEY = ["rssSources"] as const;

const EMPTY_SOURCES: RssSource[] = [];

/**
 * 归一化后端/网络异常里的可展示文案: 原始串进 console, UI 只给人话.
 * 后端 errorMsg 会透传 JVM/协议异常原文, 一律经 humanizeError 映射;
 * 拿不到任何串时用调用方给的场景兜底(比通用兜底更有指向性).
 */
export function rssErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : "";
  if (raw.trim().length === 0) return fallback;
  reportError(raw, "rss");
  return humanizeError(raw, fallback);
}

export interface UseRssSourcesResult {
  sources: RssSource[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
}

/** 订阅列表: 进入页面即拉最新(其他端可能刚改过订阅) */
export function useRssSources(): UseRssSourcesResult {
  const query = useQuery({
    queryKey: RSS_SOURCES_QUERY_KEY,
    queryFn: () => getRssSources(),
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
 * 写入后立即重拉会读到旧数据(开关回跳、新增的订阅"不出现").
 * 因此写成功后一律按已知结果本地写回 ["rssSources"], 越过读缓存窗口后再延迟失效一次与服务端对齐.
 */
const RECONCILE_DELAY_MS = 6000;

function scheduleRssSourcesReconcile(queryClient: QueryClient): void {
  window.setTimeout(() => {
    void queryClient.invalidateQueries({ queryKey: RSS_SOURCES_QUERY_KEY });
  }, RECONCILE_DELAY_MS);
}

/** 本地写回新增/更新: 按 sourceUrl 去重, 已存在的原位覆盖、新地址追加(与后端 upsert 语义一致) */
function upsertRssSourcesIntoCache(queryClient: QueryClient, list: RssSource[]): void {
  const cached = queryClient.getQueryData<RssSource[]>(RSS_SOURCES_QUERY_KEY);
  if (cached === undefined) return;
  const merged = new Map(cached.map((source) => [source.sourceUrl, source]));
  for (const source of list) {
    merged.set(source.sourceUrl, source);
  }
  queryClient.setQueryData<RssSource[]>(RSS_SOURCES_QUERY_KEY, [...merged.values()]);
}

/** 本地写回删除 */
function removeRssSourcesFromCache(queryClient: QueryClient, urls: ReadonlySet<string>): void {
  const cached = queryClient.getQueryData<RssSource[]>(RSS_SOURCES_QUERY_KEY);
  if (cached === undefined) return;
  queryClient.setQueryData<RssSource[]>(
    RSS_SOURCES_QUERY_KEY,
    cached.filter((source) => !urls.has(source.sourceUrl)),
  );
}

/** 新增/编辑订阅(单源 upsert, 后端对空名称/链接报错); 成功提示由调用方按场景给出 */
export function useSaveRssSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (source: RssSource) => saveRssSource(source),
    onSuccess: (_data, source) => {
      upsertRssSourcesIntoCache(queryClient, [source]);
      scheduleRssSourcesReconcile(queryClient);
    },
    onError: (error) => {
      toast.error(rssErrorMessage(error, "保存订阅失败"));
    },
  });
}

/**
 * 启用/禁用开关: 先乐观写回 ["rssSources"] 缓存(整对象提交, 保留解析规则等其他字段),
 * 失败回滚并提示; 成功后不立即重拉(后端读缓存会返回旧值), 延迟对账.
 */
export function useToggleRssEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ url, enabled }: { url: string; enabled: boolean }) => {
      const cached = queryClient.getQueryData<RssSource[]>(RSS_SOURCES_QUERY_KEY) ?? EMPTY_SOURCES;
      const target = cached.find((source) => source.sourceUrl === url);
      if (target === undefined) {
        throw new ApiError("订阅数据已过期, 请刷新后重试");
      }
      const next = { ...target, enabled };
      queryClient.setQueryData<RssSource[]>(
        RSS_SOURCES_QUERY_KEY,
        cached.map((source) => (source.sourceUrl === url ? next : source)),
      );
      try {
        await saveRssSource(next);
      } catch (error) {
        queryClient.setQueryData<RssSource[]>(RSS_SOURCES_QUERY_KEY, cached);
        throw error;
      }
    },
    onSuccess: () => {
      scheduleRssSourcesReconcile(queryClient);
    },
    onError: (error) => {
      toast.error(rssErrorMessage(error, "切换启用状态失败"));
    },
  });
}

/** 删除订阅; 成功后本地写回缓存并提示 */
export function useDeleteRssSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => deleteRssSource(url),
    onSuccess: (_data, url) => {
      removeRssSourcesFromCache(queryClient, new Set([url]));
      scheduleRssSourcesReconcile(queryClient);
      toast.success("已删除订阅");
    },
    onError: (error) => {
      toast.error(rssErrorMessage(error, "删除订阅失败"));
    },
  });
}

export interface UseRssArticlesResult {
  /** 跨页按 link 去重后的文章列表 */
  articles: RssArticle[];
  isLoading: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  /** 最近一次成功抓取完成的时间戳(ms); 尚无数据时为 0 */
  fetchedAt: number;
  error: Error | null;
  refetch: () => void;
  hasMore: boolean;
  fetchNextPage: () => void;
}

/**
 * 选中订阅的文章列表: 每次翻页都请求后端(后端实时抓取 Feed).
 * 分页由 ruleNextPage 驱动: 响应 second(下一页 URL)非空才允许加载下一页, page 递增、sortUrl 不变
 * (与旧 Vue 前端及 legado 的 <page> 替换语义一致).
 */
export function useRssArticles(source: RssSource | null, sort: RssSort | null): UseRssArticlesResult {
  const sourceUrl = source?.sourceUrl ?? "";
  const sortName = sort?.name ?? "";
  const sortUrl = sort?.url ?? "";
  const query = useInfiniteQuery({
    queryKey: ["rssArticles", sourceUrl, sortName, sortUrl],
    queryFn: ({ pageParam }) => getRssArticles({ sourceUrl, sortName, sortUrl, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.second.length > 0 ? pages.length + 1 : undefined),
    enabled: sourceUrl.length > 0,
    refetchOnMount: "always",
  });

  const articles = React.useMemo(() => {
    const seen = new Set<string>();
    const merged: RssArticle[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const article of page.first) {
        const key = article.link.length > 0 ? article.link : `${article.title}|${article.pubDate}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(article);
      }
    }
    return merged;
  }, [query.data]);

  return {
    articles,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchedAt: query.dataUpdatedAt,
    error: query.error,
    refetch: query.refetch,
    hasMore: query.hasNextPage,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
  };
}

export interface UseRssArticleContentResult {
  /** 正文 HTML(未清洗); 优先用文章自带 content, 否则走 /getRssContent */
  content: string;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * 文章正文: 文章对象自带 content(默认解析器的 content:encoded)时直接用,
 * 否则请求 /getRssContent(依赖源的 ruleContent, 未配置时后端返回空串).
 * article 传 null 时不发请求(阅读对话框关闭态).
 */
export function useRssArticleContent(
  sourceUrl: string,
  article: RssArticle | null,
): UseRssArticleContentResult {
  const link = article?.link ?? "";
  const origin = article?.origin ?? "";
  const embedded = article?.content ?? "";
  const query = useQuery({
    queryKey: ["rssContent", sourceUrl, link],
    queryFn: () => getRssContent({ sourceUrl, link, origin }),
    enabled: sourceUrl.length > 0 && link.length > 0 && embedded.length === 0,
    // 正文不随时间失效: 同一次会话内重开对话框不再抓取
    staleTime: Infinity,
    retry: 1,
  });

  return {
    content: embedded.length > 0 ? embedded : (query.data ?? ""),
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
