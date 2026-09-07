import { Play } from "lucide-react";
import * as React from "react";

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { sanitizeChapterHtml } from "@/hooks/useChapterContent";
import type { BookContent } from "@/services/book";
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
import { testBookContent } from "./workbenchApi";

/** 预览前 5 段 */
const PREVIEW_PARAGRAPHS = 5;
/** 章节下拉最多列出的章数: 目录可能上千章, 超出部分改用手动填 URL, 避免渲染卡顿 */
const DROPDOWN_CAP = 500;

/** 正文预览: 净化后按 \n+ 切段, 取前 N 段 */
interface ContentPreview {
  paragraphs: string[];
  total: number;
  chars: number;
}

export interface ContentTestProps extends TestTabProps {
  /** 「目录」tab 运行后的章节数组: 填充章节下拉 */
  chapters: BookChapter[];
}

/** 正文测试: getBookContent(chapterUrl) → 前 5 段预览 (DOMPurify 清洗后按段渲染) */
export function ContentTest({ source, blockedReason, chapters }: ContentTestProps) {
  const [chapterUrl, setChapterUrl] = React.useState("");
  const [manualUrl, setManualUrl] = React.useState("");
  const test = useTestRun<ContentPreview>();
  const blocked = source === null || blockedReason !== null;
  const preview = test.result;

  const effectiveUrl = manualUrl.trim().length > 0 ? manualUrl.trim() : chapterUrl;
  const hasChapters = chapters.length > 0;

  const runContent = () => {
    if (source === null) return;
    const target = effectiveUrl;
    void test.run(
      async () => {
        const result: BookContent = await testBookContent(target, source);
        const sanitized = sanitizeChapterHtml(result.content, target);
        const paragraphs = sanitized
          .split(/\n+/)
          .map((segment) => segment.trim())
          .filter((segment) => segment.length > 0);
        return {
          paragraphs: paragraphs.slice(0, PREVIEW_PARAGRAPHS),
          total: paragraphs.length,
          chars: result.content.length,
        };
      },
      "获取正文失败",
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <RunRow>
        {hasChapters ? (
          <Select value={chapterUrl} onValueChange={setChapterUrl}>
            <SelectTrigger aria-label="选择章节" className="min-w-0 flex-1">
              <SelectValue
                placeholder={
                  chapters.length > DROPDOWN_CAP
                    ? `选择章节 (前 ${DROPDOWN_CAP} 章)`
                    : "选择章节 (来自目录测试)"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {chapters.slice(0, DROPDOWN_CAP).map((chapter, index) => (
                <SelectItem key={`${chapter.url}-${index}`} value={chapter.url}>
                  <span className="truncate">
                    {chapter.index + 1}. {chapter.title}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Input
          aria-label="章节 URL"
          placeholder={hasChapters ? "或手动填写章节 URL" : "章节 URL (先运行目录测试可选章节)"}
          className="min-w-0 flex-1"
          value={manualUrl}
          onChange={(event) => setManualUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !blocked && effectiveUrl.length > 0 && !test.running) {
              runContent();
            }
          }}
          clearable
          onClear={() => setManualUrl("")}
        />
        <Button
          aria-label="运行正文测试"
          disabled={blocked || effectiveUrl.length === 0}
          loading={test.running}
          onClick={runContent}
        >
          {!test.running ? <Play aria-hidden /> : null}
          运行
        </Button>
      </RunRow>

      {blockedReason !== null ? <TestHint message={`规则未通过校验, 无法测试: ${blockedReason}`} /> : null}
      {!hasChapters ? (
        <TestHint message="还没有章节目录: 先在「目录」tab 运行一次, 即可从下拉选章; 也可以直接填写章节 URL." />
      ) : null}
      {source !== null && source.ruleContent === undefined ? (
        <TestHint message="当前源没有 ruleContent 规则: 正文测试可能取不到内容, 请先在左侧填写正文规则." />
      ) : null}

      {test.error !== null ? <TestError message={test.error} /> : null}

      {preview !== null ? (
        <TestResult
          empty={preview.paragraphs.length === 0}
          emptyText="正文为空 — 检查 ruleContent.content 是否命中正文节点."
        >
          <TestMeta>
            {preview.total} 段 · {preview.chars} 字
            {test.ms !== null ? ` · 耗时 ${test.ms} ms` : ""} · 预览前 {PREVIEW_PARAGRAPHS} 段
          </TestMeta>
          <div className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2">
            {preview.paragraphs.map((paragraph, index) => (
              <p
                key={index}
                className="text-sm leading-6 text-foreground [&_img]:max-w-full"
                // 已用 sanitizeChapterHtml (DOMPurify) 清洗: 与阅读器同一净化口径
                dangerouslySetInnerHTML={{ __html: paragraph }}
              />
            ))}
          </div>
        </TestResult>
      ) : null}
    </div>
  );
}
