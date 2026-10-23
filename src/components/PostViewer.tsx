import { useEffect, useState } from "react";
import { Globe2, ImageOff, LoaderCircle, Trash2, Users, X } from "lucide-react";
import type { PostItem } from "../lib/media";
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
  post: PostItem;
  owner: OwnerInfo;
  canDelete: boolean;
  onClose: () => void;
  onDelete: (post: PostItem) => Promise<void>;
  onToast: (message: string) => void;
}

function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

export function PostViewer({ post, owner, canDelete, onClose, onDelete, onToast }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || deleting) return;
      if (confirmDelete) setConfirmDelete(false);
      else onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmDelete, deleting, onClose]);

  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await onDelete(post);
      onClose();
    } catch (caught) {
      onToast(errorText(caught, "Could not delete this post."));
      setDeleting(false);
    }
  };

  return (
    <ModalPortal>
    <div className="media-viewer" role="dialog" aria-modal="true" aria-label="Post">
      <button
        type="button"
        className="media-viewer__scrim"
        onClick={() => {
          if (!deleting) onClose();
        }}
        aria-label="Close"
      />

      <article className="post-viewer">
        <header className="post-viewer__head">
          <PersonAvatar url={owner.avatar} name={owner.firstName} size="sm" />

          <div className="post-viewer__who">
            <p className="post-viewer__name">
              {owner.firstName} {owner.lastName}
            </p>
            <p className="post-viewer__meta">
              @{owner.nickname} · {timeAgo(post.createdAt)}
            </p>
          </div>

          <span className="post-viewer__visibility">
            {post.visibility === "public" ? (
              <Globe2 size={12} strokeWidth={2.1} />
            ) : (
              <Users size={12} strokeWidth={2.1} />
            )}
            {post.visibility === "public" ? "Public" : "Friends"}
          </span>

          <button
            type="button"
            className="post-viewer__close"
            onClick={onClose}
            disabled={deleting}
            aria-label="Close post"
          >
            <X size={17} strokeWidth={2.2} />
          </button>
        </header>

        <div className="post-viewer__media">
          {post.mediaUrl ? (
            post.kind === "photo" ? (
              <img src={post.mediaUrl} alt={post.caption || "Post"} />
            ) : (
              <video
                key={post.id}
                src={post.mediaUrl}
                controls
                autoPlay
                playsInline
                preload="metadata"
              />
            )
          ) : (
            <div className="post-viewer__missing">
              <ImageOff size={30} strokeWidth={1.7} />
              <span>Media unavailable</span>
            </div>
          )}
        </div>

        {post.caption ? <p className="post-viewer__caption">{post.caption}</p> : null}

        <footer className="post-viewer__foot">
          {confirmDelete ? (
            <>
              <span className="post-viewer__confirm-text">Delete this post?</span>
              <span className="post-viewer__confirm-actions">
                <button
                  type="button"
                  className="post-viewer__cancel"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="post-viewer__delete"
                  onClick={() => void remove()}
                  disabled={deleting}
                >
                  {deleting ? <LoaderCircle size={14} className="spin" /> : <Trash2 size={14} />}
                  Delete
                </button>
              </span>
            </>
          ) : (
            <>
              <span>{timeAgo(post.createdAt)}</span>
              {canDelete ? (
                <button
                  type="button"
                  className="post-viewer__delete"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={14} strokeWidth={2.1} />
                  Delete post
                </button>
              ) : null}
            </>
          )}
        </footer>
      </article>
    </div>
    </ModalPortal>
  );
}
