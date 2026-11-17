import { DEFAULT_MIN_PASSWORD_LENGTH } from '@convex-dev/auth/methods/username-password';

export const MAX_PASSWORD_LENGTH = 100;

export interface PasswordRuleResult {
  id: 'length' | 'casing' | 'numberOrSymbol' | 'noEdgeWhitespace';
  label: string;
  met: boolean;
}

export type PasswordStrengthLevel = 'empty' | 'weak' | 'fair' | 'strong';
export type ConfirmPasswordState = 'empty' | 'matching' | 'mismatch';

export interface PasswordEvaluation {
  rules: PasswordRuleResult[];
  passedRuleCount: number;
  strength: PasswordStrengthLevel;
  strengthLabel: string;
  meetsSecurityStandards: boolean;
  confirmState: ConfirmPasswordState;
  passwordsMatch: boolean;
  confirmMessage: string;
}

export function evaluateSignupPassword(
  password: string,
  confirmPassword: string,
  minLength: number = DEFAULT_MIN_PASSWORD_LENGTH
): PasswordEvaluation {
  const codePointLength = Array.from(password).length;
  const hasInput = codePointLength > 0;

  const lengthMet =
    codePointLength >= minLength && codePointLength <= MAX_PASSWORD_LENGTH;
  const casingMet = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const numberOrSymbolMet =
    /[0-9]/.test(password) || /[^A-Za-z0-9\s]/.test(password);
  const noEdgeWhitespaceMet = hasInput && !/^\s|\s$/u.test(password);

  const rules: PasswordRuleResult[] = [
    {
      id: 'length',
      label: `At least ${minLength} characters`,
      met: lengthMet,
    },
    {
      id: 'casing',
      label: 'Uppercase & lowercase letters',
      met: casingMet,
    },
    {
      id: 'numberOrSymbol',
      label: 'At least 1 number or symbol',
      met: numberOrSymbolMet,
    },
    {
      id: 'noEdgeWhitespace',
      label: 'No leading or trailing spaces',
      met: noEdgeWhitespaceMet,
    },
  ];

  const passedRuleCount = hasInput ? rules.filter((r) => r.met).length : 0;
  const meetsSecurityStandards = hasInput && passedRuleCount === rules.length;

  let strength: PasswordStrengthLevel = 'empty';
  let strengthLabel = 'Enter a password';
  if (hasInput) {
    if (meetsSecurityStandards) {
      strength = 'strong';
      strengthLabel = 'Meets security standards';
    } else if (passedRuleCount >= 2) {
      strength = 'fair';
      strengthLabel = 'Almost meets security standards';
    } else {
      strength = 'weak';
      strengthLabel = 'Does not meet security standards';
    }
  }

  let confirmState: ConfirmPasswordState = 'empty';
  let passwordsMatch = false;
  let confirmMessage = 'Re-enter password to confirm';

  if (confirmPassword.length > 0) {
    if (hasInput && password === confirmPassword) {
      confirmState = 'matching';
      passwordsMatch = true;
      confirmMessage = 'Passwords match';
    } else {
      confirmState = 'mismatch';
      passwordsMatch = false;
      confirmMessage = 'Passwords do not match';
    }
  }

  return {
    rules,
    passedRuleCount,
    strength,
    strengthLabel,
    meetsSecurityStandards,
    confirmState,
    passwordsMatch,
    confirmMessage,
  };
}
