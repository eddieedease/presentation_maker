import { VideoProvider } from '../core/models/deck.model';

export interface ParsedVideo {
  provider: VideoProvider;
  id: string;
}

/**
 * Pulls the provider and video id out of a pasted URL.
 *
 * Only YouTube and Vimeo are recognised. Storing the id rather than the raw URL
 * means the player builds the embed itself, so a deck can never carry an
 * arbitrary third-party frame — which is also why nothing is uploaded here.
 */
export function parseVideoUrl(input: string): ParsedVideo | null {
  const value = input.trim();
  if (value === '') {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value.startsWith('http') ? value : `https://${value}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const segments = url.pathname.split('/').filter((segment) => segment !== '');

  if (host === 'youtu.be') {
    return youtube(segments[0]);
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (segments[0] === 'embed' || segments[0] === 'shorts' || segments[0] === 'live') {
      return youtube(segments[1]);
    }

    return youtube(url.searchParams.get('v') ?? undefined);
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const candidate = segments.find((segment) => /^\d{5,15}$/.test(segment));
    return candidate === undefined ? null : { provider: 'vimeo', id: candidate };
  }

  return null;
}

function youtube(id: string | undefined): ParsedVideo | null {
  return id !== undefined && /^[A-Za-z0-9_-]{5,20}$/.test(id) ? { provider: 'youtube', id } : null;
}
