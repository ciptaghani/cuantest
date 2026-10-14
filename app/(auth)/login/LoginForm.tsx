'use client';

import { useActionState } from 'react';
import { login, type LoginState } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: '' });
  return (
    <form action={action} className="mt-4 flex flex-col gap-3" autoComplete="on">
      <label className="field">
        <span>ID</span>
        <input name="username" autoComplete="username" required autoFocus autoCapitalize="none" spellCheck={false} />
      </label>
      <label className="field">
        <span>Password</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <p className="note min-h-5 !text-loss" role="alert">
        {state.error}
      </p>
      <button className="btn w-full" type="submit" disabled={pending}>
        {pending ? 'Memeriksa…' : 'Masuk'}
      </button>
    </form>
  );
}
