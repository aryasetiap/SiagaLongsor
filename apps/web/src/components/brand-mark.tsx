interface BrandMarkProps {
  readonly compact?: boolean;
  readonly inverted?: boolean;
}

export function BrandMark({ compact = false, inverted = false }: BrandMarkProps) {
  return (
    <div className="flex items-center gap-3" aria-label="SiagaLongsor">
      <span className="grid size-10 place-items-center rounded-[14px] bg-slate-950 text-white shadow-sm">
        <svg viewBox="0 0 32 32" aria-hidden="true" className="size-6" fill="none">
          <path d="M5 23 13 9l5 8 3-5 6 11H5Z" fill="currentColor" opacity=".95" />
          <path d="M7 25h18" stroke="#38bdf8" strokeLinecap="round" strokeWidth="2.5" />
        </svg>
      </span>
      {!compact && (
        <span>
          <span
            className={`block text-[15px] font-bold tracking-tight ${
              inverted ? 'text-white' : 'text-slate-950'
            }`}
          >
            SiagaLongsor
          </span>
          <span
            className={`block text-[11px] font-medium ${
              inverted ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            Sistem monitoring lereng
          </span>
        </span>
      )}
    </div>
  );
}
