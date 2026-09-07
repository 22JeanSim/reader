import { Tabs, TabsList, TabsTrigger } from "@/components/ui";
import type { ExploreMenu } from "@/services/explore";

export interface ExploreMenuTabsProps {
  menus: ExploreMenu[];
  /** 选中菜单的下标 */
  value: number;
  onChange: (index: number) => void;
  /** 结果网格容器 id: 标签通过 aria-controls 指向它 */
  controlsId?: string;
  className?: string;
}

/**
 * 发现分类 chips: 值用下标而不是 url(同一书源可能给多个分类配同一地址).
 * 分类很多时自动换行; 没有分类时整条隐藏.
 */
export function ExploreMenuTabs({
  menus,
  value,
  onChange,
  controlsId,
  className,
}: ExploreMenuTabsProps) {
  if (menus.length === 0) {
    return null;
  }

  return (
    <Tabs
      value={String(value)}
      onValueChange={(next) => onChange(Number(next))}
      className={className}
    >
      <TabsList
        aria-label="发现分类"
        className="h-auto w-full max-w-full flex-wrap justify-start gap-2 overflow-x-visible rounded-none bg-transparent p-0"
      >
        {menus.map((menu, index) => (
          <TabsTrigger
            key={`${menu.url}#${index}`}
            value={String(index)}
            aria-controls={controlsId}
            className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs data-[state=active]:border-accent data-[state=active]:bg-accent/10 data-[state=active]:text-accent data-[state=active]:shadow-none data-[state=active]:hover:text-accent"
          >
            {menu.name}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
