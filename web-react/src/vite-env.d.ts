/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __WEB_REACT_BUILD_STAMP__: string;

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** Алиас для сборок, где задали только этот ключ вместо VITE_API_BASE_URL */
  readonly VITE_API_URL?: string;
  /**
   * `full` — монолит (по умолчанию). `main` — только просмотр песенника. `studio` — только Студия.
   * @see docker/Dockerfile.web.main
   */
  readonly VITE_APP_VARIANT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '@tombatossals/react-chords/lib/Chord' {
  import type { FC } from 'react';

  const ChordDiagram: FC<{
    chord: {
      frets: number[];
      fingers: number[];
      baseFret: number;
      barres: number[];
      capo?: boolean;
    };
    instrument: {
      strings: number;
      fretsOnChord: number;
      name: string;
      tunings: { standard: string[] };
    };
    lite?: boolean;
  }>;
  export default ChordDiagram;
}
