import {
  Component,
  Suspense,
  lazy,
  type ComponentType,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
} from "react";

// 直接指向 ui 子模块而非 "@/components/ui" 桶文件:
// 本文件被路由表(App.tsx)静态引用, 桶文件会把 Dialog/Drawer/Select 等仅页面用到的组件
// 连同其 @radix-ui 依赖一起拖进首屏 entry chunk, 破坏路由级分包.
import { Button } from "@/components/ui/Button";
import { Skeleton, SkeletonList } from "@/components/ui/Skeleton";

/**
 * 各浏览器动态 import 失败(chunk 404 / 断网 / 部署换版本)的错误文案特征.
 * Chrome: Failed to fetch dynamically imported module
 * Firefox: error loading dynamically imported module
 * Safari: Importing a module script failed
 * Vite 预加载 CSS 失败: Unable to preload CSS
 */
const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Failed to load module script|Unable to preload CSS/i;

/** 判断是否 chunk 加载失败(webpack 时代叫 ChunkLoadError, 这里是原生 ESM 的等价物). */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === "ChunkLoadError" || CHUNK_ERROR_PATTERN.test(error.message);
}

interface ChunkErrorBoundaryProps {
  children: ReactNode;
}

interface ChunkErrorBoundaryState {
  /** chunk 失效: 渲染"版本已更新"提示 */
  stale: boolean;
  /** 非 chunk 错误: render 阶段原样抛出, 交给上层边界 / React 默认处理 */
  passthrough: Error | null;
}

/**
 * 路由级 chunk 兜底边界:
 * 部署更新后旧 chunk 被清理(404)或网络异常时, 页面不会白屏/裸报错,
 * 而是提示用户刷新拉取新版本; 其余错误(业务/渲染 bug)照常上抛, 不在这里吞掉.
 */
export class ChunkErrorBoundary extends Component<
  ChunkErrorBoundaryProps,
  ChunkErrorBoundaryState
> {
  override state: ChunkErrorBoundaryState = { stale: false, passthrough: null };

  static getDerivedStateFromError(error: unknown): ChunkErrorBoundaryState {
    return isChunkLoadError(error)
      ? { stale: true, passthrough: null }
      : {
          stale: false,
          passthrough: error instanceof Error ? error : new Error(String(error)),
        };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // 非 chunk 错误由 render 上抛, 这里只为 chunk 失效留一条可排查的日志.
    if (isChunkLoadError(error)) {
      console.warn("[reader] 页面资源加载失败, 需要刷新", error.message, errorInfo.componentStack);
    }
  }

  override render(): ReactNode {
    if (this.state.passthrough) {
      throw this.state.passthrough;
    }
    if (this.state.stale) {
      return <StaleVersionNotice />;
    }
    return this.props.children;
  }
}

/** chunk 失效提示: 文案 + 刷新按钮(整页 reload 以拉取新版本资源). */
function StaleVersionNotice(): ReactElement {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-background px-4 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <h1 className="text-base font-semibold">版本已更新</h1>
        <p className="text-sm text-muted-foreground">
          当前页面资源已失效, 刷新后即可加载最新版本.
        </p>
        <Button
          onClick={() => {
            window.location.reload();
          }}
        >
          刷新页面
        </Button>
      </div>
    </div>
  );
}

/** 路由级 Suspense 占位: 复用 Skeleton 基元, 尺寸贴布局壳内容区, 背景跟随主题不闪白. */
function RouteFallback(): ReactElement {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="页面加载中"
      className="flex h-full min-h-0 flex-col gap-4 bg-background px-3 py-3 md:px-6 md:py-4"
    >
      <Skeleton className="h-5 w-24" />
      <Skeleton shape="rect" className="h-10 w-full max-w-xl" />
      <SkeletonList className="mt-1" count={5} />
    </div>
  );
}

/**
 * 路由级懒加载登记助手: 每个页面一个 chunk, 自带 Suspense 占位与 chunk 失效兜底.
 *
 * ```tsx
 * const ShelfPage = lazyPage(() => import("@/pages/ShelfPage"));
 * <Route path="/" element={<ShelfPage />} />
 * ```
 *
 * 必须在模块顶层调用(loader 只应被 React.lazy 记录一次).
 */
export function lazyPage(loader: () => Promise<{ default: ComponentType }>): ComponentType {
  const LazyComponent = lazy(loader);
  return function LazyRoute(): ReactElement {
    return (
      <ChunkErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <LazyComponent />
        </Suspense>
      </ChunkErrorBoundary>
    );
  };
}
