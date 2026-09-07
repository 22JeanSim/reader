import { Sparkles } from "lucide-react";
import * as React from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Switch,
  Textarea,
  toast,
} from "@/components/ui";
import {
  emptyReplaceRule,
  nextRuleOrder,
  regexErrorOf,
  useReplaceRules,
  useSaveReplaceRule,
  type ReplaceRule,
} from "@/services/purify";

/**
 * 净化规则的新增/编辑弹窗(净化页用), 以及两个弹窗共用的规则表单字段区:
 * 阅读器里的「添加净化」复用 PurifyRuleFields, 只是预填了整句正则与空替换.
 */

/** 表单可编辑字段: id/group/scope/order 等由调用方持有的规则对象决定 */
export interface PurifyRuleDraft {
  name: string;
  find: string;
  replace: string;
  isRegex: boolean;
  scopeTitle: boolean;
  scopeContent: boolean;
  enabled: boolean;
}

/** 已存规则 → 表单字段 */
function draftFields(rule: ReplaceRule): PurifyRuleDraft {
  return {
    name: rule.name,
    find: rule.find,
    replace: rule.replace,
    isRegex: rule.isRegex,
    scopeTitle: rule.scopeTitle,
    scopeContent: rule.scopeContent,
    enabled: rule.enabled,
  };
}

/**
 * 表单校验文案, 全部通过返回 null.
 * 名称/查找内容为空后端会直接拒收; 正则模式还要能编译, 否则渲染期这条规则会被跳过.
 */
export function ruleDraftError(draft: PurifyRuleDraft): string | null {
  if (draft.name.trim() === "") {
    return "请填写规则名称";
  }
  if (draft.find.trim() === "") {
    return "请填写查找内容";
  }
  if (!draft.scopeTitle && !draft.scopeContent) {
    return "正文与标题至少选一个作用范围";
  }
  if (draft.isRegex) {
    const reason = regexErrorOf(draft.find);
    if (reason !== null) {
      return `正则表达式有误: ${reason}`;
    }
  }
  return null;
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  /** 标签右侧的浅色补充说明 */
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={htmlFor}
        className="flex items-baseline justify-between gap-2 text-xs font-medium text-muted-foreground"
      >
        <span>{label}</span>
        {hint ? <span className="font-normal">{hint}</span> : null}
      </label>
      {children}
    </div>
  );
}

function ToggleRow({
  title,
  desc,
  checked,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch size="sm" checked={checked} aria-label={title} onCheckedChange={onChange} />
    </div>
  );
}

export interface PurifyRuleFieldsProps {
  draft: PurifyRuleDraft;
  onChange: (patch: Partial<PurifyRuleDraft>) => void;
  /** 表单元素 id 前缀: 净化页与阅读器可能同时挂载两份表单 */
  idPrefix: string;
  /** 校验文案; 调用方负责只在提交后才给值, null/undefined 不渲染 */
  error?: string | null;
}

/** 规则表单字段区: 名称 / 查找内容 / 替换为 + 正则、正文、标题、启用四个开关 */
export function PurifyRuleFields({ draft, onChange, idPrefix, error }: PurifyRuleFieldsProps) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="名称" htmlFor={`${idPrefix}-name`}>
        <Input
          id={`${idPrefix}-name`}
          value={draft.name}
          maxLength={50}
          placeholder="例如: 去掉章尾求票"
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </Field>
      <Field
        label="查找内容"
        htmlFor={`${idPrefix}-find`}
        hint={draft.isRegex ? "按正则匹配 (全局)" : "按字面文字匹配"}
      >
        <Textarea
          id={`${idPrefix}-find`}
          value={draft.find}
          autoSize
          spellCheck={false}
          className="font-mono text-xs leading-5"
          placeholder={draft.isRegex ? "例如: 本章完[\\s\\S]*$" : "要消掉或替换的文字"}
          onChange={(event) => onChange({ find: event.target.value })}
        />
      </Field>
      <Field label="替换为" htmlFor={`${idPrefix}-replace`} hint="留空即删除匹配到的文字">
        <Textarea
          id={`${idPrefix}-replace`}
          value={draft.replace}
          autoSize
          spellCheck={false}
          className="font-mono text-xs leading-5"
          placeholder="替换后的文字, 可留空"
          onChange={(event) => onChange({ replace: event.target.value })}
        />
      </Field>
      <div className="flex flex-col gap-2">
        <ToggleRow
          title="正则匹配"
          desc="查找内容按正则表达式解释, 编译失败的规则不会生效"
          checked={draft.isRegex}
          onChange={(isRegex) => onChange({ isRegex })}
        />
        <ToggleRow
          title="作用于正文"
          desc="章节正文渲染前替换"
          checked={draft.scopeContent}
          onChange={(scopeContent) => onChange({ scopeContent })}
        />
        <ToggleRow
          title="作用于标题"
          desc="章节标题渲染前替换"
          checked={draft.scopeTitle}
          onChange={(scopeTitle) => onChange({ scopeTitle })}
        />
        <ToggleRow
          title="启用"
          desc="停用后规则保留但不生效"
          checked={draft.enabled}
          onChange={(enabled) => onChange({ enabled })}
        />
      </div>
      {error === undefined || error === null ? null : (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export interface RuleEditDialogProps {
  /** 编辑的规则; null 表示新增 */
  rule: ReplaceRule | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 新增/编辑净化规则: 按 id upsert, 新增时 order 排到现有规则末尾 */
export function RuleEditDialog({ rule, open, onOpenChange }: RuleEditDialogProps) {
  const { rules } = useReplaceRules();
  const save = useSaveReplaceRule();
  const isNew = rule === null;
  // 提交载体: 编辑时保留 id/group/scope/order, 新增时给空白规则(order 排末尾)
  const base = React.useMemo(
    () => rule ?? emptyReplaceRule(nextRuleOrder(rules)),
    [rule, rules],
  );

  const [draft, setDraft] = React.useState<PurifyRuleDraft>(() => draftFields(base));
  const [submitted, setSubmitted] = React.useState(false);
  // 每次打开回填草稿(编辑取当前规则, 新增给空白): 渲染阶段派生 state, 不额外跑 effect
  const draftKey = open ? (rule?.id ?? "__new__") : null;
  const [seenDraftKey, setSeenDraftKey] = React.useState<string | null>(null);
  if (draftKey !== seenDraftKey) {
    setSeenDraftKey(draftKey);
    setDraft(draftFields(base));
    setSubmitted(false);
  }

  const patch = (next: Partial<PurifyRuleDraft>): void => {
    setDraft((prev) => ({ ...prev, ...next }));
  };

  const handleSave = (): void => {
    // 不静默失败: 拦下保存的同时把校验文案亮出来
    if (ruleDraftError(draft) !== null) {
      setSubmitted(true);
      return;
    }
    save.mutate(
      { ...base, ...draft, name: draft.name.trim() },
      {
        onSuccess: () => {
          toast.success(isNew ? "已添加净化规则" : "已保存净化规则");
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent width="md">
        <DialogHeader>
          <DialogTitle>{isNew ? "新增净化规则" : "编辑净化规则"}</DialogTitle>
          <DialogDescription>
            规则在正文渲染前按顺序生效, 命中查找内容即替换; 已缓存的章节也会立即跟着变.
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 md:px-5">
          <PurifyRuleFields
            draft={draft}
            onChange={patch}
            idPrefix="purify-rule"
            error={submitted ? ruleDraftError(draft) : null}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button loading={save.isPending} onClick={handleSave}>
            <Sparkles aria-hidden />
            {isNew ? "添加规则" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
