import { useEffect, useId, useRef, useState } from "react";
import {
  Film,
  Globe2,
  ImagePlus,
  LoaderCircle,
  Upload,
  Users,
  X,
} from "lucide-react";
import { fileToPostPhoto } from "../lib/image";
import { ModalPortal } from "./ModalPortal";
import {
  createPost,
  createStory,
  type MediaKind,
  type PostVisibility,
} from "../lib/media";
import {
  isImageFile,
  isVideoFile,
  MAX_POST_VIDEO_SECONDS,
  MAX_STORY_VIDEO_SECONDS,
  validateVideo,
  videoContentType,
  videoExtension,
} from "../lib/video";

type ComposerMode = "post" | "story";

interface Props {
  mode: ComposerMode;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
  showToast: (message: string) => void;
}

interface Selection {
  kind: MediaKind;
  previewUrl: string;
  blob: Blob;
  contentType: string;
  extension: string;
  duration: number | null;
}

function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

export function MediaComposer({ mode, onClose, onCreated, showToast }: Props) {
  const isPost = mode === "post";
  const [selection, setSelection] = useState<Selection | null>(null);
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState<PostVisibility>("friends");
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const captionId = useId();

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    if (!selection) return;
    return () => URL.revokeObjectURL(selection.previewUrl);
  }, [selection]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  const chooseFile = () => {
    if (!busy && !preparing) inputRef.current?.click();
  };

  const selectFile = async (file: File | undefined) => {
    if (!file) return;

    setError(null);
    setPreparing(true);

    try {
      if (isImageFile(file)) {
        const prepared = await fileToPostPhoto(file);
        setSelection({
          kind: "photo",
          previewUrl: URL.createObjectURL(prepared.blob),
          blob: prepared.blob,
          contentType: "image/jpeg",
          extension: "jpg",
          duration: null,
        });
      } else if (isVideoFile(file)) {
        const limit = isPost ? MAX_POST_VIDEO_SECONDS : MAX_STORY_VIDEO_SECONDS;
        const meta = await validateVideo(file, limit);
        setSelection({
          kind: "video",
          previewUrl: URL.createObjectURL(file),
          blob: file,
          contentType: videoContentType(file),
          extension: videoExtension(file),
          duration: meta.duration,
        });
      } else {
        throw new Error("Choose a photo or video.");
      }
    } catch (caught) {
      setError(errorText(caught, "Could not prepare this file."));
    } finally {
      setPreparing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const publish = async () => {
    if (!selection || busy) return;

    setBusy(true);
    setError(null);

    try {
      if (isPost) {
        await createPost({
          blob: selection.blob,
          kind: selection.kind,
          contentType: selection.contentType,
          extension: selection.extension,
          caption,
          visibility,
        });
      } else {
        await createStory({
          blob: selection.blob,
          kind: selection.kind,
          contentType: selection.contentType,
          extension: selection.extension,
        });
      }

      showToast(isPost ? "Post shared" : "Story added");
      await onCreated();
      onClose();
    } catch (caught) {
      setError(errorText(caught, "Could not publish this. Try again."));
      setBusy(false);
    }
  };

  const limit = isPost ? "60s / 40 MB" : "15s / 40 MB";

  return (
    <ModalPortal>
    <div
      className="media-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-sheet-title"
    >
      <button
        type="button"
        className="media-sheet__scrim"
        onClick={() => {
          if (!busy) onClose();
        }}
        aria-label="Close"
      />

      <div className="media-sheet__panel">
        <div className="media-sheet__head">
          <div>
            <p className="media-sheet__eyebrow">{isPost ? "Profile" : "24 hours"}</p>
            <h2 className="media-sheet__title" id="media-sheet-title">
              {isPost ? "New post" : "New story"}
            </h2>
          </div>
          <button
            type="button"
            className="media-sheet__close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>

        {selection ? (
          <div className="media-preview">
            {selection.kind === "photo" ? (
              <img src={selection.previewUrl} alt="Selected photo" />
            ) : (
              <video src={selection.previewUrl} controls playsInline preload="metadata" />
            )}
            <div className="media-preview__bar">
              <span>
                {selection.kind === "photo"
                  ? "Photo ready"
                  : `${Math.round(selection.duration ?? 0)}s video`}
              </span>
              <button
                type="button"
                className="media-preview__change"
                onClick={chooseFile}
                disabled={busy || preparing}
              >
                Change
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="media-drop"
            onClick={chooseFile}
            disabled={preparing || busy}
          >
            {preparing ? (
              <LoaderCircle size={28} className="spin" />
            ) : isPost ? (
              <ImagePlus size={28} strokeWidth={1.7} />
            ) : (
              <Film size={28} strokeWidth={1.7} />
            )}
            <strong>{preparing ? "Preparing…" : "Choose a photo or video"}</strong>
            <span>
              Photos up to 1600px · video up to {limit}
            </span>
          </button>
        )}

        {isPost ? (
          <>
            <label className="media-field" htmlFor={captionId}>
              <span className="media-field__label">
                Caption
                <span>{caption.length}/140</span>
              </span>
              <textarea
                id={captionId}
                className="media-input"
                value={caption}
                maxLength={140}
                rows={3}
                placeholder="Say something about this post…"
                onChange={(event) => setCaption(event.target.value)}
                disabled={busy}
              />
            </label>

            <div className="media-field">
              <span className="media-field__label">Who can see this</span>
              <div className="media-segment" role="group" aria-label="Post visibility">
                <button
                  type="button"
                  className={visibility === "friends" ? "is-active" : ""}
                  aria-pressed={visibility === "friends"}
                  onClick={() => setVisibility("friends")}
                  disabled={busy}
                >
                  <Users size={14} strokeWidth={2.1} />
                  Friends
                </button>
                <button
                  type="button"
                  className={visibility === "public" ? "is-active" : ""}
                  aria-pressed={visibility === "public"}
                  onClick={() => setVisibility("public")}
                  disabled={busy}
                >
                  <Globe2 size={14} strokeWidth={2.1} />
                  Public
                </button>
              </div>
              <p className="media-hint">
                {visibility === "friends"
                  ? "Only your friends can see this post."
                  : "Anyone on F App can see this post."}
              </p>
            </div>
          </>
        ) : (
          <p className="media-hint media-hint--story">
            Stories are visible to your friends for 24 hours. Photos advance after 5 seconds.
          </p>
        )}

        {error ? (
          <p className="media-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="media-sheet__actions">
          <button
            type="button"
            className="pbtn pbtn--ghost"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="pbtn pbtn--primary"
            onClick={() => void publish()}
            disabled={!selection || busy || preparing}
          >
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Upload size={15} strokeWidth={2.2} />
            )}
            {busy ? "Uploading…" : isPost ? "Share post" : "Add story"}
          </button>
        </div>

        <input
          ref={inputRef}
          className="media-file"
          type="file"
          accept="image/*,video/*"
          onChange={(event) => void selectFile(event.target.files?.[0])}
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>
    </div>
    </ModalPortal>
  );
}
