import type { Annotation, AnnotationColor } from "@/stores/annotations-store";

/**
 * 批注渲染的纯函数集: 把「段落 HTML + 批注偏移」合成为带 <mark> 的 HTML,
 * 以及把 DOM 选区边界点换算成段落纯文本偏移. 偏移口径两侧一致 ——
 * 都等于段落元素 textContent 的字符索引 (Range.toString 与 textContent 同为文本节点串接).
 */

/** 色点/装饰的基准色 (抽屉色点、工具条色板用内联样式取这里) */
export const ANNOTATION_COLOR_HEX: Record<AnnotationColor, string> = {
  yellow: "#facc15",
  green: "#4ade80",
  blue: "#60a5fa",
};

/** 高亮底色: 浅色主题 40% 透明度, 深色主题降到 30% 免得刺眼 */
const HIGHLIGHT_BG: Record<AnnotationColor, string> = {
  yellow: "bg-[#facc15]/40 dark:bg-[#facc15]/30",
  green: "bg-[#4ade80]/40 dark:bg-[#4ade80]/30",
  blue: "bg-[#60a5fa]/40 dark:bg-[#60a5fa]/30",
};

/** 下划线装饰色: 比底色深一档, 在纸面上拉得开 */
const DECORATION_COLOR: Record<AnnotationColor, string> = {
  yellow: "decoration-[#ca8a04]",
  green: "decoration-[#16a34a]",
  blue: "decoration-[#2563eb]",
};

const MARK_BASE = "cursor-pointer rounded-[2px] text-inherit";

/** 批注 → <mark> 的 class 串 (全部是源码里的完整字面量, Tailwind 扫描得到) */
export function markClasses(annotation: Annotation): string {
  switch (annotation.kind) {
    case "underline":
      return `${MARK_BASE} bg-transparent underline decoration-2 underline-offset-4 ${DECORATION_COLOR[annotation.color]}`;
    case "note":
      return `${MARK_BASE} ${HIGHLIGHT_BG[annotation.color]} underline decoration-dashed decoration-2 underline-offset-4 ${DECORATION_COLOR[annotation.color]}`;
    case "highlight":
      return `${MARK_BASE} ${HIGHLIGHT_BG[annotation.color]}`;
  }
}

/**
 * 把批注包进 <mark>: 解析段落 HTML, 按纯文本偏移切割文本节点并包裹.
 * - 多批注重叠时按传入顺序依次包裹, 允许 mark 视觉嵌套 (v1 约定);
 * - 偏移越界自动收敛; quote 与现文对不上 (书源换版/切分变化) 时整条跳过, 宁缺不错位;
 * - 包裹不改变文本内容, 已有批注的偏移在重渲染后仍然成立.
 */
export function injectAnnotationMarks(html: string, annotations: Annotation[]): string {
  if (annotations.length === 0) {
    return html;
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;
  const fullText = root.textContent ?? "";
  for (const annotation of annotations) {
    const start = Math.max(0, annotation.start);
    const end = Math.min(fullText.length, annotation.end);
    if (end - start <= 0) {
      continue;
    }
    if (annotation.quote !== "" && fullText.slice(start, end) !== annotation.quote) {
      continue;
    }
    wrapTextRange(doc, root, annotation, start, end);
  }
  return root.innerHTML;
}

/** 收集 root 下全部文本节点及其起始偏移 (包裹会改动 DOM, 每条批注前重新收集) */
function collectTextNodes(doc: Document, root: HTMLElement): { node: Text; start: number }[] {
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const entries: { node: Text; start: number }[] = [];
  let offset = 0;
  while (walker.nextNode() !== null) {
    const node = walker.currentNode;
    if (node instanceof Text && node.data.length > 0) {
      entries.push({ node, start: offset });
      offset += node.data.length;
    }
  }
  return entries;
}

/** 把 [start, end) 覆盖到的每个文本节点的中段切出来包进 <mark> */
function wrapTextRange(
  doc: Document,
  root: HTMLElement,
  annotation: Annotation,
  start: number,
  end: number,
): void {
  for (const entry of collectTextNodes(doc, root)) {
    const nodeEnd = entry.start + entry.node.data.length;
    if (nodeEnd <= start || entry.start >= end) {
      continue;
    }
    const localStart = Math.max(start - entry.start, 0);
    const localEnd = Math.min(end - entry.start, entry.node.data.length);
    let middle = entry.node;
    if (localStart > 0) {
      middle = middle.splitText(localStart);
    }
    const middleLength = localEnd - localStart;
    if (middleLength < middle.data.length) {
      middle.splitText(middleLength);
    }
    const parent = middle.parentNode;
    if (parent === null) {
      continue;
    }
    const mark = doc.createElement("mark");
    mark.className = markClasses(annotation);
    mark.dataset.annotationId = annotation.id;
    parent.insertBefore(mark, middle);
    mark.appendChild(middle);
  }
}

/**
 * DOM 边界点 → 段落纯文本偏移: 从段落起点到边界点拉一个 Range, 取其文本长度.
 * 与 injectAnnotationMarks 的 textContent 口径一致, 嵌套 <mark> 不影响结果.
 */
export function paragraphOffsetOf(root: Element, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}
