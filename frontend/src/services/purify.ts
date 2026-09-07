import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { toast } from "@/components/ui/Toast";
import { ApiError, get, parseWith, post, type ApiRequestConfig } from "@/lib/api-client";
import { humanizeError, reportError } from "@/lib/errors";

/**
 * 正文净化(替换规则)接口 + 渲染期应用.
 *
 * warp 只做规则的 CRUD, 不把规则应用到正文, 因此「净化」发生在前端渲染期:
 * 缓存里的原始正文 → 按 order 升序跑规则 → DOMPurify 清洗 → 切段.
 * 规则一改, 已缓存的章节立即跟着变, 不需要重新抓正文.
 */

/** 正则超时默认值(与后端 ReplaceRule::default 一致) */
export const DEFAULT_TIMEOUT_MS = 3000;

/**
 * ReplaceRule 实体 wire 形状(warp src/model/replace_rule.rs 的 serde 名):
 * `enabled` / `order` 才是线上字段名 —— `enable` / `order_num` 只是 sqlx 列名, 不上 wire;
 * `find` / `replace` 另有 legacy 别名 pattern / replacement, 前端一律用规范名.
 * group / scope 为 Option, 后端显式输出 null, 进 zod 前由 stripNullsDeep 归一成缺键.
 */
export const replaceRuleSchema = z.object({
  /** 规则 id: 前端留空时后端补 uuid 并在 saveReplaceRule 的 data.id 回传 */
  id: z.string(),
  name: z.string(),
  /** 分组(legacy 字段, 当前 UI 不编辑, 原样透传以免回写时丢失) */
  group: z.string().optional(),
  /** 查找内容(正则源或字面量), 后端拒收空串 */
  find: z.string(),
  /** 替换为; 空串即删除匹配到的文字 */
  replace: z.string(),
  /** legacy 作用范围(书源/书名过滤), 当前 UI 不编辑也不据此过滤, 原样透传 */
  scope: z.string().optional(),
  scopeTitle: z.boolean().default(false),
  scopeContent: z.boolean().default(true),
  isRegex: z.boolean().default(false),
  /** 正则超时毫秒(legacy 字段; 浏览器无法中断正则, 仅透传) */
  timeoutMillisecond: z.number().default(DEFAULT_TIMEOUT_MS),
  enabled: z.boolean().default(true),
  /** 应用顺序, 升序; 后端列表已按它排序 */
  order: z.number().default(0),
});

export const replaceRuleListSchema = z.array(replaceRuleSchema);

export type ReplaceRule = z.output<typeof replaceRuleSchema>;

/** `/saveReplaceRule` 的 data: 生效 id(归属冲突时后端会改插新 id, 前端以它为准) */
const savedRuleIdSchema = z.object({ id: z.string() });

/** react-query 缓存键: ["replaceRules"]; 净化页与阅读器渲染期净化共用同一份列表 */
export const REPLACE_RULES_QUERY_KEY = ["replaceRules"] as const;

/** 列表 staleTime: 阅读器常驻, 规则改动一律由 mutation 主动失效 */
const RULES_STALE_MS = 5 * 60_000;

const EMPTY_RULES: ReplaceRule[] = [];

/** 归一化后端/网络异常里的可展示文案: 原始串进 console, UI 只给人话 */
export function purifyErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : "";
  if (raw.trim().length === 0) return fallback;
  reportError(raw, "purify");
  return humanizeError(raw, fallback);
}

/** 规则列表(warp 按 order_num, id 升序返回; 无用户规则时回退 default 命名空间) */
export async function getReplaceRules(config?: ApiRequestConfig): Promise<ReplaceRule[]> {
  const data = await get<unknown>("/getReplaceRules", undefined, config);
  return parseWith(replaceRuleListSchema, data);
}

/** 保存单条规则(新增/更新按 id upsert); 返回后端认定的生效 id */
export async function saveReplaceRule(
  rule: ReplaceRule,
  config?: ApiRequestConfig,
): Promise<string> {
  const data = await post<unknown>("/saveReplaceRule", rule, config);
  return parseWith(savedRuleIdSchema, data).id;
}

/** 删除单条规则(后端按 id 匹配) */
export async function deleteReplaceRule(id: string, config?: ApiRequestConfig): Promise<void> {
  await post<unknown>("/deleteReplaceRule", { id }, config);
}

export interface UseReplaceRulesResult {
  rules: ReplaceRule[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
}

/** 净化规则列表: 进净化页与进阅读器都会挂上, 5 分钟内复用缓存 */
export function useReplaceRules(): UseReplaceRulesResult {
  const query = useQuery({
    queryKey: REPLACE_RULES_QUERY_KEY,
    queryFn: () => getReplaceRules(),
    staleTime: RULES_STALE_MS,
  });

  return {
    rules: query.data ?? EMPTY_RULES,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

/** 本地写回新增/更新: 按 id 去重, 已存在的原位覆盖、新 id 追加(与后端 upsert 语义一致) */
function upsertRuleIntoCache(queryClient: QueryClient, rule: ReplaceRule): void {
  const cached = queryClient.getQueryData<ReplaceRule[]>(REPLACE_RULES_QUERY_KEY);
  if (cached === undefined) return;
  const merged = cached.some((item) => item.id === rule.id)
    ? cached.map((item) => (item.id === rule.id ? rule : item))
    : [...cached, rule];
  queryClient.setQueryData<ReplaceRule[]>(REPLACE_RULES_QUERY_KEY, merged);
}

/** 本地写回删除 */
function removeRuleFromCache(queryClient: QueryClient, id: string): void {
  const cached = queryClient.getQueryData<ReplaceRule[]>(REPLACE_RULES_QUERY_KEY);
  if (cached === undefined) return;
  queryClient.setQueryData<ReplaceRule[]>(
    REPLACE_RULES_QUERY_KEY,
    cached.filter((rule) => rule.id !== id),
  );
}

/**
 * 新增/编辑规则(单条 upsert; 后端对空名称/空查找内容报错).
 * 成功后本地写回 + 失效 ["replaceRules"], 正在渲染的正文随之重跑净化;
 * 成功提示由调用方按场景给(净化页「已保存」/ 阅读器「已添加」).
 */
export function useSaveReplaceRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rule: ReplaceRule) => {
      const id = await saveReplaceRule(rule);
      return { ...rule, id };
    },
    onSuccess: (saved) => {
      upsertRuleIntoCache(queryClient, saved);
      void queryClient.invalidateQueries({ queryKey: REPLACE_RULES_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(purifyErrorMessage(error, "保存净化规则失败"));
    },
  });
}

/**
 * 启用/停用开关: 先乐观写回缓存(整对象提交, 保留其余字段), 正文立刻跟着生效/还原;
 * 失败回滚并提示. warp 的规则读写没有服务端缓存窗口, 落库后直接失效对账即可.
 */
export function useToggleReplaceRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const cached = queryClient.getQueryData<ReplaceRule[]>(REPLACE_RULES_QUERY_KEY) ?? EMPTY_RULES;
      const target = cached.find((rule) => rule.id === id);
      if (target === undefined) {
        throw new ApiError("规则数据已过期, 请刷新后重试");
      }
      const next = { ...target, enabled };
      queryClient.setQueryData<ReplaceRule[]>(
        REPLACE_RULES_QUERY_KEY,
        cached.map((rule) => (rule.id === id ? next : rule)),
      );
      try {
        await saveReplaceRule(next);
      } catch (error) {
        queryClient.setQueryData<ReplaceRule[]>(REPLACE_RULES_QUERY_KEY, cached);
        throw error;
      }
      return next;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REPLACE_RULES_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(purifyErrorMessage(error, "切换启用状态失败"));
    },
  });
}

/** 删除规则; 成功后本地写回缓存并提示 */
export function useDeleteReplaceRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteReplaceRule(id),
    onSuccess: (_data, id) => {
      removeRuleFromCache(queryClient, id);
      void queryClient.invalidateQueries({ queryKey: REPLACE_RULES_QUERY_KEY });
      toast.success("已删除净化规则");
    },
    onError: (error) => {
      toast.error(purifyErrorMessage(error, "删除净化规则失败"));
    },
  });
}

/* ---------- 渲染期应用 ---------- */

/** 规则作用位置: 正文 / 章节标题 */
export type PurifyTarget = "content" | "title";

/**
 * 取出生效规则并按 order 升序: enabled 且对应 scope 打开.
 * order 相同的保持后端返回顺序(后端已按 order_num, id 排).
 */
export function activeReplaceRules(
  rules: readonly ReplaceRule[],
  target: PurifyTarget,
): ReplaceRule[] {
  return rules
    .filter((rule) => rule.enabled && (target === "content" ? rule.scopeContent : rule.scopeTitle))
    .sort((a, b) => a.order - b.order);
}

/**
 * 把规则依次作用到文本上(正文是清洗前的原始 HTML, 规则可能命中标签内文字, 与 legado 同语义):
 * - isRegex: `compileRuleRegex` (支持前缀标志组 `(?m)`/`(?i)`/`(?s)`, 社区规则集依赖),
 *   编译或执行失败的单条规则跳过, 不连累其余规则;
 * - 字面量: split/join, 替换串里的 `$` 不参与插值(与正则分支的区别是刻意的);
 * - find 为空的规则跳过: 空正则会在每个字符间插入替换串.
 */
export function applyReplaceRules(text: string, rules: readonly ReplaceRule[]): string {
  if (text === "" || rules.length === 0) {
    return text;
  }
  let output = text;
  for (const rule of rules) {
    if (rule.find === "") {
      continue;
    }
    try {
      output = rule.isRegex
        ? output.replace(compileRuleRegex(rule.find), rule.replace)
        : output.split(rule.find).join(rule.replace);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "";
      reportError(raw, `净化规则「${rule.name}」未生效`);
    }
  }
  return output;
}

const LEADING_FLAGS = /^\(\?([ims]+)\)/;

/**
 * 编译净化正则: 前缀标志组 `(?ims)` 提升为 RegExp flags (JS 无内联标志),
 * 与 scripts/import_purify_rules.py 的 split_flags 同契约; 无前缀即纯 `g`.
 */
export function compileRuleRegex(find: string): RegExp {
  const m = LEADING_FLAGS.exec(find);
  if (!m) {
    return new RegExp(find, "g");
  }
  return new RegExp(find.slice(m[0].length), `g${m[1]}`);
}

/** 正则源能否编译; 能编译返回 null, 否则返回可展示的原因(表单校验用) */
export function regexErrorOf(pattern: string): string | null {
  try {
    void compileRuleRegex(pattern);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "正则表达式有误";
  }
}

/** 转义正则元字符: 让一段字面文字可以安全地当 RegExp 源 */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 句末标点集: 句子边界回溯/前探都只认这些字符(… 按单字符算) */
const SENTENCE_END = "。！？…；;!?";

/**
 * 把 [start, end) 选区扩到完整句子边界, 返回 [句首, 句末) 半开区间:
 * 向前回溯到最近句末标点之后(没有标点就到段首), 向后吃掉最近句末标点(没有就到段尾),
 * 即 `text.slice(...extendToSentence(text, s, e))` 就是含标点的整句.
 * 入参越界先夹回文本范围; end <= start 时退化成空区间.
 */
export function extendToSentence(text: string, start: number, end: number): [number, number] {
  const from = Math.min(Math.max(start, 0), text.length);
  const to = Math.min(Math.max(end, from), text.length);
  let begin = 0;
  for (let i = from - 1; i >= 0; i -= 1) {
    if (SENTENCE_END.includes(text.charAt(i))) {
      begin = i + 1;
      break;
    }
  }
  let stop = text.length;
  for (let i = to; i < text.length; i += 1) {
    if (SENTENCE_END.includes(text.charAt(i))) {
      stop = i + 1;
      break;
    }
  }
  return [begin, stop];
}

/** 「添加净化」的默认草稿: 选中文字扩成整句后, 名字与查找内容都就位 */
export interface PurifyDraft {
  /** 扩展成整句后的原文(弹窗里只读展示) */
  sentence: string;
  /** 规则名默认值 */
  name: string;
  /** 查找内容默认值: 整句的转义正则 */
  pattern: string;
}

/** 规则名默认值: 「净化·」+ 句首 12 字(去掉空白) */
export function purifyRuleName(sentence: string): string {
  return `净化·${sentence.replace(/\s+/g, "").slice(0, 12)}`;
}

/**
 * 段落纯文本 + 段内选区偏移 → 「添加净化」草稿:
 * 选区扩到整句, 查找内容默认是整句的转义正则(替换留空即消掉整句).
 */
export function buildPurifyDraft(paragraphText: string, start: number, end: number): PurifyDraft {
  const [sentenceStart, sentenceEnd] = extendToSentence(paragraphText, start, end);
  const sentence = paragraphText.slice(sentenceStart, sentenceEnd);
  return { sentence, name: purifyRuleName(sentence), pattern: escapeRegExp(sentence) };
}

/** 新规则的空白草稿: 只作用正文、字面量匹配、启用; id 留空由后端补 uuid */
export function emptyReplaceRule(order: number): ReplaceRule {
  return {
    id: "",
    name: "",
    find: "",
    replace: "",
    scopeTitle: false,
    scopeContent: true,
    isRegex: false,
    timeoutMillisecond: DEFAULT_TIMEOUT_MS,
    enabled: true,
    order,
  };
}

/** 新规则排到末尾: 现有最大 order + 1(空列表从 1 起) */
export function nextRuleOrder(rules: readonly ReplaceRule[]): number {
  return rules.reduce((max, rule) => Math.max(max, rule.order), 0) + 1;
}

/** 批量保存规则(后端整批校验, 任一条空 name/find 会整批拒) */
export async function saveReplaceRulesBulk(
  rules: ReplaceRule[],
  config?: ApiRequestConfig,
): Promise<void> {
  await post<unknown>("/saveReplaceRules", rules, config);
}

/** 清空当前命名空间全部规则(导入「覆盖」模式用) */
export async function deleteAllReplaceRules(config?: ApiRequestConfig): Promise<void> {
  await post<unknown>("/deleteReplaceRules", { all: true }, config);
}

export function useSaveReplaceRulesBulk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rules: ReplaceRule[]) => saveReplaceRulesBulk(rules),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REPLACE_RULES_QUERY_KEY });
    },
  });
}

export function useDeleteAllReplaceRules() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteAllReplaceRules(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REPLACE_RULES_QUERY_KEY });
    },
  });
}

/**
 * 导入转换: 与 scripts/import_purify_rules.py 的 convert_pattern 同语义 —
 * 内联标志组 (?ims) 归一到前缀 (compileRuleRegex 解析), \\h 展开,
 * \\W/[^\\w]/[^\\d\\w] 补 CJK 排除, 短行分支收紧为纯符号行.
 */
export function convertImportedPattern(pat: string): string {
  let flags = "";
  const stripped = pat.replace(/\(\?([ims]+)\)/g, (_m, group: string) => {
    for (const ch of group) {
      if (!flags.includes(ch)) flags += ch;
    }
    return "";
  });
  let out = stripped
    .replace(/\\h/g, "[ \\t]")
    .replace(/\\H/g, "[^ \\t]")
    .replace("[^\\d\\w]", "[^\\d\\w一-龥]")
    .replace("[^\\w]", "[^\\w一-龥]")
    .replace(/\\W/g, "[^\\w一-龥]");
  out = out
    .replace("^[^\\d\\w一-龥]*[一-龥]?[^\\d\\w一-龥]*$", "^[^\\d\\w一-龥]+$")
    .replace("^[^\\d\\w一-龥]*[\\u4e00-\\u9fa5]?[^\\d\\w一-龥]*$", "^[^\\d\\w一-龥]+$");
  return flags === "" ? out : `(?${flags})${out}`;
}

export interface ImportedRules {
  rules: ReplaceRule[];
  /** 被跳过的条目名(空查找/正则编译失败) */
  skipped: string[];
}

/** 导入条目 schema: 兼容 legacy yuedu 导出与本端 wire 两种键名, 多余键忽略 */
const importedItemSchema = z.object({
  name: z.string().nullish(),
  replaceSummary: z.string().nullish(),
  regex: z.string().nullish(),
  find: z.string().nullish(),
  replace: z.string().nullish(),
  replacement: z.string().nullish(),
  scopeTitle: z.boolean().nullish(),
  scopeContent: z.boolean().nullish(),
  isRegex: z.boolean().nullish(),
  timeoutMillisecond: z.number().nullish(),
  enabled: z.boolean().nullish(),
  enable: z.boolean().nullish(),
  order: z.number().nullish(),
  serialNumber: z.number().nullish(),
});

/** 导入文档 schema: 规则数组, 或 {rules: [...]} 包装 */
const importedDocSchema = z.union([
  z.array(z.unknown()),
  z.object({ rules: z.array(z.unknown()) }),
]);

/**
 * 解析导入 JSON: 兼容 legacy yuedu 导出 ({regex, replacement, replaceSummary,
 * enable, isRegex, serialNumber}) 与本端 wire 格式; 坏条目跳过不连累整批.
 */
export function parseImportedRules(rawText: string, startOrder: number): ImportedRules {
  const doc = importedDocSchema.parse(JSON.parse(rawText));
  const items = Array.isArray(doc) ? doc : doc.rules;
  const rules: ReplaceRule[] = [];
  const skipped: string[] = [];
  items.forEach((item, index) => {
    const parsedItem = importedItemSchema.safeParse(item);
    if (!parsedItem.success) {
      skipped.push(`第 ${index + 1} 条(字段类型不符)`);
      return;
    }
    const o = parsedItem.data;
    const legacy = o.regex !== null && o.regex !== undefined;
    const source = legacy ? (o.regex ?? "") : (o.find ?? "");
    const find = legacy ? convertImportedPattern(source) : source;
    const name = (o.name ?? o.replaceSummary ?? "").trim() || `导入规则 ${index + 1}`;
    if (find.trim() === "") {
      skipped.push(name);
      return;
    }
    const isRegex = o.isRegex ?? true;
    if (isRegex && regexErrorOf(find) !== null) {
      skipped.push(name);
      return;
    }
    const order = o.order ?? o.serialNumber ?? 0;
    rules.push({
      id: "",
      name,
      find,
      replace: o.replace ?? o.replacement ?? "",
      scopeTitle: o.scopeTitle ?? false,
      scopeContent: o.scopeContent ?? true,
      isRegex,
      timeoutMillisecond: o.timeoutMillisecond ?? DEFAULT_TIMEOUT_MS,
      enabled: o.enabled ?? o.enable ?? true,
      order: order > 0 ? order : startOrder + index,
    });
  });
  return { rules, skipped };
}

/** 导出 JSON: 本端 wire 格式, 可再导入或给 scripts/import_purify_rules.py 用 */
export function exportRulesJson(rules: readonly ReplaceRule[]): string {
  return JSON.stringify(
    {
      app: "reader-dev",
      kind: "purify-rules",
      version: 1,
      exportedAt: new Date().toISOString(),
      rules,
    },
    null,
    1,
  );
}
