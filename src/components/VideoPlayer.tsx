import { Play } from './Icons';

/**
 * Embed de Loom sin la barra superior (título, vistas, autor y botones de compartir).
 * Acepta links /share/ o /embed/ y conserva el tiempo de inicio (?t=).
 */
function loomEmbed(u: URL) {
  const id = u.pathname.split('/')[2];
  const params = new URLSearchParams({
    hideEmbedTopBar: 'true',
    hide_title: 'true',
    hide_owner: 'true',
    hide_share: 'true',
  });
  const t = u.searchParams.get('t');
  if (t) params.set('t', t);
  return `https://www.loom.com/embed/${id}?${params.toString()}`;
}

function toEmbed(url: string): { kind: 'iframe' | 'video'; src: string } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' && u.searchParams.get('v')) {
      return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${u.searchParams.get('v')}?rel=0` };
    }
    if (host === 'youtu.be') {
      return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed${u.pathname}?rel=0` };
    }
    if (host === 'vimeo.com') {
      return { kind: 'iframe', src: `https://player.vimeo.com/video${u.pathname}` };
    }
    if (host === 'loom.com' && /^\/(share|embed)\//.test(u.pathname)) {
      return { kind: 'iframe', src: loomEmbed(u) };
    }
    if (/\.(mp4|webm|m3u8)$/i.test(u.pathname)) return { kind: 'video', src: url };
    return { kind: 'iframe', src: url };
  } catch {
    return null;
  }
}

export default function VideoPlayer({ url, title }: { url?: string; title: string }) {
  const embed = url ? toEmbed(url) : null;
  return (
    <div className="player">
      {embed?.kind === 'iframe' && (
        <iframe src={embed.src} title={title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
      )}
      {embed?.kind === 'video' && <video src={embed.src} controls playsInline />}
      {!embed && (
        <div className="player__empty">
          <span className="player__icon"><Play /></span>
          <span className="eyebrow">Video próximamente</span>
        </div>
      )}
    </div>
  );
}
