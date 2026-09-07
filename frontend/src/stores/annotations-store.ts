import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 批注形态: 荧光高亮 / 下划线 / 带笔记的高亮 */
export type AnnotationKind = "highlight" | "underline" | "note";
/** 批注颜色 */
export type AnnotationColor = "yellow" | "green" | "blue";

export interface Annotation {
  id: string;
  /** 所属章节索引 */
  chapterIndex: number;
  /** 段落索引 = ReaderParagraph.key (章节切分结果中的序号) */
  paraIndex: number;
  /** 起点字符偏移 (段落纯文本, 含内联标签的文字) */
  start: number;
  /** 终点字符偏移 (不含) */
  end: number;
  /** 选区原文摘录 (渲染前校验用: 正文变了就跳过该批注) */
  quote: string;
  kind: AnnotationKind;
  color: AnnotationColor;
  /** 笔记正文, 无笔记为空串 */
  note: string;
  createdAt: number;
}

/** 新建批注的入参 (id/createdAt 由 store 生成) */
export type NewAnnotation = Omit<Annotation, "id" | "createdAt">;

export const ANNOTATIONS_STORAGE_KEY = "reader.annotations";

function newAnnotationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface AnnotationsState {
  /** bookUrl → 该书全部批注 (追加序, 渲染时按段落分组) */
  byBook: Record<string, Annotation[]>;
  add: (bookUrl: string, input: NewAnnotation) => void;
  /** 只允许改形态/颜色/笔记, 位置一经创建不漂移 */
  update: (
    bookUrl: string,
    id: string,
    patch: Partial<Pick<Annotation, "kind" | "color" | "note">>,
  ) => void;
  remove: (bookUrl: string, id: string) => void;
}

/**
 * 划选批注 (高亮/下划线/笔记): 全部存本机 localStorage, 不走后端.
 * 结构与书签不同源, 换设备/清浏览器数据即丢失, UI 文案需向读者注明.
 */
export const useAnnotationsStore = create<AnnotationsState>()(
  persist(
    (set) => ({
      byBook: {},

      add: (bookUrl, input) => {
        set((state) => {
          const list = state.byBook[bookUrl] ?? [];
          const annotation: Annotation = {
            ...input,
            id: newAnnotationId(),
            createdAt: Date.now(),
          };
          return { byBook: { ...state.byBook, [bookUrl]: [...list, annotation] } };
        });
      },

      update: (bookUrl, id, patch) => {
        set((state) => {
          const list = state.byBook[bookUrl];
          if (list === undefined) {
            return state;
          }
          let changed = false;
          const next = list.map((annotation) => {
            if (annotation.id !== id) {
              return annotation;
            }
            changed = true;
            return { ...annotation, ...patch };
          });
          return changed ? { byBook: { ...state.byBook, [bookUrl]: next } } : state;
        });
      },

      remove: (bookUrl, id) => {
        set((state) => {
          const list = state.byBook[bookUrl];
          if (list === undefined) {
            return state;
          }
          const next = list.filter((annotation) => annotation.id !== id);
          return next.length === list.length
            ? state
            : { byBook: { ...state.byBook, [bookUrl]: next } };
        });
      },
    }),
    {
      name: ANNOTATIONS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** 无批注时的稳定空数组: 订阅方拿它兜底, 避免每次渲染都因新数组重渲染 */
export const NO_ANNOTATIONS: Annotation[] = [];
