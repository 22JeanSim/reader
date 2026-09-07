import { Check, Play, X } from "lucide-react";
import * as React from "react";

import { Button, CoverImage, Input } from "@/components/ui";
import { getCoverUrl } from "@/services/book";
import type { Book } from "@/types/api";

import {
  RunRow,
  TestError,
  TestHint,
  TestMeta,
  TestResult,
  useTestRun,
  type TestTabProps,
} from "./TestBits";
import { testBookInfo } from "./workbenchApi";

/** 详情字段表的一行: ✓(有值)/✗(空) + 字段名 + 值 */
function FieldRow({ label, value }: { label: string; value: string }) {
  const present = value.trim().length > 0;
  return (
    <div className="flex items-start gap-2 border-b border-border/60 py-1.5 last:border-b-0">
      <span
        aria-hidden
        className={
          present
            ? "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent"
            : "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger"
        }
      >
        {present ? <Check className="size-3" /> : <X className="size-3" />}
      </span>
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span
        className={
          present
            ? "min-w-0 flex-1 text-xs break-words text-foreground"
            : "min-w-0 flex-1 text-xs text-muted-foreground italic"
        }
      >
        {present ? value : "空"}
      </span>
    </div>
  );
}

/** 详情测试: getBookInfo(url) → 书名/作者/分类/简介/封面/目录URL 逐字段 ✓/✗ */
export function DetailTest({ source, blockedReason }: TestTabProps) {
  const [url, setUrl] = React.useState("");
  const test = useTestRun<Book>();
  const blocked = source === null || blockedReason !== null;
  const book = test.result;

  const runDetail = () => {
    if (source === null) return;
    void test.run(() => testBookInfo(url.trim(), source), "获取详情失败");
  };

  return (
    <div className="flex flex-col gap-3">
      <RunRow>
        <Input
          aria-label="书籍详情页 URL"
          placeholder="书籍详情页 URL"
          className="min-w-0 flex-1"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !blocked && url.trim().length > 0 && !test.running) {
              runDetail();
            }
          }}
          clearable
          onClear={() => setUrl("")}
        />
        <Button
          aria-label="运行详情测试"
          disabled={blocked || url.trim().length === 0}
          loading={test.running}
          onClick={runDetail}
        >
          {!test.running ? <Play aria-hidden /> : null}
          运行
        </Button>
      </RunRow>

      {blockedReason !== null ? <TestHint message={`规则未通过校验, 无法测试: ${blockedReason}`} /> : null}
      {source !== null && source.ruleBookInfo === undefined ? (
        <TestHint message="当前源没有 ruleBookInfo 规则: 详情测试大概率取不到字段, 请先在左侧填写详情规则." />
      ) : null}

      {test.error !== null ? <TestError message={test.error} /> : null}

      {book !== null ? (
        <TestResult>
          <div className="flex items-center gap-3">
            <CoverImage
              src={getCoverUrl(book.coverUrl)}
              alt={book.name}
              author={book.author}
              className="w-14 shrink-0"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium" title={book.name}>
                {book.name.length > 0 ? book.name : "(无书名)"}
              </p>
              {test.ms !== null ? <TestMeta>耗时 {test.ms} ms</TestMeta> : null}
            </div>
          </div>
          <div className="rounded-lg border border-border px-3 py-1">
            <FieldRow label="书名" value={book.name} />
            <FieldRow label="作者" value={book.author} />
            <FieldRow label="分类" value={book.kind ?? ""} />
            <FieldRow label="简介" value={book.intro ?? ""} />
            <FieldRow label="封面" value={book.coverUrl ?? ""} />
            <FieldRow label="目录URL" value={book.tocUrl} />
          </div>
        </TestResult>
      ) : null}
    </div>
  );
}
