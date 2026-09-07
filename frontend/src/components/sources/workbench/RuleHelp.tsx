import { BookOpenCheck, ChevronDown } from "lucide-react";

/** 规则速查条目: [术语, 说明] */
const ENTRIES: ReadonlyArray<readonly [term: string, detail: string]> = [
  [
    "选择器",
    "默认 legado 规则: class.类名 / id.名 / tag.标签名 / text.文本, 可用空格后代匹配; 前缀 @css: 切标准 CSS 选择器, @XPath: 切 XPath.",
  ],
  [
    "取值",
    "@text 文本 · @textNodes 全部文本节点 · @href 链接 · @src 图片地址 · @html 原始 HTML; 写在选择器末尾, 如 class.name a@text.",
  ],
  [
    "##正则##替换",
    "对取值结果做正则替换: ##\\s+## 压缩空白; 只写一个 ##正则 表示仅提取匹配部分.",
  ],
  [
    "&& 链",
    "多条规则串联, 结果按序拼接; || 取并集去重, %% 交错合并. 例: class.a@text&&class.b@text.",
  ],
  [
    "@js:",
    "规则以 @js: 开头时执行 JavaScript, result 为上一级结果, 可 return 加工后的值.",
  ],
  [
    "{{模板}}",
    "双花括号内联变量/子规则: {{bookName}} 取书名, {{page}} 在 searchUrl/exploreUrl 里做分页占位.",
  ],
  [
    "常用字段",
    "ruleSearch{bookList,name,author,kind,intro,coverUrl,bookUrl} · ruleBookInfo{init,name,author,kind,intro,coverUrl,tocUrl} · ruleToc{chapterList,chapterName,chapterUrl,nextTocUrl} · ruleContent{content,nextContentUrl,replaceRegex}.",
  ],
];

/** 规则语法帮助: 折叠块形式的 legado 规则速查, 默认收起不占版面 */
export function RuleHelp() {
  return (
    <details className="group rounded-xl border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <BookOpenCheck aria-hidden className="size-4 text-accent" />
          规则语法速查 (legado)
        </span>
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground transition duration-150 ease-out group-open:rotate-180"
        />
      </summary>
      <dl className="flex flex-col gap-3 border-t border-border px-4 py-3">
        {ENTRIES.map(([term, detail]) => (
          <div key={term} className="text-sm leading-6">
            <dt className="font-mono text-xs font-medium text-accent">{term}</dt>
            <dd className="mt-0.5 text-muted-foreground">{detail}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
