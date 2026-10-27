import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Check,
  CornerDownRight,
  Flag,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import type { Session } from "../lib/auth";
import { Sheet } from "../components/Sheet";
import {
  addNewsComment,
  deleteNewsComment,
  loadCommentThread,
  newsErrorMessage,
  reportNewsContent,
} from "./news-api";
import {
  NEWS_REPORT_REASONS,
  NEWS_REPORT_TARGET_LABEL,
  formatCount,
  timeAgo,
  type NewsComment,
  type NewsCommentTarget,
  type NewsReportReason,
  type NewsReportTargetInput,
} from "./news-types";
import "./news-comments.css";

function minutesSince(iso: string): number {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / 60_000));
}

function CommentAvatar({
  nickname,
  avatar,
  size = 32,
}: {
  nickname: string;
  avatar: string | null;
  size?: number;
}) {
  const initial = nickname.trim().slice(0, 1).toUpperCase() || "F";

  return (
    <span
      className="news-comment__avatar"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
      aria-hidden="true"
    >
      {avatar ? <img src={avatar} alt="" loading="lazy" /> : <span>{initial}</span>}
    </span>
  );
}

interface CommentsProps {
  targetType: NewsCommentTarget;
  targetId: string;
  session: Session;
  live: boolean;
  isAdmin?: boolean;
  dark?: boolean;
  onReport: (target: NewsReportTargetInput) => void;
}

/**
 * Reader comments for one article, Flash or Short. All reads/writes go through
 * definer RPCs, so only a public nickname/avatar card is ever exposed.
 */
export function NewsComments({
  targetType,
  targetId,
  session,
  live,
  isAdmin = false,
  dark = false,
  onReport,
}: CommentsProps) {
  const [comments, setComments] = useState<NewsComment[]>([]);
  const [loading, setLoading] = useState(live);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<NewsComment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const sequence = useRef(0);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    if (!live) return;
    const current = ++sequence.current;
    setLoading(true);
    setError(null);

    try {
      const rows = await loadCommentThread(targetType, targetId);
      if (current === sequence.current) setComments(rows);
    } catch (nextError) {
      if (current === sequence.current) {
        setError(newsErrorMessage(nextError, "Comments are unavailable right now."));
      }
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [live, targetId, targetType]);

  useEffect(() => {
    if (!live) {
      setComments([]);
      setLoading(false);
      return;
    }
    void load();
  }, [live, load]);

  const byId = useMemo(() => new Map(comments.map((comment) => [comment.id, comment])), [comments]);
  const replies = useMemo(() => {
    const grouped = new Map<string, NewsComment[]>();
    for (const comment of comments) {
      if (!comment.parentId) continue;
      const list = grouped.get(comment.parentId) ?? [];
      list.push(comment);
      grouped.set(comment.parentId, list);
    }
    return grouped;
  }, [comments]);
  const roots = useMemo(() => comments.filter((comment) => !comment.parentId), [comments]);
  const visibleCount = comments.filter((comment) => comment.status === "visible").length;
  const canPost = live && !submitting && body.trim().length > 0 && body.trim().length <= 1000;

  const rootFor = (comment: NewsComment): NewsComment => {
    let current = comment;
    let guard = 0;
    while (current.parentId && guard < 4) {
      const parent = byId.get(current.parentId);
      if (!parent) break;
      current = parent;
      guard += 1;
    }
    return current;
  };

  const startReply = (comment: NewsComment) => {
    setReplyTo(rootFor(comment));
    setFormError(null);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canPost) return;

    const text = body.trim();
    setSubmitting(true);
    setFormError(null);

    try {
      await addNewsComment(targetType, targetId, text, replyTo?.id ?? null);
      setBody("");
      setReplyTo(null);
      await load();
    } catch (nextError) {
      setFormError(newsErrorMessage(nextError, "Could not post this comment."));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (commentId: string) => {
    setDeletingId(commentId);
    setFormError(null);

    try {
      await deleteNewsComment(commentId);
      setConfirmDeleteId(null);
      await load();
    } catch (nextError) {
      setFormError(newsErrorMessage(nextError, "Could not delete this comment."));
    } finally {
      setDeletingId(null);
    }
  };

  const reportComment = (comment: NewsComment) => {
    onReport({
      type: "comment",
      id: comment.id,
      title: comment.body.slice(0, 140) || `Comment by @${comment.nickname}`,
    });
  };

  const renderComment = (comment: NewsComment, reply = false) => (
    <div
      key={comment.id}
      className={`news-comment${reply ? " news-comment--reply" : ""}${
        comment.status === "removed" ? " is-removed" : ""
      }`}
    >
      <CommentAvatar nickname={comment.nickname} avatar={comment.avatar} size={reply ? 27 : 32} />
      <div className="news-comment__main">
        <div className="news-comment__head">
          <strong>
            @{comment.nickname}
            {comment.isMine ? <span> · you</span> : null}
          </strong>
          <span>{timeAgo(minutesSince(comment.createdAt))}</span>
        </div>

        {comment.status === "removed" ? (
          <p className="news-comment__removed">Comment removed.</p>
        ) : (
          <p className="news-comment__body">{comment.body}</p>
        )}

        {comment.status === "visible" ? (
          <div className="news-comment__actions">
            <button type="button" onClick={() => startReply(comment)}>
              <CornerDownRight size={12} strokeWidth={2.2} />
              Reply
            </button>
            {!comment.isMine ? (
              <button type="button" onClick={() => reportComment(comment)}>
                <Flag size={11} strokeWidth={2.2} />
                Report
              </button>
            ) : null}
            {comment.isMine || isAdmin ? (
              <button type="button" onClick={() => setConfirmDeleteId(comment.id)}>
                <Trash2 size={11} strokeWidth={2.2} />
                Delete
              </button>
            ) : null}
          </div>
        ) : null}

        {confirmDeleteId === comment.id ? (
          <div className="news-comment__confirm" role="alert">
            <span>{comment.isMine ? "Delete this comment?" : "Remove this comment as a moderator?"}</span>
            <button
              type="button"
              className="is-danger"
              disabled={deletingId === comment.id}
              onClick={() => void remove(comment.id)}
            >
              {deletingId === comment.id ? (
                <LoaderCircle size={12} strokeWidth={2.2} className="news-spin" />
              ) : null}
              Delete
            </button>
            <button type="button" onClick={() => setConfirmDeleteId(null)}>
              Cancel
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <section className={`news-comments${dark ? " news-comments--dark" : ""}`} aria-labelledby={`comments-${targetId}`}>
      <header className="news-comments__head">
        <div>
          <p className="news-comments__eyebrow">Reader desk</p>
          <h2 id={`comments-${targetId}`}>
            Comments
            <span>{formatCount(visibleCount)}</span>
          </h2>
        </div>
        <span className="news-comments__mark" aria-hidden="true">
          <MessageCircle size={18} strokeWidth={1.9} />
        </span>
      </header>

      {!live ? (
        <p className="news-comments__note">
          <ShieldCheck size={16} strokeWidth={2} />
          Comments open in the live edition. Preview stories stay read-only.
        </p>
      ) : (
        <>
          <form className="news-comment-composer" onSubmit={submit}>
            <CommentAvatar nickname={session.nickname} avatar={session.photo} size={34} />
            <div className="news-comment-composer__field">
              {replyTo ? (
                <div className="news-comment-composer__reply">
                  <span>
                    Replying to <strong>@{replyTo.nickname}</strong>
                  </span>
                  <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
                    <X size={12} strokeWidth={2.3} />
                  </button>
                </div>
              ) : null}

              <textarea
                ref={composerRef}
                value={body}
                maxLength={1000}
                rows={2}
                placeholder={replyTo ? "Write a reply…" : "Add to the public record…"}
                onChange={(event) => {
                  setBody(event.target.value);
                  setFormError(null);
                }}
              />

              <div className="news-comment-composer__foot">
                <span>{body.length}/1000</span>
                <button type="submit" disabled={!canPost}>
                  {submitting ? (
                    <LoaderCircle size={14} strokeWidth={2.2} className="news-spin" />
                  ) : (
                    <Send size={14} strokeWidth={2.2} />
                  )}
                  Post
                </button>
              </div>
            </div>
          </form>

          {formError ? (
            <p className="news-comments__error" role="alert">
              {formError}
            </p>
          ) : null}

          {loading && comments.length === 0 ? (
            <p className="news-comments__note" role="status">
              <LoaderCircle size={15} strokeWidth={2} className="news-spin" />
              Loading the reader desk…
            </p>
          ) : error ? (
            <div className="news-comments__error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => void load()}>
                <RefreshCw size={12} strokeWidth={2.3} />
                Retry
              </button>
            </div>
          ) : roots.length === 0 ? (
            <p className="news-comments__note">
              <MessageCircle size={16} strokeWidth={2} />
              No comments yet. Start the record.
            </p>
          ) : (
            <div className="news-comments__list">
              {roots.map((root) => (
                <div className="news-comments__thread" key={root.id}>
                  {renderComment(root)}
                  {(replies.get(root.id) ?? []).map((reply) => renderComment(reply, true))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ========================================================================== */
/* Report sheet                                                               */
/* ========================================================================== */

export function ReportSheet({
  target,
  onClose,
  onReported,
}: {
  target: NewsReportTargetInput;
  onClose: () => void;
  onReported: () => void;
}) {
  const [reason, setReason] = useState<NewsReportReason>("spam");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError(null);

    try {
      await reportNewsContent(target.type, target.id, reason, details.trim());
      onReported();
    } catch (nextError) {
      setError(newsErrorMessage(nextError, "Could not send this report."));
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet
      title="Report content"
      subtitle="The F News moderation desk reviews every report."
      onClose={onClose}
    >
      <form className="news-report" onSubmit={send}>
        <div className="news-report__target">
          <span>{NEWS_REPORT_TARGET_LABEL[target.type]}</span>
          <strong>{target.title}</strong>
        </div>

        <div className="news-report__reasons" role="radiogroup" aria-label="Report reason">
          {NEWS_REPORT_REASONS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="radio"
              aria-checked={reason === item.value}
              className={`news-report__reason${reason === item.value ? " is-active" : ""}`}
              onClick={() => setReason(item.value)}
            >
              <span>
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
              {reason === item.value ? <Check size={15} strokeWidth={2.5} /> : null}
            </button>
          ))}
        </div>

        <label className="news-report__details">
          <span>More context (optional)</span>
          <textarea
            value={details}
            maxLength={500}
            rows={3}
            placeholder="What should the moderation desk know?"
            onChange={(event) => setDetails(event.target.value)}
          />
          <small>{details.length}/500</small>
        </label>

        {error ? (
          <p className="news-report__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="news-report__foot">
          <button type="button" className="news-button news-button--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="news-button news-button--blue" disabled={sending}>
            {sending ? (
              <LoaderCircle size={15} strokeWidth={2.2} className="news-spin" />
            ) : (
              <Flag size={14} strokeWidth={2.2} />
            )}
            Send report
          </button>
        </div>

        <p className="news-report__privacy">
          <ShieldCheck size={13} strokeWidth={2} />
          The reported author never sees who reported them.
        </p>
      </form>
    </Sheet>
  );
}


