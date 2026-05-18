"use client";

import { usePathname } from "next/navigation";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ButtonLink, cx } from "@/components/room9-ui";
import {
  VAULT_FAVORITES_EVENT,
  readVaultSavedTrackIds,
  recordVaultListeningHistory,
  toggleVaultSavedTrackId
} from "@/lib/soundVault";
import { getSupabase, hasSupabaseConfig, isMissingAuthSession, logSupabaseError } from "@/lib/supabase";
import { trackUserInteraction } from "@/lib/interactions";
import { clampTrackTimestamp } from "@/lib/trackMoments";

export type AudioPlayerTrack = {
  id: string;
  title: string;
  artist: string;
  src: string;
  djId?: string | null;
  coverUrl?: string | null;
  description?: string | null;
  durationSeconds?: number | null;
};

type AudioPlayerContextValue = {
  currentTrack: AudioPlayerTrack | null;
  currentIndex: number;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  repeatOne: boolean;
  selectedTimestamp: number | null;
  queue: AudioPlayerTrack[];
  addToQueue: (track: AudioPlayerTrack) => void;
  clearQueue: () => void;
  playTrack: (track: AudioPlayerTrack) => void;
  playQueue: (tracks: AudioPlayerTrack[], startIndex?: number) => void;
  playQueueIndex: (index: number) => void;
  playPrevious: () => void;
  playNext: () => void;
  removeFromQueue: (index: number) => void;
  seekTo: (timeInSeconds: number) => void;
  setSelectedTimestamp: (timeInSeconds: number | null) => void;
  togglePlayback: () => void;
  toggleRepeatOne: () => void;
};

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState<AudioPlayerTrack | null>(null);
  const [queue, setQueue] = useState<AudioPlayerTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedTimestamp, setSelectedTimestamp] = useState<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.86);
  const [favoriteTrackIds, setFavoriteTrackIds] = useState<string[]>([]);
  const [repeatOne, setRepeatOne] = useState(false);
  const [musicScope, setMusicScope] = useState<string | null>(null);

  const startAudio = useCallback(async (trackOverride?: AudioPlayerTrack | null) => {
    const audio = audioRef.current;
    const track = trackOverride ?? currentTrack;
    if (!audio || !track) {
      return;
    }

    try {
      if (audio.getAttribute("src") !== track.src) {
        audio.src = track.src;
        audio.load();
      }

      const audioDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
      if (audioDuration > 0 && audio.currentTime >= audioDuration - 0.15) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }

      await audio.play();
      setIsPlaying(true);
    } catch (error) {
      console.error("[ROOM_9] Audio playback failed", error);
      setIsPlaying(false);
    }
  }, [currentTrack]);

  useEffect(() => {
    if (!currentTrack || !audioRef.current) {
      return;
    }

    audioRef.current.load();
    startAudio(currentTrack);
  }, [currentTrack, startAudio]);

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      readVaultSavedTrackIds().then(setFavoriteTrackIds);
      return;
    }

    const supabase = getSupabase();
    supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (error && !isMissingAuthSession(error)) {
          logSupabaseError("Audio player user scope load failed", error);
        }

        const scope = data.user?.id ?? null;
        setMusicScope(scope);
        readVaultSavedTrackIds(scope).then(setFavoriteTrackIds);
      })
      .catch((caughtError) => {
        logSupabaseError("Audio player user scope unexpected failure", caughtError);
        readVaultSavedTrackIds().then(setFavoriteTrackIds);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const scope = session?.user?.id ?? null;
      setMusicScope(scope);
      readVaultSavedTrackIds(scope).then(setFavoriteTrackIds);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    function handleFavoriteChange(event: Event) {
      const detail = (event as CustomEvent<{ trackIds?: string[] }>).detail;
      if (Array.isArray(detail?.trackIds)) {
        setFavoriteTrackIds(detail.trackIds);
      }
    }

    window.addEventListener(VAULT_FAVORITES_EVENT, handleFavoriteChange);
    return () => window.removeEventListener(VAULT_FAVORITES_EVENT, handleFavoriteChange);
  }, []);

  useEffect(() => {
    if (currentTrack) {
      recordVaultListeningHistory(currentTrack.id, musicScope);
    }
  }, [currentTrack, musicScope]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const value = useMemo<AudioPlayerContextValue>(
    () => ({
      currentTrack,
      currentIndex,
      currentTime,
      duration,
      isPlaying,
      repeatOne,
      selectedTimestamp,
      queue,
      addToQueue(track) {
        if (!queue.some((item) => item.id === track.id)) {
          trackUserInteraction({
            djId: track.djId,
            interactionType: "add_to_queue",
            metadata: { queue_size_before: queue.length },
            scope: musicScope,
            workId: track.id
          });
        }

        setQueue((current) => {
          if (current.some((item) => item.id === track.id)) {
            return current;
          }

          return [...current, track];
        });

        if (!currentTrack) {
          setCurrentIndex(0);
          setCurrentTrack(track);
        }
      },
      clearQueue() {
        setQueue([]);
        setCurrentIndex(0);
        setCurrentTrack(null);
        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(false);
        setSelectedTimestamp(null);
      },
      playTrack(track) {
        setQueue([track]);
        setCurrentIndex(0);
        setSelectedTimestamp(null);
        if (currentTrack?.id === track.id) {
          setCurrentTrack(track);
          startAudio(track);
          return;
        }
        setCurrentTrack(track);
      },
      playQueue(tracks, startIndex = 0) {
        if (tracks.length === 0) {
          return;
        }

        const safeIndex = Math.min(Math.max(startIndex, 0), tracks.length - 1);
        const nextTrack = tracks[safeIndex];
        setQueue(tracks);
        setCurrentIndex(safeIndex);
        setSelectedTimestamp(null);
        if (currentTrack?.id === nextTrack.id) {
          setCurrentTrack(nextTrack);
          startAudio(nextTrack);
          return;
        }
        setCurrentTrack(nextTrack);
      },
      playQueueIndex(index) {
        if (queue.length === 0) {
          return;
        }

        const safeIndex = Math.min(Math.max(index, 0), queue.length - 1);
        if (currentTrack?.id === queue[safeIndex].id) {
          setCurrentTrack(queue[safeIndex]);
          startAudio(queue[safeIndex]);
          return;
        }

        setCurrentIndex(safeIndex);
        setSelectedTimestamp(null);
        setCurrentTrack(queue[safeIndex]);
      },
      playPrevious() {
        if (queue.length === 0) {
          return;
        }

        const nextIndex = currentIndex <= 0 ? queue.length - 1 : currentIndex - 1;
        setCurrentIndex(nextIndex);
        setSelectedTimestamp(null);
        setCurrentTrack(queue[nextIndex]);
      },
      playNext() {
        if (queue.length === 0) {
          return;
        }

        const nextIndex = currentIndex >= queue.length - 1 ? 0 : currentIndex + 1;
        setCurrentIndex(nextIndex);
        setSelectedTimestamp(null);
        setCurrentTrack(queue[nextIndex]);
      },
      removeFromQueue(index) {
        const removedTrack = queue[index];
        if (removedTrack) {
          trackUserInteraction({
            djId: removedTrack.djId,
            interactionType: "remove_from_queue",
            metadata: { queue_index: index },
            scope: musicScope,
            workId: removedTrack.id
          });
        }

        setQueue((current) => {
          if (index < 0 || index >= current.length) {
            return current;
          }

          const next = current.filter((_item, itemIndex) => itemIndex !== index);
          if (next.length === 0) {
            setCurrentIndex(0);
            setCurrentTrack(null);
            setCurrentTime(0);
            setDuration(0);
            setIsPlaying(false);
            setSelectedTimestamp(null);
            return [];
          }

          if (index === currentIndex) {
            const nextIndex = Math.min(index, next.length - 1);
            setCurrentIndex(nextIndex);
            setSelectedTimestamp(null);
            setCurrentTrack(next[nextIndex]);
          } else if (index < currentIndex) {
            setCurrentIndex(currentIndex - 1);
          }

          return next;
        });
      },
      seekTo(timeInSeconds) {
        const safeTime = Math.max(0, Math.min(timeInSeconds, duration || timeInSeconds));
        setCurrentTime(safeTime);
        if (audioRef.current) {
          audioRef.current.currentTime = safeTime;
        }
      },
      setSelectedTimestamp(timeInSeconds) {
        setSelectedTimestamp(timeInSeconds);
      },
      togglePlayback() {
        if (!audioRef.current || !currentTrack) {
          return;
        }

        if (!isPlaying || audioRef.current.paused) {
          startAudio(currentTrack);
        } else {
          audioRef.current.pause();
          trackUserInteraction({
            djId: currentTrack.djId,
            interactionType: "pause",
            metadata: { current_time: Math.round(audioRef.current.currentTime || currentTime) },
            scope: musicScope,
            timestampSeconds: audioRef.current.currentTime || currentTime,
            workId: currentTrack.id
          });
          setIsPlaying(false);
        }
      },
      toggleRepeatOne() {
        setRepeatOne((current) => !current);
      }
    }),
    [currentIndex, currentTime, currentTrack, duration, isPlaying, musicScope, queue, repeatOne, selectedTimestamp, startAudio]
  );

  async function toggleFavoriteTrack() {
    if (!currentTrack) {
      return;
    }

    setFavoriteTrackIds(await toggleVaultSavedTrackId(currentTrack.id, musicScope));
  }

  const hasQueueControls = queue.length > 1;
  const isFavorite = currentTrack ? favoriteTrackIds.includes(currentTrack.id) : false;
  const safeSelectedTimestamp =
    selectedTimestamp !== null ? clampTrackTimestamp(selectedTimestamp, duration || null) : null;
  const bookingTime = safeSelectedTimestamp ?? currentTime;
  const bookingMomentHref = currentTrack?.djId
    ? `/booking/${currentTrack.djId}?workId=${encodeURIComponent(currentTrack.id)}&t=${Math.round(bookingTime)}`
    : "";
  const hidePlayer =
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/register");

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
      {currentTrack && !hidePlayer ? (
        <GlobalPlayer
          bookingHref={bookingMomentHref}
          bookingTime={bookingTime}
          currentTime={currentTime}
          duration={duration}
          hasQueueControls={hasQueueControls}
          isFavorite={isFavorite}
          isPlaying={isPlaying}
          repeatOne={repeatOne}
          onNext={value.playNext}
          onPrevious={value.playPrevious}
          onProgressChange={(nextTime) => {
            setCurrentTime(nextTime);
            if (audioRef.current) {
              audioRef.current.currentTime = nextTime;
            }
          }}
          onFavorite={toggleFavoriteTrack}
          onSelectQueueIndex={value.playQueueIndex}
          onRepeatToggle={() => setRepeatOne((current) => !current)}
          onClearQueue={value.clearQueue}
          onRemoveQueueIndex={value.removeFromQueue}
          onTogglePlayback={value.togglePlayback}
          onVolumeChange={setVolume}
          queueLength={queue.length}
          queue={queue}
          queueIndex={currentIndex}
          selectedTimestamp={safeSelectedTimestamp}
          track={currentTrack}
          volume={volume}
        >
            <audio
              ref={audioRef}
              src={currentTrack.src}
              onEnded={() => {
                trackUserInteraction({
                  djId: currentTrack.djId,
                  interactionType: "complete",
                  metadata: { repeat_one: repeatOne, queue_length: queue.length },
                  scope: musicScope,
                  timestampSeconds: duration || currentTime,
                  workId: currentTrack.id
                });
                if (repeatOne && audioRef.current) {
                  audioRef.current.currentTime = 0;
                  audioRef.current
                    .play()
                    .then(() => setIsPlaying(true))
                    .catch(() => setIsPlaying(false));
                } else if (hasQueueControls) {
                  value.playNext();
                } else {
                  setIsPlaying(false);
                }
              }}
              onLoadedMetadata={(event) =>
                setDuration(
                  Number.isFinite(event.currentTarget.duration)
                    ? event.currentTarget.duration
                    : currentTrack?.durationSeconds ?? 0
                )
              }
              onPause={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            >
              <track kind="captions" />
            </audio>
        </GlobalPlayer>
      ) : null}
    </AudioPlayerContext.Provider>
  );
}

export function GlobalPlayer({
  bookingHref,
  bookingTime,
  children,
  currentTime,
  duration,
  hasQueueControls,
  isFavorite,
  isPlaying,
  repeatOne,
  onNext,
  onPrevious,
  onFavorite,
  onProgressChange,
  onRepeatToggle,
  onClearQueue,
  onRemoveQueueIndex,
  onSelectQueueIndex,
  onTogglePlayback,
  onVolumeChange,
  queueLength,
  queue,
  queueIndex,
  selectedTimestamp,
  track,
  volume
}: {
  bookingHref: string;
  bookingTime: number;
  children?: ReactNode;
  currentTime: number;
  duration: number;
  hasQueueControls: boolean;
  isFavorite: boolean;
  isPlaying: boolean;
  repeatOne: boolean;
  onFavorite: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onProgressChange: (value: number) => void;
  onRepeatToggle: () => void;
  onClearQueue: () => void;
  onRemoveQueueIndex: (index: number) => void;
  onSelectQueueIndex: (index: number) => void;
  onTogglePlayback: () => void;
  onVolumeChange: (value: number) => void;
  queueLength: number;
  queue: AudioPlayerTrack[];
  queueIndex: number;
  selectedTimestamp: number | null;
  track: AudioPlayerTrack;
  volume: number;
}) {
  const hasSelectedMoment = selectedTimestamp !== null;
  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const [queueOpen, setQueueOpen] = useState(false);
  const upcomingQueue = queue
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => index !== queueIndex)
    .slice(0, 6);

  return (
    <aside className="fixed inset-x-0 bottom-0 z-50 border-t border-roomBorder bg-[#050505] shadow-[0_-10px_34px_rgba(0,0,0,0.72)]">
      <div className="mx-auto grid min-h-[76px] max-w-[1920px] gap-3 px-4 py-2 md:px-6 lg:grid-cols-[340px_minmax(360px,1fr)_420px] lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="grid h-12 w-12 shrink-0 place-items-center border border-roomBorder bg-inkPanel bg-cover bg-center"
            style={{ backgroundImage: `url(${track.coverUrl || "/room9-track-placeholder.svg"})` }}
          />
          <div className="min-w-0">
            <p className={cx("font-mono text-[10px] font-black uppercase", hasSelectedMoment ? "text-acidGreen" : "text-mutedText")}>
              {hasSelectedMoment ? `Selected moment ${formatAudioTime(selectedTimestamp)}` : "Now playing"}
            </p>
            <h2 className="mt-0.5 truncate font-display text-[15px] uppercase leading-none text-paperWhite">{track.title}</h2>
            <p className="mt-1 truncate font-mono text-[10px] uppercase text-mutedText">
              {[track.artist, track.description].filter(Boolean).join(" / ")}
            </p>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-center gap-1">
            <PlayerIconButton disabled={!hasQueueControls} label="Previous track" onClick={onPrevious}>
              <PreviousIcon />
            </PlayerIconButton>
            <PlayerIconButton tone="play" label={isPlaying ? "Pause track" : "Play track"} onClick={onTogglePlayback}>
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </PlayerIconButton>
            <PlayerIconButton disabled={!hasQueueControls} label="Next track" onClick={onNext}>
              <NextIcon />
            </PlayerIconButton>
          </div>
          <div className="mt-2 grid grid-cols-[42px_1fr_42px] items-center gap-3 font-mono text-[10px] uppercase text-mutedText">
            <span>{formatAudioTime(currentTime)}</span>
            <div className="relative h-5">
              <MiniPlayerProgress progressRatio={progressRatio} selectedTimestamp={selectedTimestamp} duration={duration} />
              <input
                aria-label="Track progress"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                max={duration || 0}
                min={0}
                type="range"
                value={duration ? Math.min(currentTime, duration) : 0}
                onChange={(event) => onProgressChange(Number(event.target.value))}
              />
            </div>
            <span>{formatAudioTime(duration)}</span>
          </div>
        </div>

        <div className="relative flex items-center justify-end gap-1">
          <button
            aria-label="Open queue"
            aria-expanded={queueOpen}
            className="inline-flex min-h-9 items-center gap-2 border border-roomBorder px-2 font-mono text-[10px] uppercase text-mutedText transition hover:border-paperWhite hover:text-paperWhite"
            onClick={() => setQueueOpen((current) => !current)}
            type="button"
          >
            <QueueIcon />
            <span>Queue</span>
            <span className="text-paperWhite">{queueLength}</span>
          </button>
          {queueOpen ? (
            <div className="absolute bottom-[calc(100%+10px)] right-0 z-50 w-[360px] border border-strongBorder bg-black p-3 shadow-[0_18px_60px_rgba(0,0,0,0.72)]">
              <div className="flex items-center justify-between border-b border-roomBorder pb-2">
                <p className="font-mono text-[10px] font-black uppercase tracking-[0.24em] text-paperWhite">Queue</p>
                <div className="flex items-center gap-3">
                  <button
                    className="font-mono text-[10px] uppercase text-mutedText hover:text-paperWhite"
                    disabled={queueLength === 0}
                    onClick={onClearQueue}
                    type="button"
                  >
                    Clear
                  </button>
                  <button className="font-mono text-[10px] uppercase text-mutedText hover:text-paperWhite" onClick={() => setQueueOpen(false)} type="button">
                    Close
                  </button>
                </div>
              </div>
              <button
                className="mt-2 grid w-full grid-cols-[32px_1fr_auto] items-center gap-2 border border-acidGreen bg-[#111a05] px-2 py-2 text-left"
                onClick={() => onSelectQueueIndex(queueIndex)}
                type="button"
              >
                <span className="grid h-8 w-8 place-items-center bg-acidGreen text-black">
                  {isPlaying ? <PauseIcon /> : <PlayIcon />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-display text-sm uppercase text-acidGreen">{track.title}</span>
                  <span className="block truncate font-mono text-[10px] uppercase text-mutedText">{track.artist}</span>
                </span>
                <span className="room-tiny text-acidGreen">Now</span>
              </button>
              <div className="mt-2 space-y-1">
                {upcomingQueue.length > 0 ? (
                  upcomingQueue.map(({ item, index }) => (
                    <div
                      className="grid w-full grid-cols-[32px_1fr_auto_auto] items-center gap-2 border border-roomBorder px-2 py-2 text-left transition hover:border-paperWhite hover:bg-panelBlack"
                      key={`${item.id}-${index}`}
                    >
                      <button
                        aria-label={`Play ${item.title}`}
                        className="grid h-8 w-8 place-items-center border border-roomBorder text-paperWhite hover:border-paperWhite"
                        onClick={() => {
                          onSelectQueueIndex(index);
                          setQueueOpen(false);
                        }}
                        type="button"
                      >
                        <PlayIcon />
                      </button>
                      <span className="min-w-0">
                        <span className="block truncate font-display text-sm uppercase text-paperWhite">{item.title}</span>
                        <span className="block truncate font-mono text-[10px] uppercase text-mutedText">{item.artist}</span>
                      </span>
                      <span className="font-mono text-[10px] uppercase text-mutedText">Next</span>
                      <button
                        aria-label={`Remove ${item.title} from queue`}
                        className="grid h-8 w-8 place-items-center border border-transparent text-mutedText hover:border-roomBorder hover:text-paperWhite"
                        onClick={() => onRemoveQueueIndex(index)}
                        type="button"
                      >
                        <XIcon />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="border border-roomBorder px-3 py-4 text-sm text-mutedText">
                    Queue is empty. Add tracks from Explore, Track Page, or Artist Dossier.
                  </p>
                )}
              </div>
            </div>
          ) : null}
          {bookingHref ? (
            <ButtonLink className="whitespace-nowrap px-3" href={bookingHref} size="sm" variant="primary">
              {hasSelectedMoment ? "Use as Brief" : `Brief ${formatAudioTime(bookingTime)}`}
            </ButtonLink>
          ) : null}
          <PlayerIconButton active={repeatOne} label={repeatOne ? "Repeat one enabled" : "Repeat this track"} onClick={onRepeatToggle}>
            <RepeatOneIcon />
          </PlayerIconButton>
          <PlayerIconButton active={isFavorite} tone="plain" label={isFavorite ? "Remove favorite track" : "Favorite track"} onClick={onFavorite}>
            <FavoriteIcon filled={isFavorite} />
          </PlayerIconButton>
          <label className="hidden min-w-[130px] items-center gap-room-1 text-mutedText lg:flex">
            <VolumeIcon />
            <input
              aria-label="Volume"
              className={cx("w-full accent-acidGreen")}
              max={1}
              min={0}
              step={0.01}
              type="range"
              value={volume}
              onChange={(event) => onVolumeChange(Number(event.target.value))}
            />
          </label>
        </div>
        {children}
      </div>
    </aside>
  );
}

function XIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function MiniPlayerProgress({
  duration,
  progressRatio,
  selectedTimestamp
}: {
  duration: number;
  progressRatio: number;
  selectedTimestamp: number | null;
}) {
  const selectedRatio = selectedTimestamp !== null && duration > 0 ? Math.min(1, Math.max(0, selectedTimestamp / duration)) : null;

  return (
    <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-roomBorder">
      <div className="h-px bg-acidGreen transition-[width]" style={{ width: `${progressRatio * 100}%` }} />
      {selectedRatio !== null ? (
        <span
          aria-hidden="true"
          className="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-acidGreen shadow-[0_0_14px_rgba(186,255,0,0.7)]"
          style={{ left: `${selectedRatio * 100}%` }}
        />
      ) : null}
    </div>
  );
}

function PlayerIconButton({
  active = false,
  children,
  disabled = false,
  label,
  onClick,
  tone = "default"
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  tone?: "default" | "play" | "plain";
}) {
  return (
    <button
      aria-label={label}
      className={cx(
        "grid h-8 w-8 place-items-center border transition disabled:cursor-not-allowed disabled:opacity-35",
        tone === "play" && "border-paperWhite bg-paperWhite text-voidBlack hover:border-acidGreen hover:bg-acidGreen",
        tone === "plain" &&
          (active
            ? "border-transparent bg-transparent text-acidGreen hover:text-paperWhite"
            : "border-transparent bg-transparent text-paperWhite hover:text-acidGreen"),
        tone === "default" &&
          (active
            ? "border-acidGreen bg-acidGreen text-voidBlack hover:border-paperWhite hover:bg-paperWhite"
            : "border-transparent bg-transparent text-paperWhite hover:border-roomBorder hover:bg-inkPanel")
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
    </svg>
  );
}

function PreviousIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 5h2v14H6zM9 12l9 7V5z" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M16 5h2v14h-2zM6 5v14l9-7z" />
    </svg>
  );
}

function QueueIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M4 7h10M4 12h12M4 17h8" />
      <path d="M18 8l3 3-3 3" />
    </svg>
  );
}

function FavoriteIcon({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M12 20s-7-4.35-9.25-8.3C.7 8.1 2.7 4 6.65 4c2.05 0 3.4 1.1 4.35 2.25C11.95 5.1 13.3 4 15.35 4c3.95 0 5.95 4.1 3.9 7.7C19 15.65 12 20 12 20z" />
    </svg>
  );
}

function RepeatOneIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a3 3 0 0 1 3-3h15" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a3 3 0 0 1-3 3H3" />
      <path d="M12 9v6" />
      <path d="M10.5 10.5 12 9l1.5 1.5" />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M4 10v4h4l5 4V6l-5 4z" />
      <path d="M16 9.5a4 4 0 0 1 0 5" />
      <path d="M18.5 7a7 7 0 0 1 0 10" />
    </svg>
  );
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error("useAudioPlayer must be used inside AudioPlayerProvider.");
  }

  return context;
}

export function formatAudioTime(valueInSeconds: number) {
  if (!Number.isFinite(valueInSeconds)) {
    return "0:00";
  }

  const minutes = Math.floor(valueInSeconds / 60);
  const seconds = Math.floor(valueInSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
