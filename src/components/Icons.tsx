const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function IconSound() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" {...stroke} aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

export function IconMuted() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" {...stroke} aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none" />
      <path d="m22 9-6 6M16 9l6 6" />
    </svg>
  );
}

export function IconPause() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1.5" />
      <rect x="14" y="5" width="4" height="14" rx="1.5" />
    </svg>
  );
}

export function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M8 5.14v13.72c0 .93 1.03 1.5 1.82.99l10.4-6.86c.7-.46.7-1.52 0-1.98L9.82 4.15C9.03 3.64 8 4.2 8 5.14z" />
    </svg>
  );
}

export function IconUndo() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" {...stroke} aria-hidden="true">
      <path d="M3 7v6h6" />
      <path d="M3.51 13a9 9 0 1 0 2.13-9.36L3 7" />
    </svg>
  );
}

export function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" {...stroke} strokeWidth={2.4} aria-hidden="true">
      <path d="M5 12.5 10 17.5 19 7" />
    </svg>
  );
}

export function IconHeadphones() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" {...stroke} aria-hidden="true">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z" />
    </svg>
  );
}

export function IconPlayPreview() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
      <path d="M7 4.5v15l13-7.5z" />
    </svg>
  );
}
