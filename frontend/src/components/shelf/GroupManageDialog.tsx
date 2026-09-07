import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import * as React from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  IconButton,
  Input,
} from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import {
  BOOK_GROUPS_QUERY_KEY,
  errorMessage,
} from "@/hooks/useBookshelf";
import { humanizeError } from "@/lib/errors";
import { deleteBookGroup, saveBookGroup } from "@/services/bookshelf";
import type { BookGroup } from "@/types/api";

export interface GroupManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 自定义分组(内置分组不可编辑, 由调用方过滤后传入) */
  groups: BookGroup[];
}

/**
 * 分组管理: 新建 + 重命名(失焦保存) + 删除. 删除后组内书回落未分组 (后端语义).
 */
export function GroupManageDialog({ open, onOpenChange, groups }: GroupManageDialogProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState("");

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: BOOK_GROUPS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["books"] });
  };

  const create = useMutation({
    mutationFn: (name: string) => saveBookGroup({ groupName: name }),
    onSuccess: () => {
      toast.success("分组已创建");
      setDraft("");
      invalidate();
    },
    onError: (error) => toast.error(humanizeError(errorMessage(error, "创建分组失败"))),
  });

  const rename = useMutation({
    mutationFn: (group: BookGroup) =>
      saveBookGroup({ groupId: group.groupId, groupName: group.groupName }),
    onSuccess: () => {
      toast.success("已重命名");
      invalidate();
    },
    onError: (error) => toast.error(humanizeError(errorMessage(error, "重命名失败"))),
  });

  const remove = useMutation({
    mutationFn: (groupId: number) => deleteBookGroup(groupId),
    onSuccess: () => {
      toast.success("分组已删除, 组内书籍回到未分组");
      invalidate();
    },
    onError: (error) => toast.error(humanizeError(errorMessage(error, "删除分组失败"))),
  });

  const submitCreate = (): void => {
    const name = draft.trim();
    if (name.length === 0) {
      return;
    }
    create.mutate(name);
  };

  /** 内置分组 (全部/本地/音频/未分组, groupId<0) 不可编辑删除: 只列自定义组 */
  const customGroups = React.useMemo(() => groups.filter((group) => group.groupId > 0), [groups]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent width="sm">
        <DialogHeader>
          <DialogTitle>管理分组</DialogTitle>
          <DialogDescription>
            新建、重命名或删除自定义分组; 删除后组内书籍回到未分组.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-4 pb-4 md:px-5">
          <div className="flex items-center gap-2">
            <Input
              aria-label="新分组名称"
              placeholder="新分组名称"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  submitCreate();
                }
              }}
            />
            <Button
              size="sm"
              loading={create.isPending}
              disabled={draft.trim().length === 0}
              onClick={submitCreate}
            >
              新建
            </Button>
          </div>
          {customGroups.length === 0 ? (
            <p className="text-xs text-muted-foreground">还没有自定义分组.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {customGroups.map((group) => (
                <li key={group.groupId} className="flex items-center gap-2">
                  <Input
                    aria-label={`分组 ${group.groupName} 名称`}
                    defaultValue={group.groupName}
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next.length === 0 || next === group.groupName) {
                        event.target.value = group.groupName;
                        return;
                      }
                      rename.mutate({ ...group, groupName: next });
                    }}
                  />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    aria-label={`删除分组 ${group.groupName}`}
                    tooltip="删除分组"
                    loading={remove.isPending && remove.variables === group.groupId}
                    onClick={() => remove.mutate(group.groupId)}
                  >
                    <Trash2 aria-hidden />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
