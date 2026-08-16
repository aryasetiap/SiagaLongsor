'use client';

import { type CSSProperties, type RefObject, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { Principal } from '../auth/auth-types';

interface AccountMenuProps {
  readonly principal: Principal;
  readonly roleLabel: string;
  readonly message: string;
  readonly loggingOut: boolean;
  onLogout(): Promise<void>;
}

interface MenuPosition {
  readonly right: number;
  readonly top: number;
}

export function AccountMenu({
  principal,
  roleLabel,
  message,
  loggingOut,
  onLogout,
}: AccountMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => setPosition(menuPosition(triggerRef));
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  async function logout(): Promise<void> {
    setOpen(false);
    await onLogout();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Menu akun ${principal.name}`}
        onClick={() => setOpen((current) => !current)}
        className="account-menu-trigger"
      >
        <span className="account-menu-avatar">{initials(principal.name)}</span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-44 truncate text-sm font-bold text-slate-900">
            {principal.name}
          </span>
          <span className="block text-xs text-slate-500">{roleLabel}</span>
        </span>
        <span aria-hidden="true" className="account-menu-chevron">
          ▾
        </span>
      </button>
      {open &&
        position !== null &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={`Menu akun ${principal.name}`}
            className="account-menu-popover"
            style={
              {
                '--account-menu-right': `${position.right}px`,
                '--account-menu-top': `${position.top}px`,
              } as CSSProperties
            }
          >
            <div className="border-b border-slate-100 px-2 pb-3">
              <p className="font-bold text-slate-950">{principal.name}</p>
              <p className="mt-1 break-all text-xs text-slate-500">{principal.email}</p>
            </div>
            <p className="account-menu-message">{message}</p>
            <button
              type="button"
              role="menuitem"
              disabled={loggingOut}
              onClick={() => void logout()}
              className="account-menu-logout"
            >
              {loggingOut ? 'Mengakhiri sesi…' : 'Keluar'}
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

function menuPosition(triggerRef: RefObject<HTMLButtonElement | null>): MenuPosition | null {
  const trigger = triggerRef.current;
  if (trigger === null) return null;
  const rect = trigger.getBoundingClientRect();
  return {
    right: Math.max(12, window.innerWidth - rect.right),
    top: rect.bottom + 8,
  };
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
