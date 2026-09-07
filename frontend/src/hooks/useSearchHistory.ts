import { useCallback, useEffect, useState } from "react";

import { getJSON, setJSON } from "@/lib/storage";

const STORAGE_KEY = "reader.searchHistory";
const MAX_ITEMS = 10;

export interface UseSearchHistoryResult {
  /** 最近搜索关键词, 新的在前 */
  history: string[];
  /** 前插并去重, 只保留最近 10 条 */
  add: (key: string) => void;
  clear: () => void;
}

/** localStorage 持久化的搜索历史(reader.searchHistory). 写入统一走 effect, 保证 updater 纯函数. */
export function useSearchHistory(): UseSearchHistoryResult {
  const [history, setHistory] = useState<string[]>(() => {
    const stored = getJSON<unknown>(STORAGE_KEY);
    if (!Array.isArray(stored)) {
      return [];
    }
    return stored
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, MAX_ITEMS);
  });

  useEffect(() => {
    setJSON(STORAGE_KEY, history);
  }, [history]);

  const add = useCallback((key: string) => {
    const trimmed = key.trim();
    if (trimmed.length === 0) {
      return;
    }
    setHistory((prev) => [trimmed, ...prev.filter((item) => item !== trimmed)].slice(0, MAX_ITEMS));
  }, []);

  const clear = useCallback(() => {
    setHistory([]);
  }, []);

  return { history, add, clear };
}
