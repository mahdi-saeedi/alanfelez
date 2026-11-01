/**
 * The Alan Felez logo, sharp at any size (client, 2026-11-01): the mark redrawn as vector shapes from
 * docs/design/brand/logo-alanfelez.png (the only file we have is 215 px, which blurred when enlarged), and the name as
 * real text in the site's font. Its size follows the --logo-h CSS variable (height of the mark), set by the caller.
 * Swap in the designer's own vector file when the client sends one (open question F3).
 */
export function Logo({ name, latin, className = "" }: { name: string; latin: string; className?: string }) {
  // Header and footer draw the same gradients, so a repeated id points at an identical definition.
  const id = "af-logo-";
  return (
    <span className={`inline-flex items-center gap-[calc(var(--logo-h)*0.2)] ${className}`} dir="rtl">
      <svg viewBox="0 0 65 66" aria-hidden className="h-[var(--logo-h)] w-auto shrink-0 transition-[height]">
        <defs>
          <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e5e7e6" />
            <stop offset="1" stopColor="#afb3b4" />
          </linearGradient>
          <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2f8fb0" />
            <stop offset="1" stopColor="#135067" />
          </linearGradient>
        </defs>
        <path fill={`url(#${id}s)`} fillRule="evenodd" d="M14.67,44.50 L14.00,44.75 L6.00,53.42 L6.08,62.75 L14.92,54.08Z M22.00,37.00 L19.00,40.25 L19.17,49.92 L19.50,50.25 L28.42,50.33 L28.92,49.50 L29.00,43.58 L22.58,37.00Z M55.67,20.25 L45.92,30.08 L46.33,62.92 L55.92,53.42Z M14.67,5.17 L5.92,13.92 L6.08,35.83 L15.00,27.25Z" />
        <path fill={`url(#${id}b)`} fillRule="evenodd" d="M42.00,33.92 L32.83,42.50 L32.33,53.83 L15.17,53.92 L5.83,63.42 L32.33,63.92 L42.17,54.58Z M61.75,3.42 L46.75,5.08 L49.67,9.67 L30.75,28.25 L22.83,20.42 L1.92,40.33 L1.67,51.00 L22.25,31.33 L31.08,39.17 L55.17,15.17 L59.67,18.50Z" />
      </svg>
      <span className="flex flex-col leading-none">
        <span className="text-[calc(var(--logo-h)*0.5)] font-black text-[#eceeee]">{name}</span>
        <span dir="ltr" className="mt-[calc(var(--logo-h)*0.08)] text-end text-[calc(var(--logo-h)*0.29)] font-semibold tracking-wide text-[#c9cdcf]">{latin}</span>
      </span>
    </span>
  );
}
