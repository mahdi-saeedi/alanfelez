/** The lock icon, in its own module so client components can use it too (Locked.tsx is server-only). */
export function LockIcon({ className = "h-7 w-7" }: { className?: string }) {
  // Duotone lock (SCOPE §11: icons, not emoji).
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="4" y="10" width="16" height="11" rx="2.5" className="fill-gold/30" />
      <path d="M8 10V7a4 4 0 1 1 8 0v3" className="fill-none stroke-gold" strokeWidth="2" strokeLinecap="round" />
      <rect x="4" y="10" width="16" height="11" rx="2.5" className="fill-none stroke-gold" strokeWidth="2" />
      <circle cx="12" cy="15.5" r="1.6" className="fill-gold" />
    </svg>
  );
}
