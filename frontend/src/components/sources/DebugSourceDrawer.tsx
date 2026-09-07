import { CircleAlert, Eraser, Play, Square, Terminal } from "lucide-react";
import * as React from "react";

import {
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  EmptyState,
  Input,
  Spinner,
} from "@/components/ui";
import { reportError } from "@/lib/errors";
import { bookSourceDebugSSE } from "@/services/sources";
import type { BookSource } from "@/types/api";

export interface DebugSourceDrawerProps {
  /** 调试的书源; null 表示未打开 */
  source: BookSource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 书源调试抽屉: 走 warp bookSourceDebugSSE (action=search + key + 完整书源对象),
 * 后端逐规则执行并流式推送 start/step/result/error 事件, 每行渲染成
 * "[规则名] 请求URL (结果长度 字 / 错误: 原因)" 追加到等宽日志区(自动滚底).
 */
export function DebugSourceDrawer({ source, open, onOpenChange }: DebugSourceDrawerProps) {
  const [keyword, setKeyword] = React.useState("");
  const [logs, setLogs] = React.useState<string[]>([]);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const cancelRef = React.useRef<(() => void) | null>(null);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);

  const stop = React.useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    setRunning(false);
  }, []);

  // 关闭抽屉/组件卸载都终止调试流
  React.useEffect(() => {
    if (!open) stop();
    return stop;
  }, [open, stop]);

  // 新日志到达时自动滚动到底部
  React.useEffect(() => {
    const body = bodyRef.current;
    if (body !== null) {
      body.scrollTop = body.scrollHeight;
    }
  }, [logs]);

  const start = () => {
    if (source === null) return;
    const key = keyword.trim();
    if (key.length === 0) return;
    stop();
    setLogs([]);
    setError(null);
    setRunning(true);
    cancelRef.current = bookSourceDebugSSE(source, "search", { key }, {
      onLog: (line) => setLogs((previous) => [...previous, line]),
      onEnd: () => {
        cancelRef.current = null;
        setRunning(false);
      },
      onError: (err) => {
        cancelRef.current = null;
        setRunning(false);
        // 原始技术串进 console, 抽屉里只给人话
        setError(
          err.message.trim().length > 0
            ? reportError(err.message, `书源调试 ${source.bookSourceUrl}`)
            : "调试失败: 后端没有返回原因",
        );
      },
    });
  };

  const name = source?.bookSourceName ?? "";

  return (
    <Drawer side="right" sheetOnMobile open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="md:w-[32rem]">
        <DrawerHeader>
          <DrawerTitle className="truncate pr-8">
            调试书源{name.length > 0 ? ` · ${name}` : ""}
          </DrawerTitle>
          <DrawerDescription className="truncate" title={source?.bookSourceUrl}>
            {source?.bookSourceUrl}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex shrink-0 items-center gap-2 px-4 pb-3">
          <Input
            className="min-w-0 flex-1"
            placeholder="输入搜索关键词"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !running) start();
            }}
            aria-label="调试关键词"
            clearable
            onClear={() => setKeyword("")}
            prefixIcon={<Terminal aria-hidden className="size-4 text-muted-foreground" />}
          />
          {running ? (
            <Button variant="secondary" onClick={stop}>
              <Square aria-hidden />
              停止
            </Button>
          ) : (
            <Button disabled={keyword.trim().length === 0} onClick={start}>
              <Play aria-hidden />
              开始
            </Button>
          )}
          {logs.length > 0 && !running ? (
            <Button
              variant="ghost"
              aria-label="清空日志"
              onClick={() => {
                setLogs([]);
                setError(null);
              }}
            >
              <Eraser aria-hidden />
              清空
            </Button>
          ) : null}
        </div>

        <DrawerBody ref={bodyRef} className="px-4 pb-4">
          {error !== null ? (
            <div
              className="mb-2 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
              role="alert"
            >
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 flex-1 break-all">{error}</span>
            </div>
          ) : null}

          {logs.length > 0 ? (
            <pre
              role="log"
              aria-live="polite"
              className="rounded-lg border border-border bg-background p-3 font-mono text-xs leading-5 break-all whitespace-pre-wrap text-foreground"
            >
              {logs.join("\n")}
            </pre>
          ) : running ? (
            <p
              className="flex items-center gap-2 py-10 text-sm text-muted-foreground"
              role="status"
            >
              <Spinner size="sm" label="调试中" />
              正在连接后端调试...
            </p>
          ) : error === null ? (
            <EmptyState
              compact
              icon={<Terminal aria-hidden />}
              title="开始调试"
              description="输入关键词后点「开始」, 后端会用该书源执行一次调试搜索并流式返回日志"
              className="py-10"
            />
          ) : null}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
