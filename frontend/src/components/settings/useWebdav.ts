import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui";
import { dispatchUnauthorized } from "@/lib/api-client";
import { reportError } from "@/lib/errors";
import { getUserInfo } from "@/services/auth";
import {
  backupToWebdav,
  deleteWebdavFile,
  deleteWebdavFileList,
  getWebdavFileList,
  restoreFromWebdav,
  uploadFilesToWebdav,
  type WebdavFile,
} from "@/services/webdav";

/** webdav 文件列表 query key: ["webdavFiles", path]; 写操作成功后整前缀失效 */
export const WEBDAV_FILES_QUERY_KEY = ["webdavFiles"] as const;
/** 当前用户信息 query key(getUserInfo: enableWebdav 开关 + secure 模式) */
export const USER_INFO_QUERY_KEY = ["userInfo"] as const;

const EMPTY_FILES: WebdavFile[] = [];

/** 归一化后端/网络异常里的可展示文案: 原文进 console, UI 只出 humanizeError 映射后的人话 */
export function webdavErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : "";
  return raw.trim().length > 0 ? reportError(raw, "webdav") : fallback;
}

export interface UseWebdavAccessResult {
  /** webdav 是否可用: 单用户模式(secure=false)恒可用, 多用户模式看用户 enable_webdav */
  enabled: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/** 读 getUserInfo 判定 webdav 开关; 后端各接口在 secure 模式下对未开启用户统一报错 */
export function useWebdavAccess(): UseWebdavAccessResult {
  const query = useQuery({
    queryKey: USER_INFO_QUERY_KEY,
    queryFn: () => getUserInfo(),
    refetchOnMount: "always",
  });
  const secure = query.data?.secure ?? true;
  const enabled = !secure || query.data?.userInfo?.enableWebdav === true;
  return { enabled, isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}

export interface UseWebdavFilesResult {
  files: WebdavFile[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * 当前目录的文件列表.
 * /reader3/file/list 直接读写文件系统(warp files.rs), 不经过任何存储层读缓存,
 * 所以写操作成功后立即 invalidate 重拉即可, 无需本地写回.
 */
export function useWebdavFiles(path: string, enabled: boolean): UseWebdavFilesResult {
  const query = useQuery({
    queryKey: [...WEBDAV_FILES_QUERY_KEY, path],
    queryFn: ({ signal }) => getWebdavFileList(path, { signal }),
    enabled,
    refetchOnMount: "always",
  });
  return {
    files: query.data ?? EMPTY_FILES,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

function invalidateWebdavFiles(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: WEBDAV_FILES_QUERY_KEY });
}

/** 一键备份: 目录里没有 backup*.zip 也能首备(后端 saveToWebdav 支持空底), 成功后重拉列表 */
export function useBackupWebdav() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => backupToWebdav(),
    onSuccess: () => {
      invalidateWebdavFiles(queryClient);
      toast.success("备份成功");
    },
    onError: (error) => {
      toast.error(webdavErrorMessage(error, "备份失败"));
    },
  });
}

/**
 * 从 zip 恢复: 服务端书源/书架/分组/RSS/替换规则/书签全部被备份覆盖,
 * 客户端所有缓存随之失效 → 清空 react-query 缓存, 并按现有登录失效流程
 * (dispatchUnauthorized → 全局监听 → /login?redirect=…)强制重新登录拉取恢复后数据.
 */
export function useRestoreWebdav() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => restoreFromWebdav(path),
    onSuccess: () => {
      queryClient.clear();
      toast.success("恢复成功, 请重新登录", 5000);
      dispatchUnauthorized("备份已恢复, 请重新登录");
    },
    onError: (error) => {
      toast.error(webdavErrorMessage(error, "恢复失败"));
    },
  });
}

/** 删除文件: 单个走 deleteWebdavFile, 多个走 deleteWebdavFileList */
export function useDeleteWebdavFiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) => {
      const [only] = paths;
      return paths.length === 1 && only !== undefined
        ? deleteWebdavFile(only)
        : deleteWebdavFileList(paths);
    },
    onSuccess: (_data, paths) => {
      invalidateWebdavFiles(queryClient);
      toast.success(paths.length > 1 ? `已删除 ${paths.length} 个文件` : "已删除文件");
    },
    onError: (error) => {
      toast.error(webdavErrorMessage(error, "删除文件失败"));
    },
  });
}

/** 失败文件点名(最多列 3 个): 「a.zip」 / 「a.zip、b.zip、c.zip」等 5 个文件 */
function describeFailedFiles(names: readonly string[]): string {
  const shown = names.slice(0, 3).join("、");
  return names.length > 3 ? `「${shown}」等 ${names.length} 个文件` : `「${shown}」`;
}

/**
 * 上传文件到指定目录; 返回值是成功写入的条目列表, 成功后一律重拉列表.
 * 后端逐个写入且静默跳过失败项, 所以拿返回的文件名与所选文件对账, 失败时在 toast 里点名.
 */
export function useUploadWebdavFiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ files, path }: { files: File[]; path: string }) =>
      uploadFilesToWebdav(files, path),
    onSuccess: (uploaded, { files }) => {
      invalidateWebdavFiles(queryClient);
      const done = new Set(uploaded.map((file) => file.name));
      const failed = files.map((file) => file.name).filter((name) => !done.has(name));
      if (failed.length === 0) {
        toast.success(`已上传 ${uploaded.length} 个文件`);
        return;
      }
      toast.error(
        uploaded.length > 0
          ? `已上传 ${uploaded.length} 个, 失败 ${describeFailedFiles(failed)}`
          : `上传失败 ${describeFailedFiles(failed)}`,
        5000,
      );
    },
    onError: (error, { files }) => {
      const reason = webdavErrorMessage(error, "上传失败");
      if (files.length < 2) {
        toast.error(reason, 5000);
        return;
      }
      toast.error(`${reason}, 未上传 ${describeFailedFiles(files.map((file) => file.name))}`, 5000);
    },
  });
}
