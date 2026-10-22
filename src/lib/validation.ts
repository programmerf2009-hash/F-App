/* ==========================================================================
   Kiritish qoidalari — nickname, parol, ism, yosh
   ========================================================================== */

export const NICKNAME_MIN = 5;
export const NICKNAME_MAX = 24;
export const PASSWORD_MIN = 8;

/**
 * Nickname:
 *  - faqat kichik lotin harflari, raqamlar, `.` va `_`
 *  - kamida 2 ta harf
 *  - kamida 2 ta raqam
 *  - kamida bitta `.` yoki `_`
 */
const NICKNAME_PATTERN = /^(?=(?:[^a-z]*[a-z]){2})(?=(?:[^0-9]*[0-9]){2})(?=.*[._])[a-z0-9._]+$/;

export function normalizeNickname(value: string): string {
  return value.trim().toLowerCase();
}

export function validateNickname(value: string): string | null {
  const nickname = normalizeNickname(value);

  if (!nickname) return "Enter a nickname.";
  if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) {
    return `Nickname must be ${NICKNAME_MIN}-${NICKNAME_MAX} characters long.`;
  }
  if (!NICKNAME_PATTERN.test(nickname)) {
    return "Use lowercase letters, numbers, dots or underscores — at least 2 letters, 2 numbers and one dot or underscore.";
  }

  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length < PASSWORD_MIN) {
    return `Password must be at least ${PASSWORD_MIN} characters.`;
  }
  return null;
}

export function validateName(value: string, label: string): string | null {
  const name = value.trim();

  if (!name) return `Enter your ${label.toLowerCase()}.`;
  if (name.length < 2) return `${label} is too short.`;
  if (name.length > 40) return `${label} is too long.`;
  if (!/^[\p{L}\p{M}' -]+$/u.test(name)) return `${label} contains unsupported characters.`;

  return null;
}

export function validateAge(value: string): string | null {
  if (!value.trim()) return "Enter your age.";

  const age = Number(value);
  if (!Number.isInteger(age)) return "Age must be a whole number.";
  if (age < 1 || age > 120) return "Age must be between 1 and 120.";

  return null;
}
