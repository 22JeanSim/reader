import { CircleAlert, ShieldAlert } from "lucide-react";
import * as React from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Spinner,
} from "@/components/ui";
import { humanizeError } from "@/lib/errors";
import type { InvalidBookSource } from "@/services/sources";
import type { BookSource } from "@/types/api";

import { sourceErrorMessage } from "./useSources";

/** 失效记录都在近 10 分钟内产生: 只展示 HH:mm, 完整时间放进 title */
const clockFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export interface InvalidSourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invalidSources: InvalidBookSource[];
  /** 检测请求进行中 */
  checking: boolean;
  /** 最近一次检测成功的时间戳(ms); 本次会话还没检测过为 null */
  lastCheckedAt: number | null;
  error: Error | null;
  /** 全量书源: 把失效记录的 sourceUrl 解析回名称 */
  sources: BookSource[];
  onRetry: () => void;
}

/** 失效书源检测结果: 记录来自后端搜索/换源失败时写入的短期缓存, 空列表表示近期没有书源被标记失效 */
export function InvalidSourcesDialog({
  open,
  onOpenChange,
  invalidSources,
  checking,
  lastCheckedAt,
  error,
  sources,
  onRetry,
}: InvalidSourcesDialogProps) {
  const nameByUrl = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const source of sources) {
      map.set(source.bookSourceUrl, source.bookSourceName);
    }
    return map;
  }, [sources]);

  // 原始技术串只进 console, 列表里给读者人话(lib/errors 约定)
  React.useEffect(() => {
    if (invalidSources.length > 0) {
      console.warn("[reader] 失效书源原始记录:", invalidSources);
    }
  }, [invalidSources]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent width="md">
        <DialogHeader>
          <DialogTitle>失效书源检测</DialogTitle>
          <DialogDescription>
            这些书源在最近约 10 分钟的搜索或换源中失败过, 不是实时探测; 站点恢复后重试即可
          </DialogDescription>
          {lastCheckedAt !== null ? (
            <p className="text-xs text-muted-foreground tabular-nums">
              上次检测 {clockFormatter.format(lastCheckedAt)}
            </p>
          ) : null}
        </DialogHeader>

        <div className="px-4 md:px-5">
          {checking ? (
            <p
              className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
              role="status"
            >
              <Spinner size="sm" label="检测中" />
              正在读取失效记录...
            </p>
          ) : error !== null ? (
            <EmptyState
              compact
              icon={<CircleAlert aria-hidden />}
              title="检测失败"
              description={sourceErrorMessage(error, "网络异常或登录态已失效")}
              action={
                <Button size="sm" variant="secondary" onClick={onRetry}>
                  重试
                </Button>
              }
            />
          ) : invalidSources.length === 0 ? (
            <EmptyState
              compact
              icon={<ShieldAlert aria-hidden />}
              title="没有检测到失效书源"
              description="最近约 10 分钟没有书源被记录为失败"
            />
          ) : (
            <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto pb-1">
              {invalidSources.map((item) => (
                <li
                  key={item.sourceUrl}
                  className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2"
                >
                  <p className="truncate text-sm font-medium">
                    {nameByUrl.get(item.sourceUrl) ?? "已不在列表中的书源"}
                  </p>
                  <p
                    className="mt-0.5 truncate text-xs text-muted-foreground"
                    title={item.sourceUrl}
                  >
                    {item.sourceUrl}
                  </p>
                  {item.error !== undefined && item.error.length > 0 ? (
                    <p
                      className="mt-1 text-xs break-all text-danger line-clamp-2"
                      title={item.error}
                    >
                      {humanizeError(item.error)}
                    </p>
                  ) : null}
                  {item.time !== undefined ? (
                    <p
                      className="mt-1 text-xs text-muted-foreground tabular-nums"
                      title={new Date(item.time).toLocaleString()}
                    >
                      标记于 {clockFormatter.format(item.time)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
