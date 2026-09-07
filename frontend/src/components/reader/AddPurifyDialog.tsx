import { Sparkles } from "lucide-react";
import * as React from "react";

import {
  PurifyRuleFields,
  ruleDraftError,
  type PurifyRuleDraft,
} from "@/components/purify/RuleEditDialog";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from "@/components/ui";
import {
  emptyReplaceRule,
  nextRuleOrder,
  useReplaceRules,
  useSaveReplaceRule,
  type PurifyDraft,
} from "@/services/purify";

/**
 * 阅读器里「添加净化」: 划选的文字已扩到整句并转义成正则, 替换留空即消掉整句;
 * 弹窗里可以改任何字段, 存下后正文立即按新规则重渲染(缓存的原始正文不受影响).
 */

/**
 * 浮层内屏蔽 ←/→: ContentView 的翻页快捷键先看 defaultPrevented,
 * 不拦的话弹窗开着时背后仍在翻页.
 */
function suppressArrowKeys(event: React.KeyboardEvent): void {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return;
  }
  const target = event.target;
  if (target instanceof HTMLElement) {
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
      return;
    }
  }
  event.preventDefault();
}

export interface AddPurifyDialogProps {
  /** 为 null 时弹窗关闭 */
  draft: PurifyDraft | null;
  onOpenChange: (open: boolean) => void;
  /** 保存成功: 调用方据此收起选区工具条(正文马上要重渲染了) */
  onSaved: () => void;
}

export function AddPurifyDialog({ draft, onOpenChange, onSaved }: AddPurifyDialogProps) {
  const { rules } = useReplaceRules();
  const save = useSaveReplaceRule();
  const [fields, setFields] = React.useState<PurifyRuleDraft>({
    name: "",
    find: "",
    replace: "",
    isRegex: true,
    scopeTitle: false,
    scopeContent: true,
    enabled: true,
  });
  const [submitted, setSubmitted] = React.useState(false);

  // 换一条草稿(重新划选)时回填默认值: 渲染阶段派生 state, 不额外跑 effect
  const draftKey = draft?.pattern ?? null;
  const [seenDraftKey, setSeenDraftKey] = React.useState<string | null>(null);
  if (draftKey !== seenDraftKey) {
    setSeenDraftKey(draftKey);
    if (draft !== null) {
      setFields({
        name: draft.name,
        find: draft.pattern,
        replace: "",
        isRegex: true,
        scopeTitle: false,
        scopeContent: true,
        enabled: true,
      });
      setSubmitted(false);
    }
  }

  const patch = (next: Partial<PurifyRuleDraft>): void => {
    setFields((prev) => ({ ...prev, ...next }));
  };

  const handleSave = (): void => {
    if (ruleDraftError(fields) !== null) {
      setSubmitted(true);
      return;
    }
    save.mutate(
      { ...emptyReplaceRule(nextRuleOrder(rules)), ...fields, name: fields.name.trim() },
      {
        onSuccess: () => {
          toast.success("已添加净化规则, 正文已按新规则重渲染");
          onSaved();
        },
      },
    );
  };

  return (
    <Dialog open={draft !== null} onOpenChange={onOpenChange}>
      <DialogContent width="md" onKeyDown={suppressArrowKeys}>
        <DialogHeader>
          <DialogTitle>添加净化</DialogTitle>
          <DialogDescription>
            已把选中文字扩到整句并转义成正则, 替换留空就是消掉它; 想换成别的文字填「替换为」.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-4 md:px-5">
          <p className="line-clamp-4 rounded-lg border border-border bg-surface-muted/60 px-3 py-2 text-sm leading-6 text-muted-foreground">
            {draft?.sentence ?? ""}
          </p>
          <PurifyRuleFields
            draft={fields}
            onChange={patch}
            idPrefix="add-purify"
            error={submitted ? ruleDraftError(fields) : null}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button loading={save.isPending} onClick={handleSave}>
            <Sparkles aria-hidden />
            添加净化
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
