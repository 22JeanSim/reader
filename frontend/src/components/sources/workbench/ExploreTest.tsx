import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import * as React from "react";

import { Button, IconButton, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import { parseExploreMenus } from "@/services/explore";
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
import { testExplore } from "./workbenchApi";

/** 书海测试: 解析源 exploreUrl 菜单 → 选分类 → exploreBook(ruleFindUrl, page) → 书籍列表 */
export function ExploreTest({ source, blockedReason }: TestTabProps) {
  const menus = React.useMemo(() => (source !== null ? parseExploreMenus(source) : []), [source]);
  const [menuUrl, setMenuUrl] = React.useState("");
  const [page, setPage] = React.useState(1);
  const test = useTestRun<SearchBook[]>();
  const blocked = source === null || blockedReason !== null;
  const books = test.result;

  // 源变了(换了菜单)后当前选中项可能消失, 回落到第一个
  const activeUrl = menus.some((menu) => menu.url === menuUrl) ? menuUrl : (menus[0]?.url ?? "");

  const runExplore = (targetPage: number) => {
    if (source === null || activeUrl.length === 0) return;
    void test.run(() => testExplore(activeUrl, source, targetPage), "探索失败");
  };

  return (
    <div className="flex flex-col gap-3">
      <RunRow>
        <Select
          value={activeUrl}
          onValueChange={(value) => {
            setMenuUrl(value);
            setPage(1);
          }}
          disabled={menus.length === 0}
        >
          <SelectTrigger aria-label="发现分类" className="min-w-0 flex-1">
            <SelectValue placeholder={menus.length === 0 ? "无发现分类" : "选择分类"} />
          </SelectTrigger>
          <SelectContent>
            {menus.map((menu) => (
              <SelectItem key={menu.url} value={menu.url}>
                <span className="truncate">{menu.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton
            variant="secondary"
            size="sm"
            aria-label="上一页"
            tooltip="上一页"
            disabled={blocked || activeUrl.length === 0 || page <= 1 || test.running}
            onClick={() => {
              const prev = Math.max(1, page - 1);
              setPage(prev);
              runExplore(prev);
            }}
          >
            <ChevronLeft aria-hidden />
          </IconButton>
          <span className="min-w-8 text-center text-xs text-muted-foreground tabular-nums">
            {page}
          </span>
          <IconButton
            variant="secondary"
            size="sm"
            aria-label="下一页"
            tooltip="下一页"
            disabled={blocked || activeUrl.length === 0 || test.running}
            onClick={() => {
              const next = page + 1;
              setPage(next);
              runExplore(next);
            }}
          >
            <ChevronRight aria-hidden />
          </IconButton>
        </div>
        <Button
          aria-label="运行书海测试"
          disabled={blocked || activeUrl.length === 0}
          loading={test.running}
          onClick={() => runExplore(page)}
        >
          {!test.running ? <Play aria-hidden /> : null}
          运行
        </Button>
      </RunRow>

      {blockedReason !== null ? <TestHint message={`规则未通过校验, 无法测试: ${blockedReason}`} /> : null}
      {source !== null && menus.length === 0 ? (
        <TestHint message="当前源的 exploreUrl 为空或为动态脚本 (@js:): 书海测试需要「分类名::发现页地址」文本或 JSON 数组形式的发现菜单." />
      ) : null}

      {test.error !== null ? <TestError message={test.error} /> : null}

      {books !== null ? (
        <TestResult empty={books.length === 0} emptyText="该分类本页没有书 — 检查 ruleExplore.bookList/name/bookUrl 规则, 或翻页再看看.">
          <TestMeta>
            第 {page} 页 · {books.length} 本{test.ms !== null ? ` · 耗时 ${test.ms} ms` : ""}
          </TestMeta>
          {books.length > 0 ? <BookHitList books={books} /> : null}
        </TestResult>
      ) : null}
    </div>
  );
}
