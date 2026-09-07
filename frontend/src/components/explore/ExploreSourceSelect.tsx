import { Library } from "lucide-react";
import * as React from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  cn,
} from "@/components/ui";
import type { ExploreMenu } from "@/services/explore";
import type { BookSource } from "@/types/api";

/** 书海里可选的一个书源: 书源本体 + 已解析出的发现菜单 */
export interface ExploreSource {
  source: BookSource;
  menus: ExploreMenu[];
}

export interface ExploreSourceSelectProps {
  sources: ExploreSource[];
  /** 选中的 bookSourceUrl, 空串表示未选 */
  value: string;
  onChange: (bookSourceUrl: string) => void;
  className?: string;
}

const UNGROUPED = "未分组";

/** 按 bookSourceGroup 归组并保持书源原顺序(与旧版前端的分组展示一致) */
function groupSources(sources: ExploreSource[]): Map<string, ExploreSource[]> {
  const groups = new Map<string, ExploreSource[]>();
  for (const item of sources) {
    const group = item.source.bookSourceGroup.trim();
    const key = group.length > 0 ? group : UNGROUPED;
    const bucket = groups.get(key);
    if (bucket === undefined) {
      groups.set(key, [item]);
    } else {
      bucket.push(item);
    }
  }
  return groups;
}

/**
 * 书海书源选择器: 只列出可用于探索的书源, 按书源分组展示.
 * 仅有一个「未分组」分组时不显示组标题.
 */
export function ExploreSourceSelect({
  sources,
  value,
  onChange,
  className,
}: ExploreSourceSelectProps) {
  const groups = React.useMemo(() => groupSources(sources), [sources]);
  const showLabels = groups.size > 1 || !groups.has(UNGROUPED);

  return (
    <Select value={value} onValueChange={onChange} disabled={sources.length === 0}>
      <SelectTrigger aria-label="书海书源" className={cn("sm:max-w-72", className)}>
        <span className="flex min-w-0 items-center gap-2">
          <Library aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="选择书源" className="truncate" />
        </span>
      </SelectTrigger>
      <SelectContent>
        {[...groups.entries()].map(([group, items]) => (
          <SelectGroup key={group}>
            {showLabels ? <SelectLabel>{group}</SelectLabel> : null}
            {items.map(({ source }) => (
              <SelectItem key={source.bookSourceUrl} value={source.bookSourceUrl}>
                {source.bookSourceName}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
