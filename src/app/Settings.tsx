import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  Camera,
  Check,
  ChevronRight,
  Database,
  LogOut,
  Music2,
  Pause,
  Play,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { BottomNav, type Tab } from "../components/BottomNav";
import { Toast } from "../components/Toast";
import {
  getSongSignedUrl,
  removeFavoriteSong,
  updateProfile,
  uploadAvatar,
  uploadSong,
  type Gender,
  type Session,
  type SongMeta,
} from "../lib/auth";
import { clearRatesCache } from "../lib/rates";
import { MAX_SONG_BYTES, formatBytes, formatDuration } from "../lib/song-store";
import type { Theme } from "../lib/theme";
import { validateAge, validateName } from "../lib/validation";
import { clearWeatherCache } from "../lib/weather";
import "./settings.css";

const LOGO_SRC = `${import.meta.env.BASE_URL}brand/fapplogo2.png`;
const APP_VERSION = "0.1.0";

const GENDERS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const THEMES: { value: Theme; label: string }[] = [
  { value: "dark", label: "Midnight" },
  { value: "gold", label: "Gold" },
];

interface Props {
  session: Session;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onSessionChange: (session: Session) => void;
  onLogout: () => void;
  onNavigate: (tab: Tab) => void;
}

interface FormState {
  firstName: string;
  lastName: string;
  age: string;
  gender: Gender;
  bio: string;
  profession: string;
}

type FieldKey = "firstName" | "lastName" | "age" | "profession" | "photo" | "song";
type FieldErrors = Partial<Record<FieldKey, string>>;

function formFrom(session: Session): FormState {
  return {
    firstName: session.firstName,
    lastName: session.lastName,
    age: String(session.age),
    gender: session.gender,
    bio: session.bio,
    profession: session.profession,
  };
}

function genderLabel(value: Gender): string {
  return GENDERS.find((item) => item.value === value)?.label ?? "—";
}

function memberSince(session: Session): string {
  const date = new Date(session.createdAt);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function Settings({
  session,
  theme,
  onThemeChange,
  onSessionChange,
  onLogout,
  onNavigate,
}: Props) {
  const [form, setForm] = useState<FormState>(() => formFrom(session));
  const [baseline, setBaseline] = useState<FormState>(() => formFrom(session));
  const [saving, setSaving] = useState(false);

  const [photo, setPhoto] = useState<string | null>(session.photo);
  const [photoBusy, setPhotoBusy] = useState(false);

  const [song, setSong] = useState<SongMeta | null>(session.song);
  const [songUrl, setSongUrl] = useState<string | null>(null);
  const [songBusy, setSongBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [toast, setToast] = useState<string | null>(null);

  const photoInput = useRef<HTMLInputElement>(null);
  const songInput = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const urlRef = useRef<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      if (urlRef.current?.startsWith("blob:")) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const applyAudioUrl = useCallback((url: string | null) => {
    if (urlRef.current && urlRef.current !== url && urlRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(urlRef.current);
    }
    urlRef.current = url;
    setSongUrl(url);
    setPlaying(false);
    setProgress(0);
  }, []);

  /* Supabase Storage'dan imzolangan havolani olamiz. */
  useEffect(() => {
    if (!song) {
      applyAudioUrl(null);
      return;
    }

    let cancelled = false;
    applyAudioUrl(null);

    getSongSignedUrl(song.path)
      .then((url) => {
        if (!cancelled) applyAudioUrl(url);
      })
      .catch(() => {
        if (!cancelled) showToast("Could not load the song.");
      });

    return () => {
      cancelled = true;
    };
  }, [song, applyAudioUrl, showToast]);

  /* ------------------------------------------------------------- rasm */

  const handlePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setPhotoBusy(true);
    try {
      const next = await uploadAvatar(file);
      if (!next.photo) throw new Error("Could not save the photo.");

      setPhoto(next.photo);
      setErrors((previous) => ({ ...previous, photo: undefined }));
      onSessionChange(next);
      showToast("Profile photo updated");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not use this image.");
    } finally {
      setPhotoBusy(false);
    }
  };

  /* ------------------------------------------------------------ musiqa */

  const handleSong = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("audio/")) {
      showToast("Choose an audio file (MP3, M4A, WAV).");
      return;
    }
    if (file.size > MAX_SONG_BYTES) {
      showToast("Audio is larger than 12 MB.");
      return;
    }

    setSongBusy(true);
    try {
      const next = await uploadSong(file);
      if (!next.song) throw new Error("Could not save the song.");

      audioRef.current?.pause();
      setSong(next.song);
      setErrors((previous) => ({ ...previous, song: undefined }));
      onSessionChange(next);
      showToast("Favorite song saved");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save this audio file.");
    } finally {
      setSongBusy(false);
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) {
      showToast("Song is still loading");
      return;
    }

    if (audio.paused) {
      audio
        .play()
        .then(() => setPlaying(true))
        .catch(() => showToast("This file cannot be played here."));
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const handleRemoveSong = async () => {
    setSongBusy(true);
    try {
      const next = await removeFavoriteSong();
      onSessionChange(next);

      audioRef.current?.pause();
      applyAudioUrl(null);
      setSong(null);
      showToast("Favorite song removed");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not remove the song.");
    } finally {
      setSongBusy(false);
    }
  };

  const seek = (value: number) => {
    setProgress(value);
    if (audioRef.current) audioRef.current.currentTime = value;
  };

  /* ------------------------------------------------------------ saqlash */

  const handleSave = async () => {
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const profession = form.profession.trim();
    const bio = form.bio.trim();

    const nextErrors: FieldErrors = {};

    const firstNameError = validateName(firstName, "First name");
    if (firstNameError) nextErrors.firstName = firstNameError;

    const lastNameError = validateName(lastName, "Last name");
    if (lastNameError) nextErrors.lastName = lastNameError;

    const ageError = validateAge(form.age);
    if (ageError) nextErrors.age = ageError;

    if (!profession) nextErrors.profession = "Enter your profession.";
    else if (profession.length < 2) nextErrors.profession = "Profession is too short.";
    else if (profession.length > 60) nextErrors.profession = "Profession is too long.";

    if (!photo) nextErrors.photo = "Add a profile photo.";
    if (!song) nextErrors.song = "Upload your favorite song.";

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      showToast("Fill the required fields first");
      return;
    }

    setSaving(true);
    try {
      const next = await updateProfile({
        firstName,
        lastName,
        age: Number(form.age),
        gender: form.gender,
        bio,
        profession,
      });

      const saved: FormState = { ...form, firstName, lastName, bio, profession };
      setForm(saved);
      setBaseline(saved);
      onSessionChange(next);
      showToast("Changes saved");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save changes");
    } finally {
      setSaving(false);
    }
  };

  /* -------------------------------------------------------------- kesh */

  const handleClearCache = () => {
    clearRatesCache();
    clearWeatherCache();
    showToast("Cache cleared");
  };

  /* ---------------------------------------------------------------- UI */

  const checks = [
    { key: "photo", label: "Photo", done: Boolean(photo) },
    { key: "firstName", label: "First name", done: Boolean(form.firstName.trim()) },
    { key: "lastName", label: "Last name", done: Boolean(form.lastName.trim()) },
    { key: "age", label: "Age", done: Boolean(form.age) && Number(form.age) > 0 },
    { key: "profession", label: "Profession", done: Boolean(form.profession.trim()) },
    { key: "song", label: "Favorite song", done: Boolean(song) },
    { key: "bio", label: "Bio", done: Boolean(form.bio.trim()) },
  ];

  const completed = checks.filter((item) => item.done).length;
  const percent = Math.round((completed / checks.length) * 100);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);

  const displayName =
    `${form.firstName.trim()} ${form.lastName.trim()}`.trim() || "Your profile";

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  };

  return (
    <div className="settings" data-theme={theme}>
      <div className="settings__glow settings__glow--one" aria-hidden="true" />
      <div className="settings__glow settings__glow--two" aria-hidden="true" />

      <header className="settings__header">
        <div className="settings__brand">
          <img
            className="settings__logo"
            src={LOGO_SRC}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
          <span className="settings__wordmark">F App</span>
        </div>
        <span className="settings__badge">Settings</span>
      </header>

      <main className="settings__main">
        <div className="settings__head">
          <p className="settings__eyebrow">Account</p>
          <h1 className="settings__title">Settings</h1>
          <p className="settings__sub">Your profile, appearance and app preferences.</p>
        </div>

        <div className="settings__col settings__col--main">
          {/* ------------------------------------------------------- overview */}
          <section className="panel panel--overview" aria-labelledby="overview-title">
          <h2 className="sr-title" id="overview-title">
            Account overview
          </h2>

          <div className="me">
            <button
              type="button"
              className="me__photo"
              onClick={() => photoInput.current?.click()}
              aria-label={photo ? "Change profile photo" : "Add profile photo"}
              disabled={photoBusy}
            >
              {photo ? (
                <img src={photo} alt="Profile" />
              ) : (
                <span className="me__placeholder">
                  <UserRound size={30} strokeWidth={1.8} />
                </span>
              )}
              <span className="me__camera" aria-hidden="true">
                <Camera size={13} strokeWidth={2.2} />
              </span>
            </button>

            <div className="me__id">
              <h3 className="me__name">{displayName}</h3>
              <p className="me__nick">@{session.nickname}</p>
              <p className="me__meta">
                {form.age || "—"} years · {genderLabel(form.gender)}
              </p>
              <button
                type="button"
                className="me__change"
                onClick={() => photoInput.current?.click()}
                disabled={photoBusy}
              >
                {photoBusy ? "Processing…" : photo ? "Change photo" : "Add photo"}
              </button>
            </div>
          </div>

          {errors.photo ? <p className="field__error me__error">{errors.photo}</p> : null}

          <div className="meter">
            <div className="meter__top">
              <span>Profile completeness</span>
              <strong>{percent}%</strong>
            </div>
            <div
              className="meter__track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <span style={{ width: `${percent}%` }} />
            </div>
            <ul className="meter__list">
              {checks.map((item) => (
                <li key={item.key} className={`meter__item${item.done ? " is-done" : ""}`}>
                  {item.done ? <Check size={11} strokeWidth={2.6} /> : <X size={11} strokeWidth={2.6} />}
                  {item.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="me__foot">
            <span>Member since</span>
            <strong>{memberSince(session)}</strong>
          </div>
        </section>

        {/* -------------------------------------------------------- profile */}
        <section className="panel panel--profile" aria-labelledby="profile-title">
          <div className="panel__head">
            <div>
              <h2 className="panel__title" id="profile-title">
                Profile
              </h2>
              <p className="panel__hint">Name, age, photo, profession and one favorite song.</p>
            </div>
          </div>

          <div className="form-grid">
            <label className="field">
              <span className="field__label">
                First name <span className="field__req">*</span>
              </span>
              <input
                className={`input${errors.firstName ? " is-error" : ""}`}
                value={form.firstName}
                onChange={(event) => update("firstName", event.target.value)}
                autoComplete="given-name"
              />
              {errors.firstName ? <span className="field__error">{errors.firstName}</span> : null}
            </label>

            <label className="field">
              <span className="field__label">
                Last name <span className="field__req">*</span>
              </span>
              <input
                className={`input${errors.lastName ? " is-error" : ""}`}
                value={form.lastName}
                onChange={(event) => update("lastName", event.target.value)}
                autoComplete="family-name"
              />
              {errors.lastName ? <span className="field__error">{errors.lastName}</span> : null}
            </label>

            <label className="field">
              <span className="field__label">
                Age <span className="field__req">*</span>
              </span>
              <input
                className={`input${errors.age ? " is-error" : ""}`}
                value={form.age}
                onChange={(event) => update("age", event.target.value)}
                inputMode="numeric"
                type="number"
                min={1}
                max={120}
              />
              {errors.age ? <span className="field__error">{errors.age}</span> : null}
            </label>

            <div className="field">
              <span className="field__label">Gender</span>
              <div className="seg" role="group" aria-label="Gender">
                {GENDERS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`seg__item${form.gender === item.value ? " is-active" : ""}`}
                    aria-pressed={form.gender === item.value}
                    onClick={() => update("gender", item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="field">
            <span className="field__label">
              Bio <span className="field__optional">Optional</span>
            </span>
            <textarea
              className="input input--area"
              value={form.bio}
              onChange={(event) => update("bio", event.target.value)}
              maxLength={160}
              rows={3}
              placeholder="A short line about yourself"
            />
            <span className="field__count">{form.bio.length}/160</span>
          </label>

          <label className="field">
            <span className="field__label">
              Profession <span className="field__req">*</span>
            </span>
            <input
              className={`input${errors.profession ? " is-error" : ""}`}
              value={form.profession}
              onChange={(event) => update("profession", event.target.value)}
              maxLength={60}
              placeholder="e.g. Product designer"
              autoComplete="organization-title"
            />
            {errors.profession ? (
              <span className="field__error">{errors.profession}</span>
            ) : null}
          </label>

          <div className="song">
            <div className="song__head">
              <span className="song__icon" aria-hidden="true">
                <Music2 size={18} strokeWidth={2} />
              </span>
              <div className="song__id">
                <p className="song__title">
                  Favorite song <span className="field__req">*</span>
                </p>
                <p className="song__sub">
                  {song
                    ? `${song.name} · ${formatDuration(song.duration)} · ${formatBytes(song.size)}`
                    : "One audio file, up to 12 MB"}
                </p>
              </div>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => songInput.current?.click()}
                disabled={songBusy}
              >
                {songBusy ? "Saving…" : song ? "Replace" : "Upload"}
              </button>
            </div>

            {errors.song ? <p className="field__error song__error">{errors.song}</p> : null}

            {song && songUrl ? (
              <div className="player">
                <button
                  type="button"
                  className="player__btn"
                  onClick={togglePlay}
                  aria-label={playing ? "Pause" : "Play"}
                >
                  {playing ? (
                    <Pause size={15} strokeWidth={2.4} fill="currentColor" />
                  ) : (
                    <Play size={15} strokeWidth={2.4} fill="currentColor" />
                  )}
                </button>

                <div className="player__body">
                  <input
                    className="player__seek"
                    type="range"
                    min={0}
                    max={song.duration > 0 ? song.duration : 0}
                    step={0.1}
                    value={Math.min(progress, song.duration || 0)}
                    onChange={(event) => seek(Number(event.target.value))}
                    aria-label="Song position"
                  />
                  <div className="player__times">
                    <span>{formatDuration(progress)}</span>
                    <span>{formatDuration(song.duration)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="player__remove"
                  onClick={handleRemoveSong}
                  aria-label="Remove favorite song"
                  disabled={songBusy}
                >
                  <Trash2 size={15} strokeWidth={2} />
                </button>
              </div>
            ) : null}

            <audio
              ref={audioRef}
              src={songUrl ?? undefined}
              preload="metadata"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                setPlaying(false);
                setProgress(0);
              }}
              onTimeUpdate={() => setProgress(audioRef.current?.currentTime ?? 0)}
              hidden
            />
          </div>

          <div className="panel__foot">
            <p className={`panel__note${dirty ? " is-dirty" : ""}`}>
              {saving ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}
            </p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void handleSave()}
              disabled={!dirty || saving}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </section>
        </div>

        <div className="settings__col settings__col--side">
        {/* ------------------------------------------------------ appearance */}
        <section className="panel panel--appearance" aria-labelledby="appearance-title">
          <div className="panel__head">
            <div>
              <h2 className="panel__title" id="appearance-title">
                Appearance
              </h2>
              <p className="panel__hint">Choose how F App looks on this device.</p>
            </div>
          </div>

          <div className="themes">
            {THEMES.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`theme${theme === item.value ? " is-active" : ""}`}
                aria-pressed={theme === item.value}
                onClick={() => onThemeChange(item.value)}
              >
                <span className={`theme__preview theme__preview--${item.value}`} aria-hidden="true">
                  <span className="theme__bar" />
                  <span className="theme__card" />
                </span>
                <span className="theme__label">{item.label}</span>
                {theme === item.value ? (
                  <span className="theme__check" aria-hidden="true">
                    <Check size={12} strokeWidth={3} />
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <p className="panel__hint panel__hint--foot">Saved automatically for this device.</p>
        </section>

        {/* ------------------------------------------------------------- app */}
        <section className="panel panel--app" aria-labelledby="app-title">
          <div className="panel__head">
            <div>
              <h2 className="panel__title" id="app-title">
                App
              </h2>
              <p className="panel__hint">Storage and version.</p>
            </div>
          </div>

          <button type="button" className="row" onClick={handleClearCache}>
            <span className="row__icon" aria-hidden="true">
              <Database size={16} strokeWidth={2} />
            </span>
            <span className="row__text">
              <b>Clear cache</b>
              <small>Exchange rates and weather</small>
            </span>
            <ChevronRight className="row__chev" size={16} aria-hidden="true" />
          </button>

          <div className="row">
            <span className="row__icon" aria-hidden="true">
              <span className="row__version">F</span>
            </span>
            <span className="row__text">
              <b>Version</b>
              <small>F App {APP_VERSION}</small>
            </span>
          </div>

          <p className="panel__hint panel__hint--foot">
            Rates by cbu.uz · Weather by open-meteo.com
          </p>
        </section>

        {/* --------------------------------------------------------- account */}
        <section className="panel panel--account" aria-labelledby="account-title">
          <div className="panel__head">
            <div>
              <h2 className="panel__title" id="account-title">
                Account
              </h2>
              <p className="panel__hint">Signed in as @{session.nickname}</p>
            </div>
          </div>

          <button type="button" className="btn btn--danger" onClick={onLogout}>
            <LogOut size={16} strokeWidth={2.1} />
            Log out
          </button>
        </section>
        </div>
      </main>

      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        onChange={handlePhoto}
        hidden
      />
      <input ref={songInput} type="file" accept="audio/*" onChange={handleSong} hidden />

      <BottomNav active="settings" onNavigate={onNavigate} />
      <Toast message={toast} />
    </div>
  );
}
