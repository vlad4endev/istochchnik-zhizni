export function getEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      const id = u.searchParams.get('v') || u.pathname.split('/').pop();
      if (!id) return null;
      return `https://www.youtube.com/embed/${id}?autoplay=1`;
    }
    const ruVideoMatch = u.pathname.match(/\/video\/([a-zA-Z0-9]+)/);
    if (ruVideoMatch) return `https://rutube.ru/play/embed/${ruVideoMatch[1]}`;
    const ruStreamMatch = u.pathname.match(/\/stream\/(\d+)/);
    if (ruStreamMatch) return `https://rutube.ru/play/embed/${ruStreamMatch[1]}?isStream=1`;
    if (u.hostname.includes('vk.com') && u.pathname.includes('/video')) {
      return url.replace('vk.com/video', 'vk.com/video_ext.php?oid=');
    }
    return url;
  } catch {
    return null;
  }
}

export function detectPlatform(url: string | null | undefined): 'youtube' | 'rutube' | 'vk' | 'other' {
  const raw = String(url ?? '').trim().toLowerCase();
  if (!raw) return 'other';
  if (raw.includes('youtube.com') || raw.includes('youtu.be')) return 'youtube';
  if (raw.includes('rutube.ru')) return 'rutube';
  if (raw.includes('vk.com')) return 'vk';
  return 'other';
}
