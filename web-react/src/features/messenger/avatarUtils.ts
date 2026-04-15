const AVATAR_COLORS = [
  '#C0392B',
  '#E67E22',
  '#D35400',
  '#F1C40F',
  '#27AE60',
  '#16A085',
  '#2980B9',
  '#8E44AD',
  '#2C3E50',
  '#7F8C8D',
  '#7D3640',
  '#5C2830',
];

export function getAvatarColor(seed: string): string {
  const value = String(seed || '');
  if (!value) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getAvatarInitial(text: string | null | undefined, fallback = '?'): string {
  const normalized = String(text ?? '').trim();
  return (normalized.charAt(0) || fallback).toUpperCase();
}

