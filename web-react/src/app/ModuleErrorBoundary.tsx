import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Подпись в UI и в логе */
  moduleName?: string;
  /** При смене ключа (например pathname) сбрасываем состояние ошибки */
  resetKey?: string;
};

type State = { hasError: boolean };

/**
 * Ловит ошибки рендера внутри дочернего дерева, чтобы не «ронять» всё приложение.
 */
export class ModuleErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const label = this.props.moduleName ?? 'module';
    console.error(`[ModuleErrorBoundary:${label}]`, error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props): void {
    const key = this.props.resetKey;
    if (key !== undefined && key !== prevProps.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const name = this.props.moduleName ?? 'этом разделе';
      return (
        <div className="flex min-h-[50dvh] w-full flex-1 flex-col items-center justify-center gap-4 bg-[var(--surface)] px-4 py-10">
          <p className="max-w-md text-center text-sm font-semibold text-stone-700">
            Не удалось отобразить {name}. Попробуйте обновить страницу или вернуться назад.
          </p>
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
