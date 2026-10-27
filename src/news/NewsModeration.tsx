import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Flag,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { Sheet } from "../components/Sheet";
import { loadModerationQueue, newsErrorMessage, resolveNewsReport } from "./news-api";
import {
  NEWS_REPORT_TARGET_LABEL,
  formatCount,
  reportReasonLabel,
  timeAgo,
  type NewsReport,
} from "./news-types";
import "./news-comments.css";

function minutesSince(iso: string): number {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / 60_000));
}

/**
 * Admin-only trust & safety desk. It is only reachable from Settings when the
 * account is present in public.news_admins; the RPC re-checks that on every
 * read and write.
 */
export function NewsModerationSheet({
  onClose,
  notify,
}: {
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const [reports, setReports] = useState<NewsReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setReports(await loadModerationQueue(filter));
    } catch (nextError) {
      setError(newsErrorMessage(nextError, "The moderation queue is unavailable."));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (
    report: NewsReport,
    status: "resolved" | "dismissed",
    action: "none" | "hide" | "remove",
  ) => {
    if (busyId) return;
    setBusyId(report.id);

    try {
      await resolveNewsReport(report.id, status, action);
      notify(
        status === "dismissed"
          ? "Report dismissed."
          : action === "none"
            ? "Report closed."
            : "Content taken out of public view.",
      );
      await load();
    } catch (nextError) {
      notify(newsErrorMessage(nextError, "Could not update this report."));
    } finally {
      setBusyId(null);
    }
  };

  const openCount = reports.filter(
    (report) => report.status === "open" || report.status === "reviewing",
  ).length;

  return (
    <Sheet
      title="Moderation desk"
      subtitle="Reports from readers across F News."
      onClose={onClose}
    >
      <div className="news-moderation">
        <div className="news-moderation__bar">
          <div className="news-moderation__tabs" role="tablist" aria-label="Report filter">
            <button
              type="button"
              role="tab"
              aria-selected={filter === "open"}
              className={filter === "open" ? "is-active" : ""}
              onClick={() => setFilter("open")}
            >
              Open
              <span>{formatCount(openCount)}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "all"}
              className={filter === "all" ? "is-active" : ""}
              onClick={() => setFilter("all")}
            >
              All
            </button>
          </div>

          <button
            type="button"
            className="news-moderation__refresh"
            onClick={() => void load()}
            aria-label="Refresh moderation queue"
            disabled={loading}
          >
            <RefreshCw size={14} strokeWidth={2.2} className={loading ? "news-spin" : ""} />
          </button>
        </div>

        <p className="news-moderation__note">
          <ShieldCheck size={14} strokeWidth={2} />
          You are seeing this because your account is a News moderator.
        </p>

        {loading && reports.length === 0 ? (
          <p className="news-moderation__empty" role="status">
            <LoaderCircle size={16} strokeWidth={2} className="news-spin" />
            Loading reports…
          </p>
        ) : error ? (
          <div className="news-moderation__empty" role="alert">
            <ShieldAlert size={20} strokeWidth={1.9} />
            <span>{error}</span>
            <button type="button" className="news-button news-button--ghost" onClick={() => void load()}>
              Retry
            </button>
          </div>
        ) : reports.length === 0 ? (
          <div className="news-moderation__empty">
            <Check size={22} strokeWidth={2.2} />
            <strong>Queue is clear</strong>
            <span>No reports are waiting in this view.</span>
          </div>
        ) : (
          <div className="news-moderation__list">
            {reports.map((report) => {
              const closed = report.status === "resolved" || report.status === "dismissed";
              const busy = busyId === report.id;

              return (
                <article className="news-moderation__card" key={report.id}>
                  <div className="news-moderation__card-head">
                    <span className={`news-moderation__type news-moderation__type--${report.targetType}`}>
                      {NEWS_REPORT_TARGET_LABEL[report.targetType]}
                    </span>
                    <span className={`news-moderation__status is-${report.status}`}>
                      {report.status}
                    </span>
                    <span className="news-moderation__time">
                      {timeAgo(minutesSince(report.createdAt))}
                    </span>
                  </div>

                  <strong className="news-moderation__target">
                    {report.targetSnapshot || "This content is no longer available."}
                  </strong>

                  <div className="news-moderation__meta">
                    <span>
                      <Flag size={11} strokeWidth={2.2} />
                      {reportReasonLabel(report.reason)}
                    </span>
                    <span>Reported by @{report.reporterNickname}</span>
                    {report.targetAuthorNickname ? (
                      <span>Author @{report.targetAuthorNickname}</span>
                    ) : null}
                  </div>

                  {report.details ? <p className="news-moderation__details">{report.details}</p> : null}

                  {closed ? (
                    <p className="news-moderation__closed">
                      <Check size={12} strokeWidth={2.4} />
                      Closed {report.resolvedAt ? timeAgo(minutesSince(report.resolvedAt)) : ""}
                    </p>
                  ) : (
                    <div className="news-moderation__actions">
                      {report.targetType === "comment" ? (
                        <button
                          type="button"
                          className="is-hide"
                          disabled={busy}
                          onClick={() => void resolve(report, "resolved", "hide")}
                        >
                          {busy ? (
                            <LoaderCircle size={12} strokeWidth={2.2} className="news-spin" />
                          ) : (
                            <ShieldAlert size={12} strokeWidth={2.2} />
                          )}
                          Hide
                        </button>
                      ) : null}

                      <button
                        type="button"
                        className="is-remove"
                        disabled={busy}
                        onClick={() => void resolve(report, "resolved", "remove")}
                      >
                        {busy ? (
                          <LoaderCircle size={12} strokeWidth={2.2} className="news-spin" />
                        ) : (
                          <Trash2 size={12} strokeWidth={2.2} />
                        )}
                        {report.targetType === "channel" ? "Archive" : "Take down"}
                      </button>

                      <button
                        type="button"
                        className="is-dismiss"
                        disabled={busy}
                        onClick={() => void resolve(report, "dismissed", "none")}
                      >
                        <X size={12} strokeWidth={2.3} />
                        Dismiss
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Sheet>
  );
}
