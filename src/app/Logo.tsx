/** The Blueprint mark: a tiny blueprint panel with two components and a request dot. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--panel)" />
      <path d="M8 0v32M16 0v32M24 0v32M0 8h32M0 16h32M0 24h32" stroke="var(--panel-line)" strokeOpacity=".14" />
      <rect x="5.5" y="10" width="9" height="12" rx="2" fill="var(--panel-line)" />
      <rect x="17.5" y="10" width="9" height="12" rx="2" fill="var(--panel-line)" />
      <path d="M14.5 16h3" stroke="var(--panel-line)" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="2.2" fill="var(--signal)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-[22px] leading-none font-semibold text-ink">Blueprint</span>
    </span>
  );
}
