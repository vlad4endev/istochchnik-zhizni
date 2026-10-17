import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Ловит необработанные ошибки рендера: на iOS PWA без этого часто «просто белый экран».
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          boxSizing: 'border-box',
          /* 100vh: работает и на Safari < 15.4 (без dvh); для error-UI точности dvh не нужно. */
          minHeight: '100vh',
          padding: 24,
          fontFamily: 'system-ui, sans-serif',
          background: 'var(--surface, #f4f1ed)',
          color: 'var(--text, #1c1917)',
        }}
      >
        <h1 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 12px' }}>
          Не удалось открыть приложение
        </h1>
        <p style={{ fontSize: '0.875rem', lineHeight: 1.5, margin: '0 0 16px', opacity: 0.88 }}>
          Попробуйте обновить страницу. Если экран снова пустой — в Safari: «Настройки сайта» → удалить
          данные для этого адреса, либо удалите ярлык с экрана «Домой» и добавьте заново после
          обновления сайта.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 16px',
            fontSize: '0.875rem',
            borderRadius: 8,
            border: '1px solid var(--border-hover, #a8a29e)',
            background: 'var(--bg-interactive, #fff)',
            color: 'var(--text, #1c1917)',
            cursor: 'pointer',
          }}
        >
          Обновить
        </button>
      </div>
    );
  }
}
