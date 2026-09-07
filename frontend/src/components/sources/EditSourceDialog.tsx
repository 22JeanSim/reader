import * as React from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
  toast,
} from "@/components/ui";
import { parseBookSourcesText } from "@/services/sources";
import type { BookSource } from "@/types/api";

import { useSaveBookSources } from "./useSources";

export interface EditSourceDialogProps {
  /** 编辑的书源; null 表示未打开 */
  source: BookSource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 单书源 JSON 编辑: 后端按 bookSourceUrl upsert, 修改地址会另存为一个新书源 */
export function EditSourceDialog({ source, open, onOpenChange }: EditSourceDialogProps) {
  const [text, setText] = React.useState("");
  const save = useSaveBookSources();

  // 每次打开时回填当前书源的 JSON
  React.useEffect(() => {
    if (open && source !== null) {
      setText(JSON.stringify(source, null, 2));
    }
  }, [open, source]);

  const parsed = React.useMemo(() => parseBookSourcesText(text), [text]);
  const feedback =
    parsed.error ??
    (parsed.sources.length === 0
      ? text.trim().length === 0
        ? null
        : "没有解析到有效书源(检查 bookSourceUrl 是否为空)"
      : parsed.sources.length > 1
        ? "编辑框里只能有一个书源对象"
        : null);
  const valid = feedback === null && parsed.sources.length === 1;

  const handleSave = () => {
    const only = parsed.sources[0];
    if (only === undefined) return;
    save.mutate([only], {
      onSuccess: () => {
        toast.success("书源已保存");
        onOpenChange(false);
      },
    });
  };

  const name = source !== null && source.bookSourceName.length > 0 ? source.bookSourceName : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent width="lg">
        <DialogHeader>
          <DialogTitle className="truncate">
            编辑书源{name.length > 0 ? ` · ${name}` : ""}
          </DialogTitle>
          <DialogDescription>
            直接编辑书源 JSON, 保存时按书源地址覆盖更新; 修改 bookSourceUrl 会另存为一个新书源
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 md:px-5">
          <Textarea
            rows={18}
            className="font-mono text-xs leading-5"
            value={text}
            onChange={(event) => setText(event.target.value)}
            invalid={feedback !== null}
            aria-label="书源 JSON"
            spellCheck={false}
          />
          {feedback !== null ? (
            <p className="mt-1.5 text-xs text-danger" role="alert">
              {feedback}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={!valid} loading={save.isPending} onClick={handleSave}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
