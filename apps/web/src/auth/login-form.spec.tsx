import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiClient, ApiClientError } from './api-client';
import { LoginForm } from './login-form';

describe('LoginForm', () => {
  it('validates required fields and an invalid email format', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    render(<LoginForm onLogin={onLogin} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Masuk ke Dashboard' }));
    expect(screen.getByText('Email wajib diisi.')).toBeInTheDocument();
    expect(screen.getByText('Kata sandi wajib diisi.')).toBeInTheDocument();
    expect(onLogin).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Alamat email'), 'bukan-email');
    await user.type(screen.getByLabelText('Kata sandi'), 'password');
    await user.click(screen.getByRole('button', { name: 'Masuk ke Dashboard' }));
    expect(screen.getByText('Masukkan format email yang valid.')).toBeInTheDocument();
  });

  it('submits valid credentials once and supports an accessible password visibility control', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    render(<LoginForm onLogin={onLogin} onSuccess={onSuccess} />);

    const password = screen.getByLabelText('Kata sandi');
    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Tampilkan kata sandi' }));
    expect(password).toHaveAttribute('type', 'text');
    await user.type(screen.getByLabelText('Alamat email'), 'admin@example.invalid');
    await user.type(password, 'secret-value');
    await user.click(screen.getByRole('button', { name: 'Masuk ke Dashboard' }));

    expect(onLogin).toHaveBeenCalledWith({
      email: 'admin@example.invalid',
      password: 'secret-value',
    });
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('connects a valid form submission to the configured backend login URL', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: 'memory-only-token',
            expiresIn: 900,
            tokenType: 'Bearer',
            user: principal,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(principal), { status: 200 }));
    const client = new ApiClient('http://localhost:3001/api/v1', fetchMock);
    render(
      <LoginForm
        onLogin={async (input) => {
          await client.login(input);
        }}
        onSuccess={vi.fn()}
      />,
    );

    await fillAndSubmit(user, 'valid-password');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost:3001/api/v1/auth/login');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'include',
      method: 'POST',
    });
  });

  it('uses one generic message for rejected credentials', async () => {
    const user = userEvent.setup();
    const onLogin = vi
      .fn()
      .mockRejectedValue(new ApiClientError('USER_DISABLED', 'api', 401, 'INVALID_CREDENTIALS'));
    render(<LoginForm onLogin={onLogin} onSuccess={vi.fn()} />);

    await fillAndSubmit(user);

    expect(screen.getByRole('alert')).toHaveTextContent('Email atau kata sandi tidak valid.');
    expect(screen.queryByText('USER_DISABLED')).not.toBeInTheDocument();
  });

  it('shows a distinct availability message when the API cannot be reached', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn().mockRejectedValue(new ApiClientError('offline', 'network'));
    render(<LoginForm onLogin={onLogin} onSuccess={vi.fn()} />);

    await fillAndSubmit(user);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Layanan Teknila Siaga Longsor tidak dapat dihubungi',
    );
  });

  it('shows a safe rate-limit message for HTTP 429', async () => {
    const user = userEvent.setup();
    const onLogin = vi
      .fn()
      .mockRejectedValue(new ApiClientError('internal rate-limit detail', 'api', 429));
    render(<LoginForm onLogin={onLogin} onSuccess={vi.fn()} />);

    await fillAndSubmit(user);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Terlalu banyak percobaan masuk. Tunggu beberapa saat lalu coba kembali.',
    );
    expect(screen.queryByText('internal rate-limit detail')).not.toBeInTheDocument();
  });

  it('disables repeated submission while login is pending', async () => {
    const user = userEvent.setup();
    let finishLogin: (() => void) | undefined;
    const onLogin = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishLogin = resolve;
        }),
    );
    render(<LoginForm onLogin={onLogin} onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText('Alamat email'), 'admin@example.invalid');
    await user.type(screen.getByLabelText('Kata sandi'), 'secret-value');
    const submit = screen.getByRole('button', { name: 'Masuk ke Dashboard' });
    await user.click(submit);

    expect(screen.getByRole('button', { name: 'Memverifikasi…' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Memverifikasi…' }));
    expect(onLogin).toHaveBeenCalledOnce();
    finishLogin?.();
  });
});

const principal = {
  id: 'user-1',
  email: 'admin@example.invalid',
  name: 'Admin Sekolah',
  memberships: [
    {
      organizationId: 'org-1',
      organizationName: 'SMAN 17 Bandar Lampung',
      role: 'SCHOOL_ADMIN' as const,
    },
  ],
};

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  password = 'wrong-password',
): Promise<void> {
  await user.type(screen.getByLabelText('Alamat email'), 'admin@example.invalid');
  await user.type(screen.getByLabelText('Kata sandi'), password);
  await user.click(screen.getByRole('button', { name: 'Masuk ke Dashboard' }));
}
