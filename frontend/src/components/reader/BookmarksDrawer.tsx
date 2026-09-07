import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bookmark as BookmarkIcon, BookmarkPlus, CircleAlert, Trash2 } from "lucide-react";
import * as React from "react";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  EmptyState,
  IconButton,
  Spinner,
  Textarea,
  cn,
  toast,
} from "@/components/ui";
import type { ReaderParagraph } from "@/hooks/useChapterContent";
import { humanizeError } from "@/lib/errors";
import {
  bookmarksQueryKey,
  deleteBookmark,
  deleteBookmarks,
  removeBookmarks,
  saveBookmark,
  upsertBookmark,
  type Bookmark,
} from "@/services/bookmarks";

/** 书签摘要长度上限: 只留段落开头, 不把整段塞进服务端 JSON */
const MAX_BOOKMARK_TEXT = 200;

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const yearTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 书签时间: 当年省略年份, time 缺失(0)时不显示 */
function formatBookmarkTime(time: number): string {
  if (time <= 0) {
    return "";
  }
  const date = new Date(time);
  const formatter =
    date.getFullYear() === new Date().getFullYear() ? timeFormatter : yearTimeFormatter;
  return formatter.format(date);
}

/** 后端/网络异常 → 可展示文案: 原始技术串经 humanizeError 映射, 拿不到串时用场景兜底 */
function messageOf(error: unknown, fallback: string): string {
  return humanizeError(error instanceof Error ? error.message : "", fallback);
}

/**
 * 浮层内屏蔽 ←/→: ContentView 的翻页快捷键先看 defaultPrevented,
 * 不拦的话抽屉/弹窗开着时背后仍在翻页.
 */
function suppressArrowKeys(event: React.KeyboardEvent): void {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return;
  }
  const target = event.target;
  if (target instanceof HTMLElement) {
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
      return;
    }
  }
  event.preventDefault();
}

/* ---------- 当前阅读位置 → 书签摘要 ---------- */

/** HTML 片段(段落 text 是 DOMPurify 清洗后的 HTML) → 单行纯文本 */
function plainText(html: string): string {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  return (holder.textContent ?? "").replace(/\s+/g, " ").trim();
}

function excerptOf(item: ReaderParagraph): string {
  if (item.type === "image") {
    return "[图片]";
  }
  return plainText(item.text).slice(0, MAX_BOOKMARK_TEXT);
}

export interface BookmarkExcerpt {
  /** 段首字符在整章文本中的位置 (chapterPos), 与 Book.durChapterPos 同语义 */
  pos: number;
  /** 段落纯文本摘要; 正文未就绪时为空串 */
  text: string;
}

/**
 * 定位当前阅读位置的段落:
 * 扫描正文容器内带 data-pos 的节点, 取第一个与容器可视区相交的 ——
 * 滚动模式即视口首段; 翻页模式其余页被 overflow 裁到容器外, 相交的就是当前页首段.
 * 正文尚未排版(加载中/分页测量前)时退回本章第一个有文本的段落.
 */
export function locateBookmark(
  root: HTMLElement | null,
  items: ReaderParagraph[],
): BookmarkExcerpt {
  const readable = items.filter((item) => item.pos >= 0);
  if (root !== null) {
    const box = root.getBoundingClientRect();
    for (const node of root.querySelectorAll<HTMLElement>("[data-pos]")) {
      const rect = node.getBoundingClientRect();
      const inView =
        rect.right > box.left + 1 &&
        rect.left < box.right - 1 &&
        rect.bottom > box.top + 1 &&
        rect.top < box.bottom - 1;
      if (!inView) {
        continue;
      }
      const pos = Number(node.dataset.pos);
      const item = readable.find((candidate) => candidate.pos === pos);
      const text = item === undefined ? "" : excerptOf(item);
      if (text !== "") {
        return { pos, text };
      }
    }
  }
  for (const item of readable) {
    const text = excerptOf(item);
    if (text !== "") {
      return { pos: item.pos, text };
    }
  }
  return { pos: 0, text: "" };
}

/* ---------- 增删 (含缓存写回) ---------- */

export interface BookmarkActions {
  /** 保存书签; onSuccess 用于请求成功后关闭弹窗 */
  add: (bookmark: Bookmark, onSuccess?: () => void) => void;
  adding: boolean;
  remove: (bookmark: Bookmark) => void;
  /** 清空本书书签 (批量删除) */
  clear: (bookmarks: Bookmark[]) => void;
  /** 删除/清空请求中: 抽屉里的删除按钮据此禁用 */
  busy: boolean;
}

/**
 * 书签增删: 成功后只按后端语义 (warp 主键 (bookUrl, title): 同键覆盖 / 按键删除)
 * 本地写回 ["bookmarks", bookUrl] 缓存, 不做写后立即 refetch.
 */
export function useBookmarkActions(): BookmarkActions {
  const queryClient = useQueryClient();

  const patchCache = React.useCallback(
    (bookUrl: string, update: (prev: Bookmark[]) => Bookmark[]) => {
      queryClient.setQueryData<Bookmark[]>(bookmarksQueryKey(bookUrl), (prev) =>
        update(prev ?? []),
      );
    },
    [queryClient],
  );

  const addMutation = useMutation({
    mutationFn: (bookmark: Bookmark) => saveBookmark(bookmark),
    onSuccess: (_data, bookmark) => {
      patchCache(bookmark.bookUrl, (prev) => upsertBookmark(prev, bookmark));
      toast.success("已加入书签");
    },
    onError: (error) => {
      toast.error(messageOf(error, "加入书签失败"));
    },
  });

  const removeMutation = useMutation({
    mutationFn: (bookmark: Bookmark) => deleteBookmark(bookmark),
    onSuccess: (_data, bookmark) => {
      patchCache(bookmark.bookUrl, (prev) => removeBookmarks(prev, [bookmark]));
      toast.success("已删除书签");
    },
    onError: (error) => {
      toast.error(messageOf(error, "删除书签失败"));
    },
  });

  const clearMutation = useMutation({
    mutationFn: (bookmarks: Bookmark[]) => deleteBookmarks(bookmarks),
    onSuccess: (_data, bookmarks) => {
      const bookUrl = bookmarks[0]?.bookUrl;
      if (bookUrl !== undefined) {
        patchCache(bookUrl, (prev) => removeBookmarks(prev, bookmarks));
      }
      toast.success(`已清空 ${bookmarks.length} 个书签`);
    },
    onError: (error) => {
      toast.error(messageOf(error, "清空书签失败"));
    },
  });

  const mutateAdd = addMutation.mutate;
  const mutateRemove = removeMutation.mutate;
  const mutateClear = clearMutation.mutate;

  const add = React.useCallback(
    (bookmark: Bookmark, onSuccess?: () => void) => {
      mutateAdd(bookmark, { onSuccess });
    },
    [mutateAdd],
  );
  const remove = React.useCallback((bookmark: Bookmark) => mutateRemove(bookmark), [mutateRemove]);
  const clear = React.useCallback((bookmarks: Bookmark[]) => mutateClear(bookmarks), [mutateClear]);

  return {
    add,
    adding: addMutation.isPending,
    remove,
    clear,
    busy: removeMutation.isPending || clearMutation.isPending,
  };
}

/* ---------- 加入书签弹窗 ---------- */

/** 「加入书签」的待存草稿: 位置与摘要已定位好, 用户只补备注 */
export interface BookmarkDraft {
  chapterIndex: number;
  chapterName: string;
  chapterPos: number;
  bookText: string;
}

export interface AddBookmarkDialogProps {
  /** 为 null 时弹窗关闭 */
  draft: BookmarkDraft | null;
  onOpenChange: (open: boolean) => void;
  /** 同一位置已有书签: 服务端按 (书, 位置) 只保留一条, 保存即覆盖, 需要显式确认 */
  existing: Bookmark | undefined;
  pending: boolean;
  onSave: (content: string) => void;
}

/** 加入书签: 显示章节 + 段落摘要, 可写备注; 同位置已有书签时主按钮变为「覆盖书签」 */
export function AddBookmarkDialog({
  draft,
  onOpenChange,
  existing,
  pending,
  onSave,
}: AddBookmarkDialogProps) {
  const [content, setContent] = React.useState("");
  // 换一条草稿(章节/位置变化)时清空上次备注: 渲染阶段派生 state, 不额外跑 effect
  const draftKey = draft === null ? null : `${draft.chapterIndex}:${draft.chapterPos}`;
  const [seenDraftKey, setSeenDraftKey] = React.useState<string | null>(null);
  if (draftKey !== seenDraftKey) {
    setSeenDraftKey(draftKey);
    setContent("");
  }

  // 已有书签的描述: 「章节名 · 时间」, 缺项自动省略
  const existingLabel =
    existing === undefined
      ? ""
      : [
          existing.chapterName === "" ? `第 ${existing.chapterIndex + 1} 章` : existing.chapterName,
          formatBookmarkTime(existing.time),
        ]
          .filter((part) => part !== "")
          .join(" · ");

  return (
    <Dialog open={draft !== null} onOpenChange={onOpenChange}>
      <DialogContent width="sm" onKeyDown={suppressArrowKeys}>
        <DialogHeader>
          <DialogTitle>加入书签</DialogTitle>
          <DialogDescription className="truncate">
            {draft?.chapterName ?? ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-4 md:px-5">
          <p className="line-clamp-4 rounded-lg border border-border bg-surface-muted/60 px-3 py-2 text-sm leading-6 text-muted-foreground">
            {draft === null || draft.bookText === "" ? "(本段没有可摘录的文本)" : draft.bookText}
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">备注</span>
            <Textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="写点想法, 可留空"
              maxLength={200}
              autoSize
            />
          </label>
          {existing === undefined ? null : (
            <p className="text-xs leading-5 text-muted-foreground">
              该位置已有书签 ({existingLabel}), 同一位置只保留一条, 保存会覆盖它.
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">取消</Button>
          </DialogClose>
          <Button
            variant={existing === undefined ? "primary" : "danger"}
            loading={pending}
            onClick={() => onSave(content.trim())}
          >
            {existing === undefined ? (
              <>
                <BookmarkPlus aria-hidden />
                保存书签
              </>
            ) : (
              "覆盖书签"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- 书签抽屉 ---------- */

export interface BookmarksDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 本书书签 (已按阅读顺序) */
  bookmarks: Bookmark[];
  /** 当前章节索引: 落在本章的书签高亮 */
  currentIndex: number;
  isLoading: boolean;
  /** 拉取失败的原因, 空串表示无错误 */
  errorMessage: string;
  onRetry: () => void;
  /** 点击书签: 跳到对应章节 (关闭抽屉由页面处理) */
  onSelect: (bookmark: Bookmark) => void;
  onDelete: (bookmark: Bookmark) => void;
  onClear: () => void;
  /** 删除/清空请求中 */
  busy: boolean;
}

/** 书签抽屉: 右侧滑出, 列出本书书签(章节名 + 段落摘要 + 备注 + 时间), 支持跳章/删除/清空 */
export function BookmarksDrawer({
  open,
  onOpenChange,
  bookmarks,
  currentIndex,
  isLoading,
  errorMessage,
  onRetry,
  onSelect,
  onDelete,
  onClear,
  busy,
}: BookmarksDrawerProps) {
  // 清空是不可逆的批量删除: 先确认并点名数量, 免得手滑抹掉整本书的书签
  const [confirmClear, setConfirmClear] = React.useState(false);

  const handleConfirmClear = React.useCallback(() => {
    setConfirmClear(false);
    onClear();
  }, [onClear]);

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div className="flex h-full items-center justify-center">
        <Spinner label="书签加载中" />
      </div>
    );
  } else if (errorMessage !== "") {
    body = (
      <EmptyState
        compact
        icon={<CircleAlert />}
        title="书签加载失败"
        description={errorMessage}
        action={<Button onClick={onRetry}>重试</Button>}
      />
    );
  } else if (bookmarks.length === 0) {
    body = (
      <EmptyState
        compact
        icon={<BookmarkIcon />}
        title="还没有书签"
        description="阅读时点顶栏的「加入书签」, 就能把当前段落收在这里."
      />
    );
  } else {
    body = (
      <ul className="flex flex-col gap-0.5">
        {bookmarks.map((bookmark) => {
          const active = bookmark.chapterIndex === currentIndex;
          const time = formatBookmarkTime(bookmark.time);
          return (
            <li key={`${bookmark.chapterIndex}:${bookmark.chapterPos}:${bookmark.time}`} className="flex items-start gap-0.5">
              <button
                type="button"
                onClick={() => onSelect(bookmark)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "min-w-0 flex-1 cursor-pointer rounded-lg px-2.5 py-2 text-left transition-colors",
                  active ? "bg-accent/10" : "hover:bg-surface-muted",
                )}
              >
                <span className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm font-medium",
                      active ? "text-accent" : "text-foreground",
                    )}
                  >
                    {bookmark.chapterName === ""
                      ? `第 ${bookmark.chapterIndex + 1} 章`
                      : bookmark.chapterName}
                  </span>
                  {time === "" ? null : (
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {time}
                    </span>
                  )}
                </span>
                {bookmark.bookText === "" ? null : (
                  <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                    {bookmark.bookText}
                  </span>
                )}
                {bookmark.content === "" ? null : (
                  <span className="mt-1 line-clamp-2 block text-xs leading-5 text-accent/90">
                    备注 · {bookmark.content}
                  </span>
                )}
              </button>
              <IconButton
                variant="ghost"
                size="sm"
                aria-label="删除书签"
                className="mt-1.5 text-muted-foreground"
                disabled={busy}
                onClick={() => onDelete(bookmark)}
              >
                <Trash2 />
              </IconButton>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <>
      <Drawer side="right" open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="w-[85vw] max-w-xs" onKeyDown={suppressArrowKeys}>
          <DrawerHeader>
            <DrawerTitle>书签</DrawerTitle>
            <DrawerDescription>
              {bookmarks.length === 0
                ? "本书还没有书签"
                : `共 ${bookmarks.length} 个 · 点击跳到对应章节`}
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody>{body}</DrawerBody>
          <DrawerFooter className="justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="text-danger"
              disabled={bookmarks.length === 0 || busy}
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 aria-hidden />
              清空本书书签
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent width="sm" onKeyDown={suppressArrowKeys}>
          <DialogHeader>
            <DialogTitle>清空本书书签</DialogTitle>
            <DialogDescription>
              将删除本书的 {bookmarks.length} 个书签, 清空后无法恢复.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmClear(false)}>
              取消
            </Button>
            <Button variant="danger" disabled={busy} onClick={handleConfirmClear}>
              <Trash2 aria-hidden />
              清空 {bookmarks.length} 个书签
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
