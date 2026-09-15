import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useTheme, type ThemeColors } from '../../theme';

function normalizeAbc(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^X:/m.test(trimmed)) return trimmed;
  return `X:1\n${trimmed}`;
}

function buildScoreHtml(abc: string, compact: boolean): string {
  const scale = compact ? 1 : 1.1;
  const staffwidth = compact ? 320 : 360;
  // JSON.stringify keeps ABC safe inside the script.
  const abcJson = JSON.stringify(abc);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <script src="https://cdn.jsdelivr.net/npm/abcjs@6.6.3/dist/abcjs-basic-min.js"></script>
  <style>
    html, body { margin: 0; padding: 0; background: #fff; }
    body { padding: 4px 2px 8px; }
    #score { width: 100%; overflow-x: auto; }
    #score svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }
    #err { color: #b45309; font: 12px/1.4 system-ui, sans-serif; padding: 8px; text-align: center; }
  </style>
</head>
<body>
  <div id="score"></div>
  <div id="err" hidden></div>
  <script>
    (function () {
      function report(payload) {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
      }
      function measure() {
        var h = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
          80
        );
        report({ type: 'height', height: h });
      }
      try {
        var abc = ${abcJson};
        var visual = ABCJS.renderAbc('score', abc, {
          responsive: 'resize',
          scale: ${scale},
          staffwidth: ${staffwidth},
          paddingleft: 0,
          paddingright: 0,
          add_classes: true
        });
        var warnings = visual && visual[0] && visual[0].warnings;
        if (warnings && warnings.length) {
          var err = document.getElementById('err');
          err.hidden = false;
          err.textContent = warnings.slice(0, 2).join(' · ');
        }
        setTimeout(measure, 50);
        setTimeout(measure, 250);
      } catch (e) {
        var msg = e && e.message ? e.message : 'Ошибка отображения нот';
        var box = document.getElementById('err');
        box.hidden = false;
        box.textContent = msg;
        report({ type: 'error', message: msg });
        measure();
      }
    })();
  </script>
</body>
</html>`;
}

type Props = {
  abcNotation: string;
  compact?: boolean;
};

export function AbcScoreView({ abcNotation, compact = false }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [height, setHeight] = useState(compact ? 160 : 220);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const normalized = useMemo(() => normalizeAbc(abcNotation), [abcNotation]);
  const html = useMemo(
    () => (normalized ? buildScoreHtml(normalized, compact) : ''),
    [normalized, compact],
  );

  if (!normalized) return null;

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        height?: number;
        message?: string;
      };
      if (data.type === 'height' && typeof data.height === 'number' && data.height > 40) {
        setHeight(Math.min(Math.ceil(data.height) + 8, compact ? 420 : 720));
        setLoading(false);
      }
      if (data.type === 'error' && data.message) {
        setError(data.message);
        setLoading(false);
      }
    } catch {
      // ignore malformed messages
    }
  };

  return (
    <View style={[styles.wrap, { minHeight: height }]}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Рендер партитуры…</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.warn}>{error}</Text> : null}
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={[styles.web, { height }]}
        scrollEnabled={false}
        onMessage={onMessage}
        onLoadEnd={() => {
          // height message usually clears loading; fallback timeout
          setTimeout(() => setLoading(false), 1200);
        }}
        onError={() => {
          setError('Не удалось загрузить рендер нот (нужен интернет для abcjs)');
          setLoading(false);
        }}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
      />
    </View>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  const border = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.1)';
  return StyleSheet.create({
    wrap: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: '#ffffff',
      overflow: 'hidden',
      position: 'relative',
    },
    web: {
      backgroundColor: '#ffffff',
      width: '100%',
    },
    loading: {
      position: 'absolute',
      zIndex: 2,
      top: 0,
      left: 0,
      right: 0,
      paddingVertical: 24,
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(255,255,255,0.92)',
    },
    loadingText: {
      fontSize: 12,
      color: colors.textMuted,
    },
    warn: {
      fontSize: 12,
      color: '#b45309',
      paddingHorizontal: 10,
      paddingTop: 8,
      textAlign: 'center',
    },
  });
}
