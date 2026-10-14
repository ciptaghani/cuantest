'use client';

import type { ActionResult } from '@/lib/auth/guard';
import { Msg, useAction } from './useAction';

/** Tombol satu klik untuk server action (hapus, tandai, …) dengan konfirmasi opsional. */
export function ActBtn<I>({
  action,
  input,
  confirm: ask,
  children,
  className = 'linkbtn',
  title,
}: {
  action: (input: I) => Promise<ActionResult<unknown>>;
  input: I;
  confirm?: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const { pending, msg, run } = useAction();
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={pending}
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          if (ask && !window.confirm(ask)) return;
          run(() => action(input));
        }}
      >
        {children}
      </button>
      {msg && !msg.ok && <Msg msg={msg} />}
    </>
  );
}
