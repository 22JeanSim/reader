import * as React from "react";

import { cn } from "./cn";

export interface EmptyStateProps extends Omit<React.ComponentProps<"div">, "title"> {
  /** 图标(建议传 lucide 图标, 尺寸由容器决定) */
  icon?: React.ReactNode;
  /** 主文案 */
  title: React.ReactNode;
  /** 辅助说明 */
  description?: React.ReactNode;
  /** 操作区插槽(按钮、链接) */
  action?: React.ReactNode;
  /** 紧凑模式: 更小的图标与内边距, 适合列表内嵌空态 */
  compact?: boolean;
}

/** 空态: 图标 + 标题 + 描述 + 操作插槽, 书架/搜索/书源无数据时复用. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-16",
        className,
      )}
      {...props}
    >
      {icon ? (
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-2xl bg-surface-muted text-muted-foreground",
            compact ? "size-10 [&_svg]:size-5" : "size-12 [&_svg]:size-6",
          )}
        >
          {icon}
        </div>
      ) : null}
      <p className={cn("font-medium text-foreground", compact ? "text-sm" : "text-base")}>
        {title}
      </p>
      {description ? (
        <p className="max-w-80 text-sm leading-6 text-muted-foreground">{description}</p>
      ) : null}
      {action ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}
