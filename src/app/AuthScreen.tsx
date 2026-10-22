import { useState, type FormEvent } from "react";
import { ArrowLeft, AtSign, Cake, Eye, EyeOff, Lock, User } from "lucide-react";
import { CosmicBackground } from "../components/CosmicBackground";
import { logIn, signUp, type Gender, type Session } from "../lib/auth";
import { validateAge, validateName, validateNickname, validatePassword } from "../lib/validation";
import "./auth.css";

const LOGO_SRC = `${import.meta.env.BASE_URL}brand/fapplogo2.png`;

type Mode = "login" | "signup";

const GENDERS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

interface Props {
  onAuthenticated: (session: Session) => void;
}

interface FieldErrors {
  firstName?: string;
  lastName?: string;
  age?: string;
  gender?: string;
  nickname?: string;
  password?: string;
}

export function AuthScreen({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Kirish */
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);

  /* Ro'yxatdan o'tish */
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [newNickname, setNewNickname] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newReveal, setNewReveal] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setFieldErrors({});
  };

  const handleNicknameChange = (value: string) => {
    setNickname(value.toLowerCase().replace(/\s+/g, ""));
    setError(null);
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const nicknameIssue = validateNickname(nickname);
    if (nicknameIssue) {
      setError(nicknameIssue);
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }

    setBusy(true);
    const result = await logIn(nickname, password);
    setBusy(false);

    if (result.ok) onAuthenticated(result.session);
    else setError(result.error);
  };

  const handleSignUp = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const next: FieldErrors = {};
    const firstNameIssue = validateName(firstName, "First name");
    const lastNameIssue = validateName(lastName, "Last name");
    const ageIssue = validateAge(age);
    const nicknameIssue = validateNickname(newNickname);
    const passwordIssue = validatePassword(newPassword);

    if (firstNameIssue) next.firstName = firstNameIssue;
    if (lastNameIssue) next.lastName = lastNameIssue;
    if (ageIssue) next.age = ageIssue;
    if (!gender) next.gender = "Select gender.";
    if (nicknameIssue) next.nickname = nicknameIssue;
    if (passwordIssue) next.password = passwordIssue;

    setFieldErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    const result = await signUp({
      firstName,
      lastName,
      age: Number(age),
      gender: gender as Gender,
      nickname: newNickname,
      password: newPassword,
    });
    setBusy(false);

    if (result.ok) {
      onAuthenticated(result.session);
      return;
    }

    setError(result.error);
    if (result.field === "nickname") setFieldErrors({ nickname: result.error });
  };

  return (
    <div className="auth">
      <div className="auth__bg">
        <CosmicBackground />
      </div>

      <div className="auth__viewport">
        <div className={`auth__card${mode === "signup" ? " auth__card--wide" : ""}`}>
          {mode === "signup" && (
            <button
              type="button"
              className="auth__back"
              onClick={() => switchMode("login")}
              aria-label="Back to log in"
            >
              <ArrowLeft size={18} strokeWidth={2} />
              <span>Back</span>
            </button>
          )}

          <header className={`auth__brand${mode === "signup" ? " auth__brand--compact" : ""}`}>
            <img className="auth__logo" src={LOGO_SRC} alt="" draggable={false} />
            <span className="auth__wordmark">F App</span>
          </header>

          {mode === "login" ? (
            <>
              <form className="auth__form" onSubmit={handleLogin} noValidate>
                <div className="field">
                  <span className="field__icon">
                    <AtSign size={19} strokeWidth={1.9} />
                  </span>

                  <input
                    className="field__input"
                    type="text"
                    name="nickname"
                    placeholder="Nickname"
                    value={nickname}
                    onChange={(event) => handleNicknameChange(event.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-invalid={Boolean(error)}
                  />
                </div>

                <div className="field">
                  <span className="field__icon">
                    <Lock size={19} strokeWidth={1.9} />
                  </span>

                  <input
                    className="field__input"
                    type={reveal ? "text" : "password"}
                    name="password"
                    placeholder="Password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    aria-invalid={Boolean(error)}
                  />

                  <button
                    type="button"
                    className="field__action"
                    onClick={() => setReveal((visible) => !visible)}
                    aria-label={reveal ? "Hide password" : "Show password"}
                  >
                    {reveal ? <EyeOff size={19} strokeWidth={1.9} /> : <Eye size={19} strokeWidth={1.9} />}
                  </button>
                </div>

                {error && (
                  <p className="auth__error" role="alert">
                    {error}
                  </p>
                )}

                <button className="auth__submit" type="submit" disabled={busy}>
                  {busy ? "Please wait" : "Log In"}
                </button>
              </form>

              <button
                className="auth__secondary"
                type="button"
                onClick={() => switchMode("signup")}
              >
                Sign Up
              </button>
            </>
          ) : (
            <>
              <h1 className="auth__title">Create account</h1>
              <p className="auth__subtitle">No email or phone needed — just a nickname.</p>

              <form className="auth__form auth__form--signup" onSubmit={handleSignUp} noValidate>
                <div className="auth__row">
                  <div className="field">
                    <span className="field__icon">
                      <User size={19} strokeWidth={1.9} />
                    </span>
                    <input
                      className="field__input"
                      type="text"
                      name="firstName"
                      placeholder="First name"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      autoComplete="given-name"
                      aria-invalid={Boolean(fieldErrors.firstName)}
                    />
                  </div>

                  <div className="field">
                    <span className="field__icon">
                      <User size={19} strokeWidth={1.9} />
                    </span>
                    <input
                      className="field__input"
                      type="text"
                      name="lastName"
                      placeholder="Last name"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      autoComplete="family-name"
                      aria-invalid={Boolean(fieldErrors.lastName)}
                    />
                  </div>
                </div>

                {(fieldErrors.firstName || fieldErrors.lastName) && (
                  <p className="auth__error">{fieldErrors.firstName ?? fieldErrors.lastName}</p>
                )}

                <div className="field">
                  <span className="field__icon">
                    <Cake size={19} strokeWidth={1.9} />
                  </span>
                  <input
                    className="field__input"
                    type="number"
                    name="age"
                    placeholder="Age"
                    value={age}
                    onChange={(event) => setAge(event.target.value)}
                    min={1}
                    max={120}
                    inputMode="numeric"
                    aria-invalid={Boolean(fieldErrors.age)}
                  />
                </div>

                {fieldErrors.age && <p className="auth__error">{fieldErrors.age}</p>}

                <div className="auth__gender">
                  <span className="auth__label">Gender</span>
                  <div className="auth__chips" role="radiogroup" aria-label="Gender">
                    {GENDERS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={gender === option.value}
                        className={`chip${gender === option.value ? " is-active" : ""}`}
                        onClick={() => {
                          setGender(option.value);
                          setFieldErrors((current) => ({ ...current, gender: undefined }));
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {fieldErrors.gender && <p className="auth__error">{fieldErrors.gender}</p>}

                <div className="field">
                  <span className="field__icon">
                    <AtSign size={19} strokeWidth={1.9} />
                  </span>
                  <input
                    className="field__input"
                    type="text"
                    name="newNickname"
                    placeholder="Nickname"
                    value={newNickname}
                    onChange={(event) =>
                      setNewNickname(event.target.value.toLowerCase().replace(/\s+/g, ""))
                    }
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-invalid={Boolean(fieldErrors.nickname)}
                  />
                </div>

                <p className={`auth__hint${fieldErrors.nickname ? " is-error" : ""}`}>
                  {fieldErrors.nickname ??
                    "Lowercase only · 2+ letters · 2+ numbers · one dot or underscore"}
                </p>

                <div className="field">
                  <span className="field__icon">
                    <Lock size={19} strokeWidth={1.9} />
                  </span>
                  <input
                    className="field__input"
                    type={newReveal ? "text" : "password"}
                    name="newPassword"
                    placeholder="Password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    aria-invalid={Boolean(fieldErrors.password)}
                  />
                  <button
                    type="button"
                    className="field__action"
                    onClick={() => setNewReveal((visible) => !visible)}
                    aria-label={newReveal ? "Hide password" : "Show password"}
                  >
                    {newReveal ? (
                      <EyeOff size={19} strokeWidth={1.9} />
                    ) : (
                      <Eye size={19} strokeWidth={1.9} />
                    )}
                  </button>
                </div>

                <p className={`auth__hint${fieldErrors.password ? " is-error" : ""}`}>
                  {fieldErrors.password ?? "At least 8 characters."}
                </p>

                {error && (
                  <p className="auth__error" role="alert">
                    {error}
                  </p>
                )}

                <button className="auth__submit" type="submit" disabled={busy}>
                  {busy ? "Please wait" : "Create account"}
                </button>
              </form>

              <p className="auth__switch">
                Already have an account?{" "}
                <button type="button" className="auth__link" onClick={() => switchMode("login")}>
                  Log In
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
