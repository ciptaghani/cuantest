'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from './actions';

export function LoginForm() {
  const router = useRouter();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  return (
    <form
      className="mt-4 flex flex-col gap-3"
      autoComplete="on"
      onSubmit={(e) => {
        e.preventDefault();
        setPending(true);
        setError('');
        login(user, pass).then((r) => {
          setPending(false);
          if (!r.ok) setError(r.error);
          else router.replace(r.data?.path || '/');
        });
      }}
    >
      <label className="field">
        <span>ID</span>
        <input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" required autoFocus autoCapitalize="none" spellCheck={false} />
      </label>
      <label className="field">
        <span>Password</span>
        <input value={pass} onChange={(e) => setPass(e.target.value)} type="password" autoComplete="current-password" required />
      </label>
      <p className="note min-h-5 !text-loss" role="alert">
        {error}
      </p>
      <button className="btn w-full" type="submit" disabled={pending}>
        {pending ? 'Memeriksa…' : 'Masuk'}
      </button>
    </form>
  );
}
