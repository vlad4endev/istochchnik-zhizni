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

export function parseBroadcastInputToEmbed(input: string): string | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const iframeSrc = raw.match(/<iframe[^>]*\s+src=["']([^"']+)["']/i)?.[1]?.trim() ?? null;
  const candidate = iframeSrc || raw;
  const embed = getEmbedUrl(candidate);
  if (embed) return embed;
  try {
    new URL(candidate);
    return candidate;
  } catch {
    return null;
  }
}

/**
 * Returns a player-ready embed URL with branding/attribution params applied.
 * Adds controls=0, branding=0, logo=0 for RuTube (hides attribution bar).
 * Accepts raw user input (link, iframe code, or already-embed URL).
 */
export function toEmbedUrlForPlayer(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();

  // Extract src from iframe code if needed
  const iframeSrc = raw.match(/src=["']([^"']+)["']/)?.[1];
  const candidate = iframeSrc ?? raw;

  try {
    const u = new URL(candidate);

    // Already an embed URL — just add/overwrite visual params
    if (u.pathname.includes('/play/embed/') && u.hostname.includes('rutube.ru')) {
      u.searchParams.set('autoplay', '0');
      u.searchParams.set('controls', '0');
      u.searchParams.set('branding', '0');
      u.searchParams.set('logo', '0');
      u.searchParams.set('rel', '0');
      return u.toString();
    }

    // Regular RuTube video link
    const ruVideoMatch = u.pathname.match(/\/video\/([a-zA-Z0-9_-]+)/);
    if (ruVideoMatch) {
      return `https://rutube.ru/play/embed/${ruVideoMatch[1]}?autoplay=0&controls=0&branding=0&logo=0&rel=0`;
    }

    // RuTube stream link
    const ruStreamMatch = u.pathname.match(/\/stream\/(\d+)/);
    if (ruStreamMatch) {
      return `https://rutube.ru/play/embed/${ruStreamMatch[1]}?isStream=1&autoplay=0&controls=0&branding=0&logo=0&rel=0`;
    }

    // YouTube
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      const id = u.searchParams.get('v') || u.pathname.split('/').filter(Boolean).pop();
      if (!id) return null;
      // Already embed
      if (u.pathname.includes('/embed/')) {
        u.searchParams.set('autoplay', '0');
        u.searchParams.set('controls', '1');
        u.searchParams.set('rel', '0');
        u.searchParams.set('modestbranding', '1');
        return u.toString();
      }
      return `https://www.youtube.com/embed/${id}?autoplay=0&controls=1&rel=0&modestbranding=1`;
    }

    // VK
    if (u.hostname.includes('vk.com') && u.pathname.includes('/video')) {
      return candidate.replace('vk.com/video', 'vk.com/video_ext.php?oid=');
    }

    return candidate;
  } catch {
    return null;
  }
}

/** Human-readable platform label for display in the player overlay badge. */
export function detectPlatformLabel(url: string | null | undefined): string {
  const p = detectPlatform(url);
  if (p === 'youtube') return 'YouTube';
  if (p === 'rutube') return 'RuTube';
  if (p === 'vk') return 'VK Видео';
  return 'Видео';
}
