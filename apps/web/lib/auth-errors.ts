const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Nieprawidłowy e-mail lub hasło.",
  INVALID_EMAIL: "Podaj poprawny adres e-mail.",
  INVALID_PASSWORD: "Nieprawidłowe hasło.",
  USER_ALREADY_EXISTS: "Konto z tym adresem e-mail już istnieje.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Konto z tym adresem e-mail już istnieje.",
  PASSWORD_TOO_SHORT: "Hasło musi mieć co najmniej 12 znaków.",
  PASSWORD_TOO_LONG: "Hasło jest za długie.",
  USER_NOT_FOUND: "Nieprawidłowy e-mail lub hasło.",
};

export function authErrorMessage(
  error: { code?: string; message?: string } | null | undefined,
  fallback: string,
): string {
  if (!error) return fallback;
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  return error.message ?? fallback;
}
