import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { toast } from "@/components/ui";
import { BOOKS_QUERY_KEY, errorMessage, useBookshelf, useDeleteBook } from "@/hooks/useBookshelf";
import { saveBook } from "@/services/bookshelf";
import type { Book } from "@/types/api";

export interface ShelfToggle {
  /** 本书是否在书架上 */
  inShelf: boolean;
  /** 书架列表还没拉到: 顶栏按钮据此禁用, 免得闪一下「加入书架」又把已在架的书重存一遍 */
  isLoading: boolean;
  /** 加入/移出请求中 */
  busy: boolean;
  toggle: () => void;
}

/**
 * 顶栏「书架」开关: 判重口径与书籍详情弹窗一致 (bookUrl 相同, 或书名 + 作者相同 ——
 * 后端 saveBook 正是按书名 + 作者判重). 在架走 deleteBook 移出, 不在架走 saveBook 加入.
 *
 * 只在「不在架」时调 saveBook: 后端对已在架的书会用书架里的旧值覆盖 durChapter*,
 * 阅读中误存一次就会把进度打回去.
 */
export function useShelfToggle(book: Book | undefined): ShelfToggle {
  const queryClient = useQueryClient();
  const { books, isLoading } = useBookshelf();
  const deleteBook = useDeleteBook();

  const shelfBook = React.useMemo(() => {
    if (book === undefined) {
      return undefined;
    }
    return books.find(
      (item) =>
        item.bookUrl === book.bookUrl || (item.name === book.name && item.author === book.author),
    );
  }, [books, book]);

  const addMutation = useMutation({
    // Book → saveBook 入参: 只带书籍身份与展示字段, 进度类字段交给后端实体默认值
    mutationFn: (target: Book) =>
      saveBook({
        bookUrl: target.bookUrl,
        tocUrl: target.tocUrl,
        origin: target.origin,
        originName: target.originName,
        name: target.name,
        author: target.author,
        kind: target.kind,
        coverUrl: target.coverUrl,
        intro: target.intro,
        latestChapterTitle: target.latestChapterTitle,
        totalChapterNum: target.totalChapterNum,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BOOKS_QUERY_KEY });
      toast.success("已加入书架");
    },
    onError: (error) => {
      toast.error(errorMessage(error, "加入书架失败"));
    },
  });

  // 后端用户存储读取有数秒缓存, 书架列表不会立刻反映刚才的增删: 本地意图先顶上
  const [override, setOverride] = React.useState<boolean | null>(null);
  const membership = shelfBook !== undefined;
  React.useEffect(() => {
    if (override !== null && override === membership) {
      setOverride(null);
    }
  }, [override, membership]);

  const mutateAdd = addMutation.mutate;
  const mutateDelete = deleteBook.mutate;
  // 后端用户存储 5s 读缓存: 增删后立即 invalidate 会取回旧书架, 延迟再对账一次
  const scheduleReconcile = React.useCallback(() => {
    window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: BOOKS_QUERY_KEY });
    }, 5500);
  }, [queryClient]);


  const toggle = React.useCallback(() => {
    if (book === undefined) {
      return;
    }
    if (shelfBook !== undefined) {
      setOverride(false);
      mutateDelete([shelfBook.bookUrl]);
      scheduleReconcile();
      return;
    }
    setOverride(true);
    mutateAdd(book);
    scheduleReconcile();
  }, [book, shelfBook, mutateAdd, mutateDelete, scheduleReconcile]);

  return {
    inShelf: override ?? membership,
    isLoading: book === undefined || (isLoading && override === null),
    busy: addMutation.isPending || deleteBook.isPending,
    toggle,
  };
}
