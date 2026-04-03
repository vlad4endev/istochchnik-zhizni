/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __WEB_REACT_BUILD_STAMP__: string;

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** Алиас для сборок, где задали только этот ключ вместо VITE_API_BASE_URL */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
