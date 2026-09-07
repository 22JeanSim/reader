import { ListTree, Play } from "lucide-react";
import * as React from "react";

import { Button, Input, cn } from "@/components/ui";
import type { BookChapter } from "@/types/api";

import {
  RunRow,
  TestError,
  TestHint,
  TestMeta,
  TestResult,
  useTestRun,
  type TestTabProps,
} from "./TestBits";
import { testChapterList, testChapterListByRule } from "./workbenchApi";

/** 目录测试有两种口径: 完整目录(跟随翻页) 与 单页规则(只解析当前页) */
type TocMode = "full" | "byRule";

const MODE_LABEL: Record<TocMode, string> = {
  full: "完整目录",
  byRule: "单页规则",
};

/** 预览前 15 个章节标题 */
const PREVIEW_COUNT = 15;

export interface TocTestProps extends TestTabProps {
  /** 运行成功后把章节数组上报给面板, 供「正文」tab 的章节下拉复用 */
  onChapters: (chapters: BookChapter[]) => void;
}

/** 目录测试: getChapterList / getChapterListByRule → 章数 + 耗时 + 前 15 标题 */
export function TocTest({ source, blockedReason, onChapters }: TocTestProps) {
  const [url, setUrl] = React.useState("");
  const [mode, setMode] = React.useState<TocMode>("full");
  const test = useTestRun<BookChapter[]>();
  const blocked = source === null || blockedReason !== null;
  const chapters = test.result;

  const runToc = () => {
    if (source === null) return;
    const target = url.trim();
    void test.run(
      async () => {
        const list =
          mode === "full"
            ? await testChapterList(target, source)
            : await testChapterListByRule(target, source);
        onChapters(list);
        return list;
      },
      "获取目录失败",
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <RunRow>
        <div className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-surface-muted p-1">
          {(Object.keys(MODE_LABEL) as TocMode[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              className={cn(
                "cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition duration-150 ease-out",
                mode === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setMode(value)}
            >
              {MODE_LABEL[value]}
            </button>
          ))}
        </div>
        <Input
          aria-label="目录页 URL"
          placeholder={mode === "full" ? "目录页或书籍详情页 URL" : "目录页 URL (只解析本页)"}
          className="min-w-0 flex-1"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !blocked && url.trim().length > 0 && !test.running) {
              runToc();
            }
          }}
          clearable
          onClear={() => setUrl("")}
        />
        <Button
          aria-label="运行目录测试"
          disabled={blocked || url.trim().length === 0}
          loading={test.running}
          onClick={runToc}
        >
          {!test.running ? <Play aria-hidden /> : null}
          运行
        </Button>
      </RunRow>

      {blockedReason !== null ? <TestHint message={`规则未通过校验, 无法测试: ${blockedReason}`} /> : null}
      {source !== null && source.ruleToc === undefined ? (
        <TestHint message="当前源没有 ruleToc 规则: 目录测试无法解析章节, 请先在左侧填写目录规则." />
      ) : null}

      {test.error !== null ? <TestError message={test.error} /> : null}

      {chapters !== null ? (
        <TestResult empty={chapters.length === 0} emptyText="没有解析到章节 — 检查 ruleToc.chapterList / chapterName / chapterUrl 是否命中页面结构.">
          <div className="flex items-center gap-2">
            <ListTree aria-hidden className="size-4 text-accent" />
            <TestMeta>
              {chapters.length} 章{test.ms !== null ? ` · 耗时 ${test.ms} ms` : ""}
              {chapters.length > PREVIEW_COUNT ? ` · 预览前 ${PREVIEW_COUNT}` : ""}
            </TestMeta>
          </div>
          {chapters.length > 0 ? (
            <ol className="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2">
              {chapters.slice(0, PREVIEW_COUNT).map((chapter, index) => (
                <li key={`${chapter.url}-${index}`} className="flex items-baseline gap-2 text-xs">
                  <span className="w-8 shrink-0 text-right text-muted-foreground tabular-nums">
                    {chapter.index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={chapter.title}>
                    {chapter.title}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </TestResult>
      ) : null}
    </div>
  );
}
