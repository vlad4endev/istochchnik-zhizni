import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Подпись в UI и в логе */
  moduleName?: string;
  /** При смене ключа (например pathname) сбрасываем состояние ошибки */
  resetKey?: string;
};

type State = { hasError: boolean; errorMessage?: string; errorStack?: string };

/**
 * Ловит ошибки рендера внутри дочернего дерева, чтобы не «ронять» всё приложение.
 */
export class ModuleErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: undefined, errorStack: undefined };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: typeof error?.message === 'string' ? error.message : 'Unknown error',
      errorStack: typeof error?.stack === 'string' ? error.stack : undefined,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const label = this.props.moduleName ?? 'module';
    console.error(`[ModuleErrorBoundary:${label}]`, error, info.componentStack);
    // keep component stack for UI debug
    try {
      this.setState({ errorStack: info.componentStack || error.stack || this.state.errorStack });
    } catch {
      // ignore
    }
  }

  componentDidUpdate(prevProps: Props): void {
    const key = this.props.resetKey;
    if (key !== undefined && key !== prevProps.resetKey && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: undefined, errorStack: undefined });
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const name = this.props.moduleName ?? 'этом разделе';
      const detailsEnabled =
        (typeof window !== 'undefined' && window.location?.search?.includes('debug=1')) ||
        (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production');
      return (
        <div className="flex min-h-[50dvh] w-full flex-1 flex-col items-center justify-center gap-4 bg-[var(--surface)] px-4 py-10">
          <p className="max-w-md text-center text-sm font-semibold text-stone-700">
            Не удалось отобразить {name}. Попробуйте обновить страницу или вернуться назад.
          </p>
          {detailsEnabled ? (
            <details className="w-full max-w-2xl rounded-2xl border border-stone-200 bg-white p-3 text-left shadow-sm">
              <summary className="cursor-pointer text-xs font-bold text-stone-700">
                Показать технические детали
              </summary>
              <div className="mt-2 space-y-2">
                <p className="text-xs font-semibold text-stone-900">
                  {this.state.errorMessage ?? 'Unknown error'}
                </p>
                {this.state.errorStack ? (
                  <pre className="max-h-[260px] overflow-auto rounded-xl bg-stone-50 p-2 text-[11px] leading-snug text-stone-700">
                    {this.state.errorStack}
                  </pre>
                ) : null}
              </div>
            </details>
          ) : null}
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-primary/25"
          >
            Повторить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
