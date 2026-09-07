import { FlaskConical } from "lucide-react";
import * as React from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import type { BookChapter, BookSource } from "@/types/api";

import { ContentTest } from "./ContentTest";
import { DetailTest } from "./DetailTest";
import { ExploreTest } from "./ExploreTest";
import { SearchTest } from "./SearchTest";
import { TocTest } from "./TocTest";

export interface TestPanelProps {
  /** 编辑器现场组装的源对象(未保存也随编辑实时更新); null = 校验未过 */
  source: BookSource | null;
  /** 源不可用原因(校验摘要), 透传给各 tab 禁用运行 */
  blockedReason: string | null;
}

/**
 * 测试面板: 详情/目录/正文/搜索/书海 五个 tab.
 * 「正文」的章节下拉复用「目录」的运行结果, 因此章节数组提升到面板层持有.
 */
export function TestPanel({ source, blockedReason }: TestPanelProps) {
  const [chapters, setChapters] = React.useState<BookChapter[]>([]);

  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-border bg-surface">
      <header className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
        <FlaskConical aria-hidden className="size-4 text-accent" />
        <h3 className="text-sm font-medium">测试面板</h3>
        <span className="ml-auto text-xs text-muted-foreground">用当前编辑中的规则实测</span>
      </header>
      <Tabs defaultValue="detail" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-4 mt-3 w-auto">
          <TabsTrigger value="detail">详情</TabsTrigger>
          <TabsTrigger value="toc">目录</TabsTrigger>
          <TabsTrigger value="content">正文</TabsTrigger>
          <TabsTrigger value="search">搜索</TabsTrigger>
          <TabsTrigger value="explore">书海</TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 px-4 pb-4">
          <TabsContent value="detail">
            <DetailTest source={source} blockedReason={blockedReason} />
          </TabsContent>
          <TabsContent value="toc">
            <TocTest source={source} blockedReason={blockedReason} onChapters={setChapters} />
          </TabsContent>
          <TabsContent value="content">
            <ContentTest source={source} blockedReason={blockedReason} chapters={chapters} />
          </TabsContent>
          <TabsContent value="search">
            <SearchTest source={source} blockedReason={blockedReason} />
          </TabsContent>
          <TabsContent value="explore">
            <ExploreTest source={source} blockedReason={blockedReason} />
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}
