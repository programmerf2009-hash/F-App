import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  FileText,
  Image as ImageIcon,
  Info,
  Upload,
  Video,
} from "lucide-react";
import type { Session } from "../lib/auth";
import { Sheet } from "../components/Sheet";
import { newsErrorMessage } from "./news-api";
import { publishArticle, publishFlash, publishShort } from "./news-compose";
import {
  NEWS_CATEGORIES,
  type NewsCategory,
  type NewsChannel,
} from "./news-types";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ChannelPicker({
  channels,
  value,
  onChange,
}: {
  channels: NewsChannel[];
  value: string;
  onChange: (channelId: string) => void;
}) {
  if (channels.length <= 1) {
    const channel = channels[0];
    return (
      <div className="news-composer__channel">
        <span className="news-composer__channel-mark">{channel?.name.slice(0, 1) ?? "F"}</span>
        <span>
          <b>{channel?.name ?? "No channel yet"}</b>
          <small>{channel ? `@${channel.handle}` : "Create a channel in Studio first."}</small>
        </span>
      </div>
    );
  }

  return (
    <label className="news-field">
      <span>Publishing as</span>
      <select
        className="news-composer__select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {channels.map((channel) => (
          <option key={channel.id} value={channel.id}>
            {channel.name} (@{channel.handle})
          </option>
        ))}
      </select>
    </label>
  );
}

function CategoryPicker({
  value,
  onChange,
}: {
  value: NewsCategory;
  onChange: (category: NewsCategory) => void;
}) {
  return (
    <div className="news-field">
      <span>Category</span>
      <div className="news-channel-form__categories">
        {NEWS_CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            className={`news-sheet-chip${value === category ? " is-active" : ""}`}
            aria-pressed={value === category}
            onClick={() => onChange(category)}
          >
            {value === category ? <Check size={12} strokeWidth={2.4} /> : null}
            {category}
          </button>
        ))}
      </div>
    </div>
  );
}

function FileField({
  label,
  accept,
  file,
  onChange,
  hint,
}: {
  label: string;
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
  hint: string;
}) {
  return (
    <label className="news-field">
      <span>{label}</span>
      <span className="news-composer__file">
        <input
          type="file"
          accept={accept}
          onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        />
        <span className="news-composer__file-icon">
          {accept.startsWith("video") ? (
            <Video size={17} strokeWidth={2} />
          ) : (
            <ImageIcon size={17} strokeWidth={2} />
          )}
        </span>
        <span className="news-composer__file-copy">
          <b>{file ? file.name : "Choose a file"}</b>
          <small>{file ? formatSize(file.size) : hint}</small>
        </span>
        <Upload size={15} strokeWidth={2} />
      </span>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Flash                                                                      */
/* -------------------------------------------------------------------------- */

export function FlashComposerSheet({
  session,
  channels,
  initialChannelId,
  onClose,
  onPublished,
}: {
  session: Session;
  channels: NewsChannel[];
  initialChannelId: string | null;
  onClose: () => void;
  onPublished: () => void;
}) {
  const [channelId, setChannelId] = useState(
    initialChannelId ?? channels[0]?.id ?? "",
  );
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<NewsCategory>(
    channels.find((channel) => channel.id === channelId)?.category ?? "Top",
  );
  const [video, setVideo] = useState<File | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedChannel = channels.find((channel) => channel.id === channelId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (publishing) return;
    if (!selectedChannel) {
      setError("Create a channel before publishing a Flash.");
      return;
    }
    if (!video) {
      setError("Choose the recorded video for this Flash.");
      return;
    }

    setPublishing(true);
    setError(null);
    try {
      await publishFlash(
        {
          channelId: selectedChannel.id,
          title,
          category,
          video,
          poster,
        },
        session,
      );
      onPublished();
      onClose();
    } catch (nextError) {
      setError(newsErrorMessage(nextError, "Could not publish this Flash."));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Sheet
      title="New video Flash"
      subtitle="Recorded video first, live later. It leaves the feed after 24 hours."
      onClose={onClose}
    >
      <form className="news-channel-form news-composer" onSubmit={submit}>
        <ChannelPicker channels={channels} value={channelId} onChange={setChannelId} />

        <label className="news-field">
          <span>Flash title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What happened?"
            maxLength={160}
            autoFocus
          />
          <small>{title.length}/160 · urgent, short and specific works best</small>
        </label>

        <CategoryPicker value={category} onChange={setCategory} />

        <FileField
          label="Recorded video"
          accept="video/mp4,video/webm,video/quicktime"
          file={video}
          onChange={setVideo}
          hint="MP4, MOV or WebM · up to 60 seconds · 40 MB"
        />

        <FileField
          label="Poster (optional)"
          accept="image/jpeg,image/png,image/webp"
          file={poster}
          onChange={setPoster}
          hint="We can use a frame from the video if you skip this."
        />

        <div className="news-channel-form__note">
          <Info size={16} strokeWidth={1.9} />
          <p>
            Flash is video-first: the title and video are the whole story. After 24 hours it moves
            to this channel&apos;s archive, where you can add a follow-up article.
          </p>
        </div>

        {error ? (
          <p className="news-form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="news-sheet__actions">
          <button
            type="button"
            className="news-button news-button--ghost"
            onClick={onClose}
            disabled={publishing}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="news-button news-button--blue"
            disabled={publishing || !selectedChannel || !video}
          >
            {publishing ? "Publishing..." : "Publish Flash"}
            <ArrowRight size={15} strokeWidth={2.2} />
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Short                                                                      */
/* -------------------------------------------------------------------------- */

export function ShortComposerSheet({
  session,
  channels,
  initialChannelId,
  onClose,
  onPublished,
}: {
  session: Session;
  channels: NewsChannel[];
  initialChannelId: string | null;
  onClose: () => void;
  onPublished: () => void;
}) {
  const [channelId, setChannelId] = useState(
    initialChannelId ?? channels[0]?.id ?? "",
  );
  const [caption, setCaption] = useState("");
  const [category, setCategory] = useState<NewsCategory>(
    channels.find((channel) => channel.id === channelId)?.category ?? "Top",
  );
  const [video, setVideo] = useState<File | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedChannel = channels.find((channel) => channel.id === channelId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (publishing) return;
    if (!selectedChannel) {
      setError("Create a channel before publishing a Short.");
      return;
    }
    if (!video) {
      setError("Choose the video for this Short.");
      return;
    }

    setPublishing(true);
    setError(null);
    try {
      await publishShort(
        {
          channelId: selectedChannel.id,
          caption,
          category,
          video,
          poster,
        },
        session,
      );
      onPublished();
      onClose();
    } catch (nextError) {
      setError(newsErrorMessage(nextError, "Could not publish this Short."));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Sheet
      title="New Short"
      subtitle="News only. Vertical video, a short caption and the same F News identity."
      onClose={onClose}
    >
      <form className="news-channel-form news-composer" onSubmit={submit}>
        <ChannelPicker channels={channels} value={channelId} onChange={setChannelId} />

        <label className="news-field">
          <span>Caption</span>
          <textarea
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="What is happening?"
            maxLength={280}
            rows={4}
            autoFocus
          />
          <small>{caption.length}/280 · keep it factual and news-first</small>
        </label>

        <CategoryPicker value={category} onChange={setCategory} />

        <FileField
          label="Vertical video"
          accept="video/mp4,video/webm,video/quicktime"
          file={video}
          onChange={setVideo}
          hint="MP4, MOV or WebM · up to 60 seconds · 40 MB"
        />

        <FileField
          label="Poster (optional)"
          accept="image/jpeg,image/png,image/webp"
          file={poster}
          onChange={setPoster}
          hint="Use a clean frame or upload a custom poster."
        />

        <div className="news-channel-form__note">
          <Video size={16} strokeWidth={1.9} />
          <p>
            Shorts are for news, not entertainment. Share stays visible but disabled until F Chat
            arrives, so no external sharing is offered.
          </p>
        </div>

        {error ? (
          <p className="news-form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="news-sheet__actions">
          <button
            type="button"
            className="news-button news-button--ghost"
            onClick={onClose}
            disabled={publishing}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="news-button news-button--blue"
            disabled={publishing || !selectedChannel || !video}
          >
            {publishing ? "Publishing..." : "Publish Short"}
            <ArrowRight size={15} strokeWidth={2.2} />
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Article                                                                    */
/* -------------------------------------------------------------------------- */

export function ArticleComposerSheet({
  session,
  channels,
  initialChannelId,
  onClose,
  onPublished,
}: {
  session: Session;
  channels: NewsChannel[];
  initialChannelId: string | null;
  onClose: () => void;
  onPublished: () => void;
}) {
  const [channelId, setChannelId] = useState(
    initialChannelId ?? channels[0]?.id ?? "",
  );
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState<NewsCategory>(
    channels.find((channel) => channel.id === channelId)?.category ?? "Top",
  );
  const [region, setRegion] = useState("");
  const [tags, setTags] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [cover, setCover] = useState<File | null>(null);
  const [body, setBody] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [videoCaption, setVideoCaption] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedChannel = channels.find((channel) => channel.id === channelId);
  const bodyWords = useMemo(
    () => body.trim().split(/\s+/).filter(Boolean).length,
    [body],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (publishing) return;
    if (!selectedChannel) {
      setError("Create a channel before writing an article.");
      return;
    }
    if (!cover) {
      setError("Choose a cover image for this article.");
      return;
    }

    setPublishing(true);
    setError(null);
    try {
      await publishArticle(
        {
          channelId: selectedChannel.id,
          title,
          summary,
          category,
          region,
          tags: tags
            .split(",")
            .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
            .filter(Boolean)
            .slice(0, 12),
          urgent,
          cover,
          body,
          images,
          video,
          videoCaption,
        },
        session,
      );
      onPublished();
      onClose();
    } catch (nextError) {
      setError(newsErrorMessage(nextError, "Could not publish this article."));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Sheet
      title="Write article"
      subtitle="Cover, headline and full story. Add as many images and videos as the report needs."
      onClose={onClose}
    >
      <form className="news-channel-form news-composer" onSubmit={submit}>
        <ChannelPicker channels={channels} value={channelId} onChange={setChannelId} />

        <label className="news-field">
          <span>Headline</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Write the headline first"
            maxLength={200}
            autoFocus
          />
          <small>{title.length}/200</small>
        </label>

        <label className="news-field">
          <span>Summary</span>
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="One or two lines for cards and search."
            maxLength={400}
            rows={2}
          />
          <small>{summary.length}/400 · empty summary uses the opening paragraph</small>
        </label>

        <CategoryPicker value={category} onChange={setCategory} />

        <div className="news-composer__row">
          <label className="news-field">
            <span>Region (optional)</span>
            <input
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              placeholder="Toshkent"
              maxLength={60}
            />
          </label>
          <label className="news-field">
            <span>Tags (comma separated)</span>
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="economy, transport"
              maxLength={120}
            />
          </label>
        </div>

        <FileField
          label="Cover image"
          accept="image/jpeg,image/png,image/webp"
          file={cover}
          onChange={setCover}
          hint="Required · JPG, PNG or WebP · up to 25 MB"
        />

        <label className="news-field">
          <span>Full story</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write the full report. Use blank lines to start a new paragraph."
            rows={9}
          />
          <small>{bodyWords} words · paragraphs become clean text blocks</small>
        </label>

        <label className="news-field">
          <span>Body images</span>
          <span className="news-composer__file">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(event) =>
                setImages((previous) => [
                  ...previous,
                  ...Array.from(event.target.files ?? []),
                ])
              }
            />
            <span className="news-composer__file-icon">
              <ImageIcon size={17} strokeWidth={2} />
            </span>
            <span className="news-composer__file-copy">
              <b>{images.length ? `${images.length} images selected` : "Add multiple images"}</b>
              <small>
                {images.length
                  ? images.map((image) => image.name).join(", ").slice(0, 90)
                  : "They appear after the story text, in order."}
              </small>
            </span>
            <Upload size={15} strokeWidth={2} />
          </span>
        </label>

        <FileField
          label="Video (optional)"
          accept="video/mp4,video/webm,video/quicktime"
          file={video}
          onChange={setVideo}
          hint="MP4, MOV or WebM · up to 2 minutes · 40 MB"
        />

        {video ? (
          <label className="news-field">
            <span>Video caption</span>
            <input
              value={videoCaption}
              onChange={(event) => setVideoCaption(event.target.value)}
              placeholder="What does the video show?"
              maxLength={140}
            />
          </label>
        ) : null}

        <label className="news-composer__check">
          <input
            type="checkbox"
            checked={urgent}
            onChange={(event) => setUrgent(event.target.checked)}
          />
          <span>
            <b>Mark as urgent</b>
            <small>Puts the story in the urgent rail on Home.</small>
          </span>
        </label>

        <div className="news-channel-form__note">
          <FileText size={16} strokeWidth={1.9} />
          <p>
            Articles publish immediately to this channel. The article stays editable in the
            database after publishing.
          </p>
        </div>

        {error ? (
          <p className="news-form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="news-sheet__actions">
          <button
            type="button"
            className="news-button news-button--ghost"
            onClick={onClose}
            disabled={publishing}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="news-button news-button--blue"
            disabled={publishing || !selectedChannel || !cover || !body.trim()}
          >
            {publishing ? "Publishing..." : "Publish article"}
            <ArrowRight size={15} strokeWidth={2.2} />
          </button>
        </div>
      </form>
    </Sheet>
  );
}
