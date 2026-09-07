import { Highlighter, Trash2 } from "lucide-react";
import * as React from "react";

import { ANNOTATION_COLOR_HEX } from "@/components/reader/annotation-marks";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  EmptyState,
  IconButton,
  cn,
} from "@/components/ui";
import type { Annotation, AnnotationKind } from "@/stores/annotations-store";
import type { BookChapter } from "@/types/api";

/**
 * 批注抽屉: 顶栏 Highlighter 图标打开, 按章分组列出本书全部划选批注
 * (色点 + 原文摘录 + 笔记), 点条目跳章并滚动到对应段落, 可逐条删除.
 * 批注只存本机 localStorage, 描述里向读者注明.
 */

const KIND_LABEL: Record<AnnotationKind, string> = {
  highlight: "高亮",
  underline: "下划线",
  note: "笔记",
};

/**
 * 浮层内屏蔽 ←/→: ContentView 的翻页快捷键先看 defaultPrevented,
 * 不拦的话抽屉开着时背后仍在翻页.
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

export interface AnnotationsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 本书全部批注 (跨章, 追加序) */
  annotations: Annotation[];
  /** 章节表: 分组标题取章节名 */
  chapters: BookChapter[];
  /** 当前章节索引: 本章分组高亮 */
  currentIndex: number;
  /** 点条目: 跳章并滚动到段落 (关闭抽屉由页面处理) */
  onSelect: (annotation: Annotation) => void;
  onDelete: (annotation: Annotation) => void;
}

export function AnnotationsDrawer({
  open,
  onOpenChange,
  annotations,
  chapters,
  currentIndex,
  onSelect,
  onDelete,
}: AnnotationsDrawerProps) {
  // 按章分组: Map 保插入序, 再按章节索引排; 组内保持创建顺序
  const groups = React.useMemo(() => {
    const byChapter = new Map<number, Annotation[]>();
    for (const annotation of annotations) {
      const list = byChapter.get(annotation.chapterIndex);
      if (list !== undefined) {
        list.push(annotation);
      } else {
        byChapter.set(annotation.chapterIndex, [annotation]);
      }
    }
    return [...byChapter.entries()].sort((a, b) => a[0] - b[0]);
  }, [annotations]);

  const body =
    annotations.length === 0 ? (
      <EmptyState
        compact
        icon={<Highlighter />}
        title="还没有批注"
        description="在正文里划选一段文字, 就能画线、高亮或加笔记."
      />
    ) : (
      <div className="flex flex-col gap-4">
        {groups.map(([chapterIndex, list]) => {
          const active = chapterIndex === currentIndex;
          const title = chapters[chapterIndex]?.title ?? `第 ${chapterIndex + 1} 章`;
          return (
            <section key={chapterIndex}>
              <h3
                className={cn(
                  "sticky top-0 z-10 -mx-1 bg-surface px-1 py-1.5 text-xs font-medium",
                  active ? "text-accent" : "text-muted-foreground",
                )}
              >
                {title}
                <span className="ml-1.5 tabular-nums opacity-70">{list.length}</span>
              </h3>
              <ul className="flex flex-col gap-0.5">
                {list.map((annotation) => (
                  <li key={annotation.id} className="flex items-start gap-0.5">
                    <button
                      type="button"
                      onClick={() => onSelect(annotation)}
                      className="min-w-0 flex-1 cursor-pointer rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-muted"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="size-2.5 shrink-0 rounded-full border border-black/10"
                          style={{ backgroundColor: ANNOTATION_COLOR_HEX[annotation.color] }}
                        />
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {KIND_LABEL[annotation.kind]}
                        </span>
                      </span>
                      <span className="mt-1 line-clamp-2 block text-sm leading-6 text-foreground/90">
                        {annotation.quote}
                      </span>
                      {annotation.note === "" ? null : (
                        <span className="mt-1 line-clamp-2 block text-xs leading-5 text-accent/90">
                          笔记 · {annotation.note}
                        </span>
                      )}
                    </button>
                    <IconButton
                      variant="ghost"
                      size="sm"
                      aria-label="删除批注"
                      className="mt-1.5 text-muted-foreground"
                      onClick={() => onDelete(annotation)}
                    >
                      <Trash2 />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    );

  return (
    <Drawer side="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="w-[85vw] max-w-xs" onKeyDown={suppressArrowKeys}>
        <DrawerHeader>
          <DrawerTitle>批注</DrawerTitle>
          <DrawerDescription>
            {annotations.length === 0
              ? "选中正文即可画线或加笔记"
              : `共 ${annotations.length} 条 · 点击跳到对应段落`}
            {" · 仅存本机"}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody>{body}</DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
