import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Star, Play, Plus, Monitor } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AnimeCard } from '@/types/anime';

interface AnimeInfoPopupProps {
  anime: AnimeCard;
  anchorEl: HTMLElement | null;
  visible: boolean;
}

function getPopupPosition(anchor: HTMLElement): { top: number; left: number; side: 'left' | 'right' } {
  const rect = anchor.getBoundingClientRect();
  const popupWidth = 300;
  const scrollY = window.scrollY || document.documentElement.scrollTop;
  const scrollX = window.scrollX || document.documentElement.scrollLeft;
  const viewportWidth = window.innerWidth;

  // Decide side: show on right if space, else left
  const spaceRight = viewportWidth - rect.right;
  const spaceLeft = rect.left;
  const side = spaceRight >= popupWidth + 12 ? 'right' : 'left';

  const top = rect.top + scrollY;
  const left =
    side === 'right'
      ? rect.right + scrollX + 10
      : rect.left + scrollX - popupWidth - 10;

  return { top, left, side };
}

export function AnimeInfoPopup({ anime, anchorEl, visible }: AnimeInfoPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (visible && anchorEl) {
      const { top, left } = getPopupPosition(anchorEl);
      setPos({ top, left });
    }
  }, [visible, anchorEl]);

  if (!visible || !pos) return null;

  const animeId = (anime as any).id || (anime as any).animeId || '';
  const routeId = (anime as any).routeAnimeId || animeId;
  const watchPath = routeId ? `/watch/${routeId}` : '#';
  const animePagePath = routeId ? `/anime/${routeId}` : '#';

  const genres: string[] = (anime as any).genres || [];
  const studios: string[] = (anime as any).studios || [];
  const episodes = (anime as any).episodes || (anime as any).totalEpisodes;
  const status = (anime as any).status || '';
  const aired = (anime as any).aired || (anime as any).startDate || '';
  const score = (anime as any).score || (anime as any).rating;
  const japaneseTitle = (anime as any).japaneseTitle || (anime as any).japanese || '';
  const sub = (anime as any).sub;
  const dub = (anime as any).dub;
  const description = (anime as any).description || (anime as any).synopsis || '';
  const type = (anime as any).type || (anime as any).format || 'TV Series';
  const isHD = true; // Most streams are HD
  const coverImage = (anime as any).image || (anime as any).poster || (anime as any).cover || '';
  const displayTitle = (anime as any).title || (anime as any).name || '';

  const popup = (
    <div
      ref={popupRef}
      className="fixed z-[9999] w-[300px] pointer-events-none"
      style={{ top: pos.top, left: pos.left }}
    >
      <div
        className={cn(
          'bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl',
          'transition-all duration-200 pointer-events-auto',
          visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-95'
        )}
      >
        {/* Cover image small strip */}
        {coverImage && (
          <div className="relative w-full h-28 overflow-hidden rounded-t-xl">
            <img
              src={coverImage}
              alt={displayTitle}
              className="w-full h-full object-cover object-top"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#1a1a2e]/90" />
          </div>
        )}

        <div className="p-4 space-y-3">
          {/* Title + badges */}
          <div>
            <h3 className="font-bold text-white text-base leading-tight line-clamp-2">{displayTitle}</h3>
          </div>

          {/* Score + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {score && (
              <span className="flex items-center gap-1 text-yellow-400 font-bold text-sm">
                <Star className="w-3.5 h-3.5 fill-yellow-400" />
                {typeof score === 'number' ? score.toFixed(1) : score}
              </span>
            )}
            {isHD && (
              <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">HD</span>
            )}
            {type && (
              <span className="bg-white/10 text-white/80 text-[10px] px-1.5 py-0.5 rounded">{type}</span>
            )}
            {status && status !== 'Unknown' && (
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded font-medium',
                status.toLowerCase().includes('finish') || status.toLowerCase().includes('complete')
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              )}>
                {status}
              </span>
            )}
          </div>

          {/* Description */}
          {description && (
            <p className="text-muted-foreground text-xs leading-relaxed line-clamp-3">{description}</p>
          )}

          {/* Meta rows */}
          <div className="space-y-1.5 text-xs">
            {japaneseTitle && (
              <div className="flex gap-2">
                <span className="text-white/50 w-20 shrink-0 font-medium">Japanese:</span>
                <span className="text-white/80 truncate">{japaneseTitle}</span>
              </div>
            )}
            {aired && (
              <div className="flex gap-2">
                <span className="text-white/50 w-20 shrink-0 font-medium">Aired:</span>
                <span className="text-white/80">{aired}</span>
              </div>
            )}
            {episodes && (
              <div className="flex gap-2">
                <span className="text-white/50 w-20 shrink-0 font-medium">Episodes:</span>
                <span className="text-white/80">{episodes}</span>
              </div>
            )}
            {genres.length > 0 && (
              <div className="flex gap-2">
                <span className="text-white/50 w-20 shrink-0 font-medium">Genres:</span>
                <span className="text-primary/90 leading-relaxed">{genres.slice(0, 4).join(', ')}</span>
              </div>
            )}
            {(sub || dub) && (
              <div className="flex gap-2">
                <span className="text-white/50 w-20 shrink-0 font-medium">Audio:</span>
                <div className="flex gap-1.5 flex-wrap">
                  {sub && (
                    <span className="bg-white/10 text-white/80 px-1.5 py-0.5 rounded text-[10px]">
                      Sub {typeof sub === 'number' ? `(${sub})` : ''}
                    </span>
                  )}
                  {dub && (
                    <span className="bg-white/10 text-white/80 px-1.5 py-0.5 rounded text-[10px]">
                      Dub {typeof dub === 'number' ? `(${dub})` : ''}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button asChild size="sm" className="flex-1 bg-primary hover:bg-primary/80 text-white h-8 text-xs">
              <Link to={watchPath}>
                <Play className="w-3 h-3 mr-1 fill-white" /> Watch Now
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="h-8 w-8 p-0 border-white/10 hover:border-white/30">
              <Link to={animePagePath}>
                <Monitor className="w-3.5 h-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(popup, document.body);
}
