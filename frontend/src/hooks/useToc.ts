import { useCallback, useEffect, useState } from "react";

import { useReaderUIStore } from "@/stores/reader-ui-store";
import type { Book } from "@/types/api";

export interface UseTocOptions {
  /** 当前书籍, readConfig.reverseToc 作为倒序开关初始值 */
  book: Book | undefined;
  /** 点击章节 → 切章 (useReaderProgress.goToChapter) */
  onNavigate: (index: number) => void;
}

export interface UseTocResult {
  tocOpen: boolean;
  setTocOpen: (open: boolean) => void;
  /** 目录是否倒序显示 */
  reversed: boolean;
  toggleReversed: () => void;
  /** 选择章节: 切章并关闭抽屉 */
  selectChapter: (index: number) => void;
}

/** 目录抽屉: 开关状态 (reader-ui-store) + 倒序开关 + 章节跳转 */
export function useToc({ book, onNavigate }: UseTocOptions): UseTocResult {
  const tocOpen = useReaderUIStore((state) => state.tocOpen);
  const setTocOpen = useReaderUIStore((state) => state.setTocOpen);

  const reverseToc = book?.readConfig?.reverseToc ?? false;
  const [reversed, setReversed] = useState(reverseToc);

  // 书籍信息就绪后同步书源配置的倒序偏好
  useEffect(() => {
    setReversed(reverseToc);
  }, [reverseToc]);

  const toggleReversed = useCallback(() => {
    setReversed((value) => !value);
  }, []);

  const selectChapter = useCallback(
    (index: number) => {
      onNavigate(index);
      setTocOpen(false);
    },
    [onNavigate, setTocOpen],
  );

  return { tocOpen, setTocOpen, reversed, toggleReversed, selectChapter };
}
