import { Play, Search } from "lucide-react";
import * as React from "react";

import { Button, Input } from "@/components/ui";
import type { SearchBook } from "@/types/api";

import {
  BookHitList,
  RunRow,
  TestError,
  TestHint,
  TestMeta,
  TestResult,
  useTestRun,
  type TestTabProps,
} from "./TestBits";
import { testSearch } from "./workbenchApi";

/** 搜索测试: searchBook(key) → 名称/作者/简介列表 (走源的 searchUrl + ruleSearch) */
export function SearchTest({ source, blockedReason }: TestTabProps) {
  const [key, setKey] = React.useState("");
  const test = useTestRun<SearchBook[]>();
  const blocked = source === null || blockedReason !== null;
  const books = test.result;

  const runSearch = () => {
    if (source === null) return;
    void test.run(() => testSearch(key.trim(), source), "搜索失败");
  };

  return (
    <div className="flex flex-col gap-3">
      <RunRow>
        <Input
          aria-label="搜索关键词"
          placeholder="搜索关键词"
          className="min-w-0 flex-1"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !blocked && key.trim().length > 0 && !test.running) {
              runSearch();
            }
          }}
          clearable
          onClear={() => setKey("")}
          prefixIcon={<Search aria-hidden className="size-4 text-muted-foreground" />}
        />
        <Button
          aria-label="运行搜索测试"
          disabled={blocked || key.trim().length === 0}
          loading={test.running}
          onClick={runSearch}
        >
          {!test.running ? <Play aria-hidden /> : null}
          运行
        </Button>
      </RunRow>

      {blockedReason !== null ? <TestHint message={`规则未通过校验, 无法测试: ${blockedReason}`} /> : null}
      {source !== null && (source.searchUrl === undefined || source.searchUrl.trim().length === 0) ? (
        <TestHint message="当前源没有 searchUrl: 搜索测试无法发起, 请在基础区填写搜索地址 (可含 {{key}} / {{page}} 占位)." />
      ) : null}

      {test.error !== null ? <TestError message={test.error} /> : null}

      {books !== null ? (
        <TestResult empty={books.length === 0} emptyText="没有搜到书 — 检查 searchUrl 占位与 ruleSearch.bookList/name/bookUrl 规则.">
          <TestMeta>
            {books.length} 本{test.ms !== null ? ` · 耗时 ${test.ms} ms` : ""}
          </TestMeta>
          {books.length > 0 ? <BookHitList books={books} /> : null}
        </TestResult>
      ) : null}
    </div>
  );
}
