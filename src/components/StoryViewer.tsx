import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ImageOff,
  LoaderCircle,
  Play,
  Trash2,
  X,
} from "lucide-react";
import type { StoryItem } from "../lib/media";
import { timeAgo } from "../lib/time";
import { ModalPortal } from "./ModalPortal";
import { PersonAvatar } from "./PersonAvatar";

interface OwnerInfo {
  firstName: string;
  lastName: string;
  nickname: string;
  avatar: string | null;
}

interface Props {
  stories: StoryItem[];
  initialIndex: number;
  owner: OwnerInfo;
  canDelete: boolean;
  onClose: () => void;
  onDelete: (story: StoryItem) => Promise<void>;
  onToast: (message: string) => void;
}

const PHOTO_SECONDS = 5;

function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

export function StoryViewer({
  stories,
  initialIndex,
  owner,
  canDelete,
  onClose,
  onDelete,
  onToast,
}: Props) {
  const [items, setItems] = useState(stories);
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(initialIndex, 0), Math.max(stories.length - 1, 0)),
  );
  const [progress, setProgress] = useState(0);
  const [videoPaused, setVideoPaused] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const current = items[index];

  const goNext = useCallback(() => {
    if (index >= items.length - 1) {
      onClose();
      return;
    }
    setIndex(index + 1);
    setProgress(0);
    setVideoPaused(true);
  }, [index, items.length, onClose]);

  const goPrev = useCallback(() => {
    if (index <= 0) {
      setProgress(0);
      return;
    }
    setIndex(index - 1);
    setProgress(0);
    setVideoPaused(true);
  }, [index]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    if (items.length === 0) onClose();
  }, [items.length, onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (confirmDelete) setConfirmDelete(false);
        else if (!deleting) onClose();
      }
      if (event.key === "ArrowRight" && !confirmDelete) goNext();
      if (event.key === "ArrowLeft" && !confirmDelete) goPrev();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmDelete, deleting, goNext, goPrev, onClose]);

  useEffect(() => {
    if (!confirmDelete && !deleting) return;
    videoRef.current?.pause();
  }, [confirmDelete, deleting]);

  useEffect(() => {
    if (!current || current.kind !== "photo" || confirmDelete || deleting) return;

    setProgress(0);
    const started = performance.now();
    const timer = window.setInterval(() => {
      const next = Math.min(1, (performance.now() - started) / (PHOTO_SECONDS * 1000));
      setProgress(next);
      if (next >= 1) {
        window.clearInterval(timer);
        goNext();
      }
    }, 50);

    return () => window.clearInterval(timer);
  }, [current, goNext, confirmDelete, deleting]);

  const toggleVideo = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      void video.play().catch(() => setVideoPaused(true));
    } else {
      video.pause();
    }
  };

  const remove = async () => {
    if (!current || deleting) return;

    setDeleting(true);
    try {
      await onDelete(current);
      const remaining = items.filter((item) => item.id !== current.id);
      setConfirmDelete(false);

      if (remaining.length === 0) {
        onClose();
        return;
      }

      setItems(remaining);
      setIndex((value) => Math.min(value, remaining.length - 1));
      setProgress(0);
      setVideoPaused(true);
    } catch (caught) {
      onToast(errorText(caught, "Could not delete this story."));
    } finally {
      setDeleting(false);
    }
  };

  if (!current) return null;

  return (
    <ModalPortal>
    <div className="story-viewer" role="dialog" aria-modal="true" aria-label="Story">
      <div className="story-shell">
        <div className="story-viewer__bars" aria-hidden="true">
          {items.map((item, itemIndex) => {
            const width =
              itemIndex < index ? 100 : itemIndex === index ? Math.round(progress * 100) : 0;
            return (
              <span className="story-bar" key={item.id}>
                <span style={{ width: `${width}%` }} />
              </span>
            );
          })}
        </div>

        <header className="story-viewer__top">
          <PersonAvatar url={owner.avatar} name={owner.firstName} size="sm" />
          <div className="story-viewer__who">
            <p className="story-viewer__name">
              {owner.firstName} {owner.lastName}
            </p>
            <p className="story-viewer__time">{timeAgo(current.createdAt)}</p>
          </div>

          <div className="story-viewer__actions">
            {canDelete ? (
              <button
                type="button"
                className="story-iconbtn"
                onClick={() => setConfirmDelete(true)}
                disabled={deleting}
                aria-label="Delete story"
              >
                <Trash2 size={15} strokeWidth={2} />
              </button>
            ) : null}
            <button
              type="button"
              className="story-iconbtn"
              onClick={onClose}
              disabled={deleting}
              aria-label="Close story"
            >
              <X size={17} strokeWidth={2.2} />
            </button>
          </div>
        </header>

        <div className="story-viewer__media">
          {current.mediaUrl ? (
            current.kind === "photo" ? (
              <img
                src={current.mediaUrl}
                alt=""
                onClick={goNext}
              />
            ) : (
              <video
                key={current.id}
                ref={videoRef}
                src={current.mediaUrl}
                autoPlay
                playsInline
                preload="metadata"
                onClick={toggleVideo}
                onPlay={() => setVideoPaused(false)}
                onPause={() => setVideoPaused(true)}
                onEnded={goNext}
                onTimeUpdate={() => {
                  const video = videoRef.current;
                  if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
                    return;
                  }
                  setProgress(Math.min(1, video.currentTime / video.duration));
                }}
              />
            )
          ) : (
            <div className="post-viewer__missing story-viewer__missing">
              <ImageOff size={30} strokeWidth={1.7} />
              <span>Media unavailable</span>
            </div>
          )}

          {current.kind === "video" && videoPaused && current.mediaUrl ? (
            <button
              type="button"
              className="story-viewer__play"
              onClick={toggleVideo}
              aria-label="Play story"
            >
              <Play size={22} strokeWidth={2.2} fill="currentColor" />
            </button>
          ) : null}
        </div>

        <nav className="story-viewer__nav" aria-label="Story navigation">
          <button
            type="button"
            onClick={goPrev}
            disabled={index === 0}
            aria-label="Previous story"
          >
            <ChevronLeft size={17} strokeWidth={2.2} />
          </button>
          <span>
            {index + 1} / {items.length}
          </span>
          <button type="button" onClick={goNext} aria-label="Next story">
            <ChevronRight size={17} strokeWidth={2.2} />
          </button>
        </nav>

        {confirmDelete ? (
          <div className="story-confirm" role="alertdialog" aria-modal="true" aria-label="Delete story">
            <p>Delete this story?</p>
            <div className="story-confirm__actions">
              <button
                type="button"
                className="story-confirm__cancel"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="story-confirm__delete"
                onClick={() => void remove()}
                disabled={deleting}
              >
                {deleting ? <LoaderCircle size={14} className="spin" /> : <Trash2 size={14} />}
                Delete
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
    </ModalPortal>
  );
}
