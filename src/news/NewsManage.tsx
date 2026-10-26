import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Clock3,
  ImagePlus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  Users,
} from "lucide-react";
import type { Session } from "../lib/auth";
import { Sheet } from "../components/Sheet";
import {
  loadChannelVerification,
  loadPendingTransfer,
  newsErrorMessage,
  requestChannelTransfer,
  requestChannelVerification,
  searchTransferRecipients,
  updateLiveChannel,
  type NewsTransfer,
  type TransferRecipient,
  type VerificationStatus,
} from "./news-api";
import { uploadChannelArt } from "./news-compose";
import {
  NEWS_CATEGORIES,
  type NewsCategory,
  type NewsChannel,
} from "./news-types";

type ManageTab = "profile" | "trust" | "ownership";

interface Props {
  session: Session;
  channels: NewsChannel[];
  initialChannelId: string;
  initialTab?: ManageTab;
  onClose: () => void;
  onRefresh: () => void;
  notify: (message: string) => void;
}

function transferDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "soon";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function ManageChannelSheet({
  session,
  channels,
  initialChannelId,
  initialTab = "profile",
  onClose,
  onRefresh,
  notify,
}: Props) {
  const [selectedId, setSelectedId] = useState(initialChannelId);
  const [tab, setTab] = useState<ManageTab>(initialTab);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<NewsCategory>("Local");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "verify" | "transfer" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [verification, setVerification] = useState<VerificationStatus | null>(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationLevel, setVerificationLevel] = useState<"verified" | "trusted">(
    "verified",
  );
  const [evidence, setEvidence] = useState("");

  const [pendingTransfer, setPendingTransfer] = useState<NewsTransfer | null>(null);
  const [recipientQuery, setRecipientQuery] = useState("");
  const [recipientResults, setRecipientResults] = useState<TransferRecipient[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<TransferRecipient | null>(null);
  const [recipientSearching, setRecipientSearching] = useState(false);
  const [recipientSearched, setRecipientSearched] = useState(false);
  const [transferNote, setTransferNote] = useState("");

  const channel = useMemo(
    () => channels.find((item) => item.id === selectedId) ?? channels[0],
    [channels, selectedId],
  );

  const isOwner = channel
    ? channel.isOwner ??
      (!channel.ownerNickname || channel.ownerNickname === session.nickname)
    : false;

  useEffect(() => {
    if (!channel) return;
    setName(channel.name);
    setDescription(channel.description);
    setCategory(channel.category);
    setAvatarFile(null);
    setCoverFile(null);
    setAvatarPreview(null);
    setCoverPreview(null);
    setError(null);
    setRecipientQuery("");
    setRecipientResults([]);
    setSelectedRecipient(null);
    setRecipientSearched(false);
    setTransferNote("");
  }, [channel]);

  useEffect(() => {
    if (!channel) return;
    let active = true;
    setVerificationLoading(true);
    setVerification(null);
    setPendingTransfer(null);
    setEvidence("");

    void Promise.all([
      loadChannelVerification(channel.id),
      loadPendingTransfer(channel.id),
    ])
      .then(([nextVerification, nextTransfer]) => {
        if (!active) return;
        setVerification(nextVerification);
        setVerificationLevel(
          nextVerification?.level === "trusted" ? "trusted" : "verified",
        );
        setPendingTransfer(nextTransfer);
      })
      .catch(() => {
        /* Trust data is optional for editing the channel profile. */
      })
      .finally(() => {
        if (active) setVerificationLoading(false);
      });

    return () => {
      active = false;
    };
  }, [channel]);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview]);

  if (!channel) {
    return null;
  }

  const pickAvatar = (file: File | null) => {
    setAvatarFile(file);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(file ? URL.createObjectURL(file) : null);
  };

  const pickCover = (file: File | null) => {
    setCoverFile(file);
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverPreview(file ? URL.createObjectURL(file) : null);
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !isOwner) return;

    const cleanName = name.trim();
    if (cleanName.length < 2) {
      setError("Channel name needs at least 2 characters.");
      return;
    }

    setBusy("save");
    setError(null);
    try {
      const nextAvatar = avatarFile
        ? await uploadChannelArt(channel.id, avatarFile)
        : undefined;
      const nextCover = coverFile ? await uploadChannelArt(channel.id, coverFile) : undefined;

      await updateLiveChannel(channel.id, {
        name: cleanName,
        description,
        category,
        ...(nextAvatar ? { avatarUrl: nextAvatar } : {}),
        ...(nextCover ? { coverUrl: nextCover } : {}),
      });

      setAvatarFile(null);
      setCoverFile(null);
      onRefresh();
      notify("Channel profile updated.");
    } catch (nextError) {
      setError(newsErrorMessage(nextError, "Could not update this channel."));
    } finally {
      setBusy(null);
    }
  };

  const applyForVerification = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !isOwner) return;
    if (evidence.trim().length < 20) {
      setError("Add at least 20 characters describing the newsroom and its record.");
      return;
    }

    setBusy("verify");
    setError(null);
    try {
      await requestChannelVerification(channel.id, session.id, verificationLevel, evidence);
      const next = await loadChannelVerification(channel.id);
      setVerification(next);
      notify("Verification request sent for review.");
    } catch (nextError) {
      setError(newsErrorMessage(nextError, "Could not send this verification request."));
    } finally {
      setBusy(null);
    }
  };

  const searchRecipients = async () => {
    if (recipientSearching || recipientQuery.trim().length < 2) return;
    setRecipientSearching(true);
    setRecipientSearched(false);
    setError(null);
    try {
      setRecipientResults(
        await searchTransferRecipients(recipientQuery, session.id),
      );
      setRecipientSearched(true);
    } catch (nextError) {
      setError(newsErrorMessage(nextError, "Could not search personal accounts."));
    } finally {
      setRecipientSearching(false);
    }
  };

  const sendTransfer = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !isOwner || !selectedRecipient) return;

    setBusy("transfer");
    setError(null);
    try {
      await requestChannelTransfer(channel.id, selectedRecipient.id, transferNote);
      setPendingTransfer(await loadPendingTransfer(channel.id));
      setSelectedRecipient(null);
      setTransferNote("");
      notify(`Transfer request sent to @${selectedRecipient.nickname}.`);
    } catch (nextError) {
      setError(newsErrorMessage(nextError, "Could not start this transfer."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet
      title="Manage channel"
      subtitle={`@${channel.handle} · ${channel.verified ? "Verified" : "Standard"}`}
      onClose={onClose}
    >
      <div className="news-manage">
        {channels.length > 1 ? (
          <label className="news-field">
            <span>Channel</span>
            <select
              className="news-composer__select"
              value={channel.id}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {channels.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} (@{item.handle})
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {!isOwner ? (
          <div className="news-manage__notice">
            <ShieldCheck size={17} strokeWidth={1.9} />
            <p>
              You can publish here as an editor. Only the owner can change the channel
              identity, apply for a certificate or transfer ownership.
            </p>
          </div>
        ) : null}

        <div className="news-segment news-manage__tabs" role="tablist" aria-label="Channel settings">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "profile"}
            className={tab === "profile" ? "is-active" : ""}
            onClick={() => setTab("profile")}
          >
            Profile
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "trust"}
            className={tab === "trust" ? "is-active" : ""}
            onClick={() => setTab("trust")}
          >
            Trust
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "ownership"}
            className={tab === "ownership" ? "is-active" : ""}
            onClick={() => setTab("ownership")}
          >
            Ownership
          </button>
        </div>

        {tab === "profile" ? (
          <form className="news-channel-form" onSubmit={saveProfile}>
            <div className="news-manage__art-grid">
              <label className="news-manage__art">
                <span
                  className="news-manage__avatar"
                  style={
                    avatarPreview || channel.avatar
                      ? {
                          backgroundImage: `url(${avatarPreview ?? channel.avatar})`,
                        }
                      : undefined
                  }
                >
                  {!avatarPreview && !channel.avatar ? <UserRound size={22} strokeWidth={1.8} /> : null}
                </span>
                <span>
                  <b>Channel avatar</b>
                  <small>{avatarFile?.name ?? "Square image, used in feeds"}</small>
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={!isOwner}
                  onChange={(event) => pickAvatar(event.target.files?.[0] ?? null)}
                />
              </label>

              <label className="news-manage__art news-manage__art--cover">
                <span
                  className="news-manage__cover"
                  style={
                    coverPreview || channel.cover
                      ? { backgroundImage: `url(${coverPreview ?? channel.cover})` }
                      : undefined
                  }
                >
                  {!coverPreview && !channel.cover ? <ImagePlus size={22} strokeWidth={1.8} /> : null}
                </span>
                <span>
                  <b>Cover image</b>
                  <small>{coverFile?.name ?? "Wide image for the channel header"}</small>
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={!isOwner}
                  onChange={(event) => pickCover(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <label className="news-field">
              <span>Channel name</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={48}
                disabled={!isOwner || busy === "save"}
              />
              <small>{name.length}/48</small>
            </label>

            <label className="news-field">
              <span>Handle</span>
              <div className="news-field__prefix">
                <span>@</span>
                <input type="text" value={channel.handle} readOnly disabled />
              </div>
              <small>The handle stays with the channel through an ownership transfer.</small>
            </label>

            <div className="news-field">
              <span>Primary category</span>
              <div className="news-channel-form__categories">
                {NEWS_CATEGORIES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`news-sheet-chip${category === item ? " is-active" : ""}`}
                    aria-pressed={category === item}
                    disabled={!isOwner}
                    onClick={() => setCategory(item)}
                  >
                    {category === item ? <Check size={12} strokeWidth={2.4} /> : null}
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <label className="news-field">
              <span>Description</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                maxLength={600}
                disabled={!isOwner || busy === "save"}
              />
              <small>{description.length}/600</small>
            </label>

            {error ? (
              <p className="news-form-error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="news-manage__owner" aria-label="Channel owner">
              <span>
                <BadgeCheck size={15} strokeWidth={2.1} />
              </span>
              <p>
                Owned by <b>{channel.ownerName}</b> · @{channel.ownerNickname}
              </p>
            </div>

            <div className="news-sheet__actions">
              <button type="button" className="news-button news-button--ghost" onClick={onClose}>
                Close
              </button>
              <button
                type="submit"
                className="news-button news-button--blue"
                disabled={!isOwner || busy === "save"}
              >
                {busy === "save" ? "Saving..." : "Save profile"}
                <ArrowRight size={15} strokeWidth={2.2} />
              </button>
            </div>
          </form>
        ) : null}

        {tab === "trust" ? (
          <div className="news-channel-form">
            {verificationLoading ? (
              <div className="news-manage__status">
                <Clock3 size={19} strokeWidth={1.9} />
                <p>Checking this channel&apos;s certificate…</p>
              </div>
            ) : verification?.status === "pending" ? (
              <div className="news-manage__status news-manage__status--pending">
                <Clock3 size={20} strokeWidth={1.9} />
                <div>
                  <strong>Verification is under review</strong>
                  <p>
                    Requested {verification.level === "trusted" ? "Trusted" : "Verified"}{" "}
                    status. The newsroom keeps publishing while the review is open.
                  </p>
                </div>
              </div>
            ) : verification?.status === "approved" ? (
              <div className="news-manage__status news-manage__status--approved">
                <BadgeCheck size={21} strokeWidth={1.9} />
                <div>
                  <strong>
                    {verification.level === "trusted" ? "Trusted" : "Verified"} newsroom
                  </strong>
                  <p>
                    A visible certificate is attached to this channel. Trust reviews are
                    handled by the F News team as the newsroom grows.
                  </p>
                </div>
              </div>
            ) : (
              <div className="news-channel-form__note">
                <Sparkles size={16} strokeWidth={1.9} />
                <p>
                  Certificates are reviewed by F News. The publishing tools are the same; the
                  certificate makes a newsroom&apos;s record visible to readers.
                </p>
              </div>
            )}

            {!verificationLoading &&
            verification?.status !== "pending" &&
            verification?.status !== "approved" ? (
              <form className="news-channel-form" onSubmit={applyForVerification}>
                <div className="news-field">
                  <span>Requested certificate</span>
                  <div className="news-channel-form__categories">
                    {(["verified", "trusted"] as const).map((level) => (
                      <button
                        key={level}
                        type="button"
                        className={`news-sheet-chip${
                          verificationLevel === level ? " is-active" : ""
                        }`}
                        aria-pressed={verificationLevel === level}
                        disabled={!isOwner}
                        onClick={() => setVerificationLevel(level)}
                      >
                        {verificationLevel === level ? (
                          <Check size={12} strokeWidth={2.4} />
                        ) : null}
                        {level === "trusted" ? "Trusted" : "Verified"}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="news-field">
                  <span>Evidence for the review</span>
                  <textarea
                    value={evidence}
                    onChange={(event) => setEvidence(event.target.value)}
                    rows={5}
                    maxLength={1200}
                    placeholder="Describe the newsroom, its editorial record, public brand and where readers can verify it."
                    disabled={!isOwner}
                  />
                  <small>{evidence.length}/1200 · at least 20 characters</small>
                </label>

                {error ? (
                  <p className="news-form-error" role="alert">
                    {error}
                  </p>
                ) : null}

                <div className="news-sheet__actions">
                  <button type="button" className="news-button news-button--ghost" onClick={onClose}>
                    Close
                  </button>
                  <button
                    type="submit"
                    className="news-button news-button--blue"
                    disabled={!isOwner || busy === "verify"}
                  >
                    {busy === "verify" ? "Sending..." : "Apply for review"}
                    <ArrowRight size={15} strokeWidth={2.2} />
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        ) : null}

        {tab === "ownership" ? (
          <div className="news-channel-form">
            <div className="news-channel-form__note">
              <Users size={16} strokeWidth={1.9} />
              <p>
                A transfer changes only the owner. The channel name, handle, posts, media and
                subscribers stay linked to the same channel. The recipient has seven days to
                accept.
              </p>
            </div>

            {pendingTransfer ? (
              <div className="news-manage__status news-manage__status--pending">
                <Clock3 size={20} strokeWidth={1.9} />
                <div>
                  <strong>Transfer waiting for approval</strong>
                  <p>
                    The recipient must accept before {transferDate(pendingTransfer.expiresAt)}.
                    Sending a new request cancels this one.
                  </p>
                  {pendingTransfer.note ? <small>“{pendingTransfer.note}”</small> : null}
                </div>
              </div>
            ) : null}

            <form className="news-channel-form" onSubmit={sendTransfer}>
              <label className="news-field">
                <span>Recipient personal account</span>
                <div className="news-manage__search">
                  <input
                    type="text"
                    value={recipientQuery}
                    onChange={(event) => {
                      setRecipientQuery(event.target.value);
                      setRecipientResults([]);
                      setSelectedRecipient(null);
                      setRecipientSearched(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void searchRecipients();
                      }
                    }}
                    placeholder="Search by nickname, name or surname"
                    maxLength={60}
                    disabled={!isOwner}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="news-button news-button--ghost"
                    onClick={() => void searchRecipients()}
                    disabled={!isOwner || recipientSearching || recipientQuery.trim().length < 2}
                  >
                    <Search size={15} strokeWidth={2.2} />
                    {recipientSearching ? "Searching..." : "Find"}
                  </button>
                </div>
                <small>Channels cannot own channels. Pick a personal F App account.</small>
              </label>

              {recipientResults.length ? (
                <div className="news-manage__results" role="listbox" aria-label="Recipient results">
                  {recipientResults.map((recipient) => (
                    <button
                      key={recipient.id}
                      type="button"
                      role="option"
                      aria-selected={selectedRecipient?.id === recipient.id}
                      className={`news-manage__result${
                        selectedRecipient?.id === recipient.id ? " is-active" : ""
                      }`}
                      onClick={() => setSelectedRecipient(recipient)}
                    >
                      <span className="news-manage__result-avatar">
                        {recipient.avatar ? (
                          <img src={recipient.avatar} alt="" />
                        ) : (
                          <UserRound size={16} strokeWidth={1.9} />
                        )}
                      </span>
                      <span>
                        <b>{recipient.name}</b>
                        <small>@{recipient.nickname}</small>
                      </span>
                      {selectedRecipient?.id === recipient.id ? (
                        <Check size={15} strokeWidth={2.4} />
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : recipientSearched && !recipientSearching ? (
                <p className="news-manage__empty">No personal account matched this search.</p>
              ) : null}

              <label className="news-field">
                <span>Note for the recipient</span>
                <textarea
                  value={transferNote}
                  onChange={(event) => setTransferNote(event.target.value)}
                  rows={3}
                  maxLength={300}
                  placeholder="Optional context about the handover."
                  disabled={!isOwner}
                />
                <small>{transferNote.length}/300</small>
              </label>

              {error ? (
                <p className="news-form-error" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="news-sheet__actions">
                <button type="button" className="news-button news-button--ghost" onClick={onClose}>
                  Close
                </button>
                <button
                  type="submit"
                  className="news-button news-button--blue"
                  disabled={!isOwner || !selectedRecipient || busy === "transfer"}
                >
                  {busy === "transfer" ? "Sending..." : "Send transfer request"}
                  <ArrowRight size={15} strokeWidth={2.2} />
                </button>
              </div>
            </form>
          </div>
        ) : null}

        <div className="news-manage__footer">
          <Upload size={13} strokeWidth={2} />
          <span>Changes are saved to the live channel. The handle cannot be changed.</span>
        </div>
      </div>
    </Sheet>
  );
}
