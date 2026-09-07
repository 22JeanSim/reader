import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import type { InvalidBookSource } from "@/services/sources";
import type { BookSource } from "@/types/api";

export interface InvalidReasonDialogProps {
  /** 非 null 时打开 */
  invalid: InvalidBookSource | null;
  sources: BookSource[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * 失效原因对话框: 点失效徽标查看后端健康模块沉淀的错误原文与标记时间.
 * 600s 内的失效标记会让搜索直接跳过该源 (硬跳过), 过期后自动恢复参与.
 */
export function InvalidReasonDialog({
  invalid,
  sources,
  open,
  onOpenChange,
}: InvalidReasonDialogProps) {
  const name = React.useMemo(() => {
    if (invalid === null) {
      return "";
    }
    const source = sources.find((item) => item.bookSourceUrl === invalid.sourceUrl);
    return source?.bookSourceName.length ? source.bookSourceName : invalid.sourceUrl;
  }, [invalid, sources]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent width="sm">
        <DialogHeader>
          <DialogTitle>失效原因</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 px-4 pb-4 text-xs md:px-5">
          <p className="text-muted-foreground">
            标记时间:{" "}
            {invalid?.time !== undefined && invalid.time > 0
              ? timeFormatter.format(new Date(invalid.time))
              : "未知"}
          </p>
          <p className="text-muted-foreground">源地址: {invalid?.sourceUrl}</p>
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-danger">
            {invalid?.error?.trim().length ? invalid.error : "后端未记录具体错误 (多为超时/连接失败)"}
          </div>
          <p className="text-muted-foreground">
            失效标记 10 分钟内搜索会跳过该源; 到期自动恢复参与. 也可在列表手动启用/禁用.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
