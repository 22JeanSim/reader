import { Eye, EyeOff } from "lucide-react";
import * as React from "react";

import { Field } from "@/components/reader/SettingsControls";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  IconButton,
  Input,
  toast,
} from "@/components/ui";
import { errorMessage } from "@/hooks/useBookshelf";
import {
  toGatewayConfigPatch,
  useGatewayConfig,
  useTestGatewayEngine,
  useUpdateGatewayConfig,
  type GatewayConfig,
  type GatewayConfigField,
  type GatewayEngine,
} from "@/services/httptts";

/** 验证失败错误原文的截断上限 (字): 引擎报错可能带签名/堆栈等长细节, toast 只取头部 */
const TEST_ERROR_LIMIT = 200;

/** 从 /config 掩码视图取字段当前值 (与网关 _field_value 同口径); 视图未就绪/查无此键返回 undefined */
function resolveCurrentValue(config: GatewayConfig | undefined, key: string): string | undefined {
  if (config === undefined) {
    return undefined;
  }
  if (key === "generic_template") {
    return config.generic_template;
  }
  const dot = key.indexOf(".");
  if (dot === -1) {
    return undefined;
  }
  const section = key.slice(0, dot);
  const field = key.slice(dot + 1);
  return section === "endpoints" ? config.endpoints[field] : (config.sections[section]?.[field] ?? undefined);
}

/**
 * 单个配置字段: secret → password 输入 + 眼睛切换, 明文 → 普通输入; 两类都带「清除」按钮
 * (保存时发空串, 端点/模板也需要能清空禁用). placeholder 回显当前值 (secret 为掩码串);
 * draft undefined = 未改动, 空串 = 挂起的清除.
 */
function EngineConfigField({
  field,
  current,
  draft,
  onDraftChange,
  onClear,
}: {
  field: GatewayConfigField;
  /** 当前值 (secret 字段为掩码串), 作 placeholder 回显 */
  current: string;
  /** 用户草稿: undefined = 未改动, 空串 = 「清除」挂起, 其余为输入值 */
  draft: string | undefined;
  onDraftChange: (value: string) => void;
  onClear: () => void;
}) {
  const [revealed, setRevealed] = React.useState(false);
  const clearing = draft === "";
  let placeholder = current === "" ? "未配置" : current;
  if (clearing) {
    placeholder = "保存后清除当前值";
  }
  return (
    <Field label={field.label}>
      <div className="flex items-center gap-2">
        <Input
          size="sm"
          className="min-w-0 flex-1"
          type={field.secret && !revealed ? "password" : "text"}
          value={draft ?? ""}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder={placeholder}
          aria-label={field.label}
          autoComplete="off"
          suffix={
            field.secret ? (
              <IconButton
                size="sm"
                variant="ghost"
                className="-mr-1 text-muted-foreground"
                tooltip={revealed ? "隐藏" : "显示"}
                onClick={() => setRevealed((prev) => !prev)}
              >
                {revealed ? <EyeOff /> : <Eye />}
              </IconButton>
            ) : undefined
          }
        />
        <Button
          size="sm"
          variant={clearing ? "secondary" : "ghost"}
          disabled={current === ""}
          onClick={onClear}
        >
          清除
        </Button>
      </div>
    </Field>
  );
}

/** 弹窗内容 (草稿态在此, 随弹窗关闭卸载自然复位): 只把改动字段拼进 POST /config patch */
function EngineConfigForm({
  engine,
  gatewayUrl,
  onSaved,
}: {
  engine: GatewayEngine;
  gatewayUrl: string;
  /** 保存成功回报 (外层关闭弹窗) */
  onSaved: () => void;
}) {
  const configQuery = useGatewayConfig(gatewayUrl);
  const updateConfig = useUpdateGatewayConfig(gatewayUrl);
  const testEngine = useTestGatewayEngine(gatewayUrl);
  /** 用户编辑意图: key → 草稿; 缺席 = 未改动 (不进 patch), 空串只由「清除」写入 */
  const [edits, setEdits] = React.useState<Record<string, string>>({});

  const setDraft = (key: string, value: string): void => {
    setEdits((prev) => {
      const next = { ...prev };
      // 输入框删空视为回到未改动; 清除必须显式点「清除」按钮, 防误清空密钥
      if (value === "") {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  };

  const toggleClear = (key: string): void => {
    setEdits((prev) => {
      const next = { ...prev };
      // 再点一次 = 撤销清除
      if (next[key] === "") {
        delete next[key];
      } else {
        next[key] = "";
      }
      return next;
    });
  };

  // 改动字段: 当前值以 /config 掩码视图为准, 未就绪时退回 config_fields 携带的 value
  const changes = React.useMemo(() => {
    const out: Record<string, string> = {};
    for (const field of engine.config_fields) {
      const draft = edits[field.key];
      if (draft === undefined) continue;
      const current = resolveCurrentValue(configQuery.data, field.key) ?? field.value;
      if (draft === current) continue;
      out[field.key] = draft;
    }
    return out;
  }, [configQuery.data, edits, engine.config_fields]);
  const hasChanges = Object.keys(changes).length > 0;

  const handleSave = (): void => {
    updateConfig.mutate(toGatewayConfigPatch(changes), {
      onSuccess: () => {
        toast.success("已保存");
        onSaved();
      },
      onError: (error: unknown) => toast.error(errorMessage(error, "保存失败")),
    });
  };

  const handleVerify = (): void => {
    testEngine.mutate(engine.id, {
      onSuccess: (result) => {
        if (result.ok) {
          toast.success(`${engine.name} 可用 (${String(result.ms)} ms)`);
        } else {
          toast.error(result.error.slice(0, TEST_ERROR_LIMIT));
        }
      },
      onError: (error: unknown) => toast.error(errorMessage(error, "验证失败")),
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{engine.name} 配置</DialogTitle>
        <DialogDescription>{engine.setup}</DialogDescription>
      </DialogHeader>
      <div className="px-4 md:px-5">
        {engine.config_fields.map((field) => (
          <EngineConfigField
            key={field.key}
            field={field}
            current={resolveCurrentValue(configQuery.data, field.key) ?? field.value}
            draft={edits[field.key]}
            onDraftChange={(value) => setDraft(field.key, value)}
            onClear={() => toggleClear(field.key)}
          />
        ))}
      </div>
      <DialogFooter>
        <Button
          variant="secondary"
          loading={testEngine.isPending}
          disabled={updateConfig.isPending}
          title="按网关当前已保存配置真实合成一段验证"
          onClick={handleVerify}
        >
          验证
        </Button>
        <Button loading={updateConfig.isPending} disabled={!hasChanges} onClick={handleSave}>
          保存
        </Button>
      </DialogFooter>
    </>
  );
}

export interface EngineConfigDialogProps {
  /** 为 null 时弹窗保持关闭 */
  engine: GatewayEngine | null;
  gatewayUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * TTS 引擎配置弹窗 (网关 v3 运行时配置): 密钥/端点/模板直接在前端修改并验证,
 * 不再依赖网关环境变量. 字段结构来自引擎的 config_fields, 「验证」走 POST /test
 * 真实合成一段, 「保存」走 POST /config 增量 patch (空串=清除) 并作废能力清单缓存
 * (可用圆点即时刷新). 结构同 BookDetailDialog: 外壳无 hook, 内容随关闭卸载复位.
 */
export function EngineConfigDialog({
  engine,
  gatewayUrl,
  open,
  onOpenChange,
}: EngineConfigDialogProps) {
  if (engine === null) {
    return <Dialog open={false} onOpenChange={onOpenChange} />;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent width="sm">
        <EngineConfigForm
          key={engine.id}
          engine={engine}
          gatewayUrl={gatewayUrl}
          onSaved={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
