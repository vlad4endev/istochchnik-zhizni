const FCM_MAX_DATA_BYTES = 3500;

/** Лимит FCM — 4096 байт на весь payload: длинное сообщение иначе отклоняется целиком (INVALID_ARGUMENT). */
export function fitFcmPayload(
  title: string,
  body: string,
  data: Record<string, string>,
): { title: string; body: string; data: Record<string, string> } {
  const size = (t: string, b: string, d: Record<string, string>): number =>
    Buffer.byteLength(JSON.stringify({ t, b, d, n: { t, b } }), 'utf8');
  let t = title;
  let b = body;
  const d: Record<string, string> = { ...data };
  if (size(t, b, d) <= FCM_MAX_DATA_BYTES) return { title: t, body: b, data: d };
  for (const key of ['actions', 'image', 'icon', 'badge']) delete d[key];
  while (size(t, b, d) > FCM_MAX_DATA_BYTES && b.length > 120) {
    // Усекаем, пока не уложимся; нижняя граница 120 символов гарантирует выход из цикла.
    b = `${b.slice(0, Math.max(119, Math.floor(b.length * 0.7)))}…`;
  }
  if (size(t, b, d) > FCM_MAX_DATA_BYTES && t.length > 100) t = `${t.slice(0, 100)}…`;
  d.title = t;
  d.body = b;
  return { title: t, body: b, data: d };
}
