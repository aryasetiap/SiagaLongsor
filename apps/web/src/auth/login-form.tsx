'use client';

import { type FormEvent, useState } from 'react';

import { getLoginErrorMessage } from './auth-context';
import type { LoginInput } from './auth-types';

interface LoginFormProps {
  readonly message?: string | null;
  onLogin(input: LoginInput): Promise<void>;
  onSuccess(): void;
}

interface FieldErrors {
  readonly email?: string | undefined;
  readonly password?: string | undefined;
}

export function LoginForm({ message, onLogin, onSuccess }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const errors = validateLogin(email, password);
    setFieldErrors(errors);
    setSubmissionError(null);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      await onLogin({ email: email.trim(), password });
      onSuccess();
    } catch (error) {
      setSubmissionError(getLoginErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  const visibleMessage = submissionError ?? message;

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
      {visibleMessage !== null && visibleMessage !== undefined && (
        <div
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
          role="alert"
        >
          {visibleMessage}
        </div>
      )}

      <div>
        <label className="mb-2 block text-sm font-semibold text-slate-800" htmlFor="email">
          Alamat email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          aria-describedby={fieldErrors.email === undefined ? undefined : 'email-error'}
          aria-invalid={fieldErrors.email !== undefined}
          onChange={(event) => {
            setEmail(event.target.value);
            setFieldErrors((current) => ({ ...current, email: undefined }));
          }}
          className="auth-input"
          placeholder="nama@sekolah.sch.id"
        />
        {fieldErrors.email !== undefined && (
          <p className="mt-2 text-sm text-red-700" id="email-error">
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="block text-sm font-semibold text-slate-800" htmlFor="password">
            Kata sandi
          </label>
          <span className="text-xs text-slate-500">Peka huruf besar dan kecil</span>
        </div>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            aria-describedby={fieldErrors.password === undefined ? undefined : 'password-error'}
            aria-invalid={fieldErrors.password !== undefined}
            onChange={(event) => {
              setPassword(event.target.value);
              setFieldErrors((current) => ({ ...current, password: undefined }));
            }}
            className="auth-input pr-24"
            placeholder="Masukkan kata sandi"
          />
          <button
            type="button"
            aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute inset-y-1.5 right-1.5 rounded-xl px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {showPassword ? 'Sembunyikan' : 'Tampilkan'}
          </button>
        </div>
        {fieldErrors.password !== undefined && (
          <p className="mt-2 text-sm text-red-700" id="password-error">
            {fieldErrors.password}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl bg-[#17211f] px-5 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(18,31,29,.18)] transition hover:bg-[#263632] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-65"
      >
        {submitting && (
          <span
            className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
            aria-hidden="true"
          />
        )}
        {submitting ? 'Memverifikasi…' : 'Masuk ke SiagaLongsor'}
      </button>

      <p className="text-center text-xs leading-5 text-slate-500">
        Akses hanya untuk pengguna yang telah terdaftar. Hubungi Project Owner bila Anda mengalami
        kendala akun.
      </p>
    </form>
  );
}

function validateLogin(email: string, password: string): FieldErrors {
  const errors: { email?: string; password?: string } = {};
  const normalizedEmail = email.trim();

  if (normalizedEmail.length === 0) {
    errors.email = 'Email wajib diisi.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    errors.email = 'Masukkan format email yang valid.';
  }

  if (password.length === 0) {
    errors.password = 'Kata sandi wajib diisi.';
  }

  return errors;
}
