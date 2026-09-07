import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SetURLSearchParams } from "react-router-dom";

import { toast } from "@/components/ui";
import { getJSON, setJSON } from "@/lib/storage";
import { saveBookProgress } from "@/services/book";
import { useSettingsStore } from "@/stores/settings-store";

/** 滚动停止后的进度保存防抖 (ms) */
const SAVE_DEBOUNCE_MS = 300;

/**
 * 章末位置标记: restorePos 为该值时, 滚动模式定位到最后一段, 翻页模式定位到最后一页.
 * (翻页模式下点「上一章」需要落在上一章末尾)
 */
export const END_OF_CHAPTER = Number.POSITIVE_INFINITY;

/** 章节内位置本地记录: 后端 saveBookProgress 只接受章节 index, pos 只能存前端 */
interface ReaderProgressRecord {
  index: number;
  pos: number;
}

function progressKey(bookUrl: string): string {
  return `reader.progress.${bookUrl}`;
}

export interface UseReaderProgressOptions {
  bookUrl: string;
  /** book.durChapterIndex, URL 未带 index 参数时作为初始章节 */
  durChapterIndex: number | undefined;
  /** book.durChapterPos, 初始章节的章内恢复位置 */
  durChapterPos: number | undefined;
  /** 章节总数 (边界判断 + toast), 未加载完成时为 0 */
  chapterCount: number;
  /** 各章标题 (与 index 同序): 保存进度时回传 durChapterTitle, 书架/我的页展示用 */
  chapterTitles?: readonly string[];
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
}

export interface UseReaderProgressResult {
  /** 当前章节索引: URL index 参数优先, 否则 book.durChapterIndex */
  index: number;
  /** 本次进入章节要恢复的段内位置 (END_OF_CHAPTER = 章末); 每次换章重新计算 */
  restorePos: number;
  /** 跳转章节: 越界 toast 提示; replace 更新 URL; 静默保存进度 */
  goToChapter: (next: number) => void;
  /** 上一章/下一章 (delta = ±1) */
  stepChapter: (delta: number) => void;
  /** ContentView 滚动/翻页时上报当前段 pos: 存内存 + 300ms 防抖保存 */
  reportPos: (pos: number) => void;
  /** 立即保存 (切章/卸载/visibilitychange/pagehide 兜底) */
  flushSave: () => void;
}

export function useReaderProgress(
  options: UseReaderProgressOptions,
): UseReaderProgressResult {
  const {
    bookUrl,
    durChapterIndex,
    durChapterPos,
    chapterCount,
    chapterTitles,
    searchParams,
    setSearchParams,
  } = options;

  // 当前章节索引: URL index 参数优先 (换章时写入), 否则回落到书籍进度
  const urlIndexParam = searchParams.get("index");
  const parsedUrlIndex =
    urlIndexParam === null ? Number.NaN : Number.parseInt(urlIndexParam, 10);
  const fromUrl =
    Number.isInteger(parsedUrlIndex) && parsedUrlIndex >= 0
      ? chapterCount > 0
        ? Math.min(parsedUrlIndex, chapterCount - 1)
        : parsedUrlIndex
      : null;
  const index = Math.max(0, fromUrl ?? durChapterIndex ?? 0);

  // 静默失败: 书未入架/网络异常时不打扰阅读
  const titlesRef = useRef(chapterTitles);
  titlesRef.current = chapterTitles;
  const saveMutation = useMutation({
    mutationFn: (target: number) =>
      saveBookProgress(bookUrl, target, titlesRef.current?.[target]),
    onError: () => {
      /* 静默 */
    },
  });
  const mutateSave = saveMutation.mutate;

  const indexRef = useRef(index);
  indexRef.current = index;
  const countRef = useRef(chapterCount);
  countRef.current = chapterCount;
  const posRef = useRef(0);
  const debounceRef = useRef<number | null>(null);

  // 用户主动换章的意图 (在事件回调里写入 state, 渲染阶段纯函数消费, StrictMode 安全)
  const [navIntent, setNavIntent] = useState<{ index: number; atEnd: boolean } | null>(null);

  const persistLocal = useCallback(() => {
    if (bookUrl === "") {
      return;
    }
    setJSON<ReaderProgressRecord>(progressKey(bookUrl), {
      index: indexRef.current,
      pos: posRef.current,
    });
  }, [bookUrl]);

  const flushSave = useCallback(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    persistLocal();
    if (bookUrl !== "" && countRef.current > 0) {
      mutateSave(indexRef.current);
    }
  }, [bookUrl, mutateSave, persistLocal]);

  const reportPos = useCallback(
    (pos: number) => {
      if (!Number.isFinite(pos) || pos < 0) {
        return;
      }
      posRef.current = pos;
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        persistLocal();
        if (bookUrl !== "" && countRef.current > 0) {
          mutateSave(indexRef.current);
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [bookUrl, mutateSave, persistLocal],
  );

  /** 计算进入章节 target 时要恢复的位置 (纯函数: 导航意图 state + 本地记录 + 书籍进度) */
  const restoreFor = useCallback(
    (target: number, intent: { index: number; atEnd: boolean } | null): number => {
      if (intent !== null && intent.index === target) {
        return intent.atEnd ? END_OF_CHAPTER : 0;
      }
      // 首次进入 (深链/刷新/浏览器前进后退): 优先上次退出时的本地记录, 其次 book.durChapterPos
      const local = bookUrl === "" ? null : getJSON<ReaderProgressRecord>(progressKey(bookUrl));
      if (local !== null && local.index === target && local.pos > 0) {
        return local.pos;
      }
      if (durChapterIndex !== undefined && target === durChapterIndex) {
        return Math.max(0, durChapterPos ?? 0);
      }
      return 0;
    },
    [bookUrl, durChapterIndex, durChapterPos],
  );

  // entry 随 index 变化重算 restorePos (渲染阶段 setState 调整, React 官方「派生 state」模式)
  const [entry, setEntry] = useState<{ index: number; pos: number }>(() => ({
    index,
    pos: restoreFor(index, navIntent),
  }));
  if (entry.index !== index) {
    setEntry({ index, pos: restoreFor(index, navIntent) });
  }

  // 意图被 entry 消费后才清: router 的 URL 更新走 transition, 可能比 setNavIntent 晚一帧提交;
  // 若在这里无条件清, 意图会在 index 落地前被抹掉, 「上一章落到上一章末尾」就永远不生效
  useEffect(() => {
    if (navIntent !== null && navIntent.index === entry.index) {
      setNavIntent(null);
    }
  }, [navIntent, entry.index]);

  // 切章: 保存新章节进度, pos 从恢复点起算
  const prevIndexRef = useRef(index);
  useEffect(() => {
    if (prevIndexRef.current === index) {
      return;
    }
    prevIndexRef.current = index;
    posRef.current = Number.isFinite(entry.pos) ? entry.pos : 0;
    flushSave();
  }, [index, entry.pos, flushSave]);

  // visibilitychange(hidden) / pagehide / 组件卸载兜底保存
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushSave();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", flushSave);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flushSave);
      flushSave();
    };
  }, [flushSave]);

  const goToChapter = useCallback(
    (next: number) => {
      if (!Number.isFinite(next)) {
        return;
      }
      const target = Math.trunc(next);
      const count = countRef.current;
      if (target < 0) {
        toast.info("已经是第一章了");
        return;
      }
      if (count > 0 && target >= count) {
        toast.info("已经是最后一章了");
        return;
      }
      if (target === indexRef.current) {
        return;
      }
      // 翻页模式下点「上一章」应落在上一章末尾
      const atEnd =
        target === indexRef.current - 1 && useSettingsStore.getState().readMode === "page";
      // 先记录离开章节的位置, 便于回退时恢复
      persistLocal();
      setNavIntent({ index: target, atEnd });
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set("url", bookUrl);
          params.set("index", String(target));
          return params;
        },
        { replace: true },
      );
    },
    [bookUrl, persistLocal, setSearchParams],
  );

  const stepChapter = useCallback(
    (delta: number) => {
      goToChapter(indexRef.current + delta);
    },
    [goToChapter],
  );

  return {
    index,
    restorePos: entry.pos,
    goToChapter,
    stepChapter,
    reportPos,
    flushSave,
  };
}
