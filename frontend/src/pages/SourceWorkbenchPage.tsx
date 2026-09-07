import { ArrowLeft } from "lucide-react";
import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { RuleHelp } from "@/components/sources/workbench/RuleHelp";
import { SourceEditor } from "@/components/sources/workbench/SourceEditor";
import { TestPanel } from "@/components/sources/workbench/TestPanel";
import {
  assembleDraft,
  draftFromSource,
  emptyDraft,
  type SourceDraft,
} from "@/components/sources/workbench/draft";
import { useBookSources, useSaveBookSources } from "@/components/sources/useSources";
import { Button, PageIntro, toast } from "@/components/ui";

/**
 * 书源工作台: 左栏编辑规则, 右栏用当前(未保存)规则实时验证详情/目录/正文/搜索/书海.
 * 从书源页带 `?url=<bookSourceUrl>` 进入时自动载入该书源; 不带则是新建空白源.
 */
export default function SourceWorkbenchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedUrl = searchParams.get("url") ?? "";
  const { sources } = useBookSources();
  const save = useSaveBookSources();
  const [draft, setDraft] = React.useState<SourceDraft>(emptyDraft);

  // 带 ?url= 进入且书源列表就绪后, 只按该 url 载入一次(避免后续编辑被列表刷新覆盖)
  const loadedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (requestedUrl.length === 0 || loadedRef.current === requestedUrl) return;
    const hit = sources.find((source) => source.bookSourceUrl === requestedUrl);
    if (hit !== undefined) {
      loadedRef.current = requestedUrl;
      setDraft(draftFromSource(hit));
    }
  }, [requestedUrl, sources]);

  const assembled = React.useMemo(() => assembleDraft(draft), [draft]);

  const handleSave = () => {
    const source = assembled.source;
    if (source === null) {
      toast.error(assembled.summary ?? "书源不完整, 无法保存");
      return;
    }
    save.mutate([source], {
      onSuccess: () => toast.success("书源已保存"),
    });
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 pb-10 pt-5 sm:px-6 md:px-10 md:pt-8">
      <PageIntro
        eyebrow="SOURCE WORKBENCH"
        title="书源工作台"
        desc="左侧编辑规则, 右侧用当前 JSON 实时验证 — 无需保存即可测试详情、目录、正文、搜索与书海."
        action={
          <Button size="sm" variant="secondary" onClick={() => navigate("/sources")}>
            <ArrowLeft aria-hidden />
            返回书源
          </Button>
        }
      />

      <div className="grid flex-1 items-start gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <SourceEditor
            draft={draft}
            onDraftChange={setDraft}
            assembled={assembled}
            sources={sources}
            onSave={handleSave}
            saving={save.isPending}
          />
          <RuleHelp />
        </div>
        <TestPanel source={assembled.source} blockedReason={assembled.summary} />
      </div>
    </div>
  );
}
