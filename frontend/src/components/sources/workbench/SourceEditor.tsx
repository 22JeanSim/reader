import { Braces, FileJson, Plus, SlidersHorizontal } from "lucide-react";
import * as React from "react";

import {
  Button,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  cn,
  toast,
} from "@/components/ui";
import type { BookSource } from "@/types/api";

import {
  RULE_KEYS,
  RULE_LABELS,
  RULE_PLACEHOLDERS,
  draftFromSource,
  emptyDraft,
  formatJsonText,
  parseSourceJson,
  serializeDraft,
  type AssembleResult,
  type EditorMode,
  type RuleKey,
  type SourceDraft,
} from "./draft";

export interface SourceEditorProps {
  draft: SourceDraft;
  onDraftChange: React.Dispatch<React.SetStateAction<SourceDraft>>;
  /** 现场组装结果: 提供各规则框/基础字段/整源 JSON 的校验错误 */
  assembled: AssembleResult;
  /** 可载入的已有书源列表 */
  sources: BookSource[];
  onSave: () => void;
  saving: boolean;
}

const MODE_LABEL: Record<EditorMode, string> = { fields: "分区表单", json: "整源 JSON" };
/** 载入下拉的新建哨兵值(与真实 bookSourceUrl 不冲突) */
const NEW_SOURCE = "__new__";

/** 编辑区标题行的分区小标 */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </h4>
  );
}

/**
 * 书源编辑器(左栏): 基础区 + 五个规则 JSON 框(分区模式) 或 整源 JSON(整源模式).
 * 顶部可切换模式、从已有书源载入、新建、保存. 所有内容都进 draft, 测试面板现场取用.
 */
export function SourceEditor({
  draft,
  onDraftChange,
  assembled,
  sources,
  onSave,
  saving,
}: SourceEditorProps) {
  const switchMode = (mode: EditorMode) => {
    if (mode === draft.mode) return;
    if (mode === "json") {
      // fields → json: 先把当前分区内容序列化进 jsonText; 规则 JSON 有错则拒绝(避免丢改动)
      const { text, error } = serializeDraft(draft);
      if (text === null) {
        toast.error(`无法切到整源 JSON: ${error ?? "规则 JSON 有误"}`);
        return;
      }
      onDraftChange((prev) => ({ ...prev, mode: "json", jsonText: text }));
      return;
    }
    // json → fields: 把整源 JSON 解析回分区; 解析失败则拒绝
    const { source, error } = parseSourceJson(draft.jsonText);
    if (source === null) {
      toast.error(`无法切到分区表单: ${error ?? "整源 JSON 无效"}`);
      return;
    }
    onDraftChange(draftFromSource(source));
  };

  const loadSource = (value: string) => {
    if (value === NEW_SOURCE) {
      onDraftChange(emptyDraft());
      return;
    }
    const hit = sources.find((source) => source.bookSourceUrl === value);
    if (hit !== undefined) onDraftChange(draftFromSource(hit));
  };

  const setField = <K extends keyof SourceDraft>(key: K, value: SourceDraft[K]) => {
    onDraftChange((prev) => ({ ...prev, [key]: value }));
  };

  const setRule = (key: RuleKey, value: string) => {
    onDraftChange((prev) => ({ ...prev, rules: { ...prev.rules, [key]: value } }));
  };

  const formatRule = (key: RuleKey) => {
    const formatted = formatJsonText(draft.rules[key]);
    if (formatted === null) {
      toast.error("JSON 无效, 无法格式化");
      return;
    }
    setRule(key, formatted);
  };

  const formatWhole = () => {
    const formatted = formatJsonText(draft.jsonText);
    if (formatted === null) {
      toast.error("整源 JSON 无效, 无法格式化");
      return;
    }
    setField("jsonText", formatted);
  };

  const canSave = assembled.source !== null;

  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-border bg-surface">
      {/* 顶部: 载入/新建/保存 + 模式切换 */}
      <header className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-3">
        <Select value="" onValueChange={loadSource}>
          <SelectTrigger aria-label="载入书源" size="sm" className="w-40">
            <SelectValue placeholder="载入书源…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NEW_SOURCE}>
              <span className="flex items-center gap-1.5">
                <Plus aria-hidden className="size-3.5" />
                新建空白源
              </span>
            </SelectItem>
            {sources.map((source) => (
              <SelectItem key={source.bookSourceUrl} value={source.bookSourceUrl}>
                <span className="truncate">
                  {source.bookSourceName.length > 0 ? source.bookSourceName : source.bookSourceUrl}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-surface-muted p-1">
          {(Object.keys(MODE_LABEL) as EditorMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={draft.mode === mode}
              className={cn(
                "flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition duration-150 ease-out",
                draft.mode === mode
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => switchMode(mode)}
            >
              {mode === "fields" ? <SlidersHorizontal aria-hidden className="size-3.5" /> : <FileJson aria-hidden className="size-3.5" />}
              {MODE_LABEL[mode]}
            </button>
          ))}
        </div>

        <Button size="sm" disabled={!canSave} loading={saving} onClick={onSave}>
          保存
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 px-4 py-4">
        {draft.mode === "fields" ? (
          <>
            {/* 基础区 */}
            <div>
              <SectionLabel>基础</SectionLabel>
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">名称</span>
                  <Input
                    size="sm"
                    placeholder="书源名称"
                    value={draft.name}
                    onChange={(event) => setField("name", event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">
                    地址 (bookSourceUrl){assembled.fieldError !== null ? " · 必填" : ""}
                  </span>
                  <Input
                    size="sm"
                    placeholder="https://example.com"
                    invalid={assembled.fieldError !== null}
                    value={draft.url}
                    onChange={(event) => setField("url", event.target.value)}
                  />
                  {assembled.fieldError !== null ? (
                    <span className="text-xs text-danger" role="alert">
                      {assembled.fieldError}
                    </span>
                  ) : null}
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">分组</span>
                  <Input
                    size="sm"
                    placeholder="如: 玄幻·武侠"
                    value={draft.group}
                    onChange={(event) => setField("group", event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">搜索地址 (searchUrl)</span>
                  <Input
                    size="sm"
                    placeholder="/search?q={{key}}&page={{page}}"
                    value={draft.searchUrl}
                    onChange={(event) => setField("searchUrl", event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">发现地址 (exploreUrl)</span>
                  <Textarea
                    autoSize
                    className="font-mono text-xs"
                    placeholder={"玄幻::/list/1_{{page}}.html\n武侠::/list/2_{{page}}.html"}
                    value={draft.exploreUrl}
                    onChange={(event) => setField("exploreUrl", event.target.value)}
                  />
                </label>
                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-xs text-muted-foreground">启用 (enabled)</span>
                  <Switch
                    size="sm"
                    checked={draft.enabled}
                    aria-label="启用书源"
                    onCheckedChange={(checked) => setField("enabled", checked)}
                  />
                </div>
              </div>
            </div>

            {/* 五个规则 JSON 框 */}
            <div className="flex flex-col gap-4">
              <SectionLabel>规则 (JSON)</SectionLabel>
              {RULE_KEYS.map((key) => {
                const error = assembled.ruleErrors[key];
                return (
                  <div key={key} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-foreground">{RULE_LABELS[key]}</span>
                      <IconButton
                        size="sm"
                        variant="ghost"
                        aria-label={`格式化 ${key}`}
                        tooltip="格式化 JSON"
                        onClick={() => formatRule(key)}
                      >
                        <Braces aria-hidden />
                      </IconButton>
                    </div>
                    <Textarea
                      rows={5}
                      className="font-mono text-xs leading-5"
                      spellCheck={false}
                      aria-label={RULE_LABELS[key]}
                      placeholder={RULE_PLACEHOLDERS[key]}
                      invalid={error !== undefined}
                      value={draft.rules[key]}
                      onChange={(event) => setRule(key, event.target.value)}
                    />
                    {error !== undefined ? (
                      <span className="text-xs text-danger" role="alert">
                        {error}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* 整源 JSON 模式 */
          <div className="flex min-h-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                整源 JSON
              </span>
              <IconButton
                size="sm"
                variant="ghost"
                aria-label="格式化整源 JSON"
                tooltip="格式化 JSON"
                onClick={formatWhole}
              >
                <Braces aria-hidden />
              </IconButton>
            </div>
            <Textarea
              className="min-h-96 flex-1 font-mono text-xs leading-5"
              spellCheck={false}
              aria-label="整源 JSON"
              invalid={assembled.jsonError !== null}
              value={draft.jsonText}
              onChange={(event) => setField("jsonText", event.target.value)}
            />
            {assembled.jsonError !== null ? (
              <span className="text-xs text-danger" role="alert">
                {assembled.jsonError}
              </span>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
