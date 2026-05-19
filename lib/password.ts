export type PasswordCheck = {
  label: string;
  ok: boolean;
};

export function getPasswordChecks(password: string): PasswordCheck[] {
  return [
    { label: "8+ characters", ok: password.length >= 8 },
    { label: "one letter", ok: /[a-z]/i.test(password) },
    { label: "one number", ok: /\d/.test(password) }
  ];
}

export function isPasswordStrongEnough(password: string) {
  return getPasswordChecks(password).every((check) => check.ok);
}

export function getPasswordError(password: string) {
  if (isPasswordStrongEnough(password)) {
    return "";
  }

  const missing = getPasswordChecks(password)
    .filter((check) => !check.ok)
    .map((check) => check.label);

  return `Password must include ${missing.join(", ")}.`;
}
