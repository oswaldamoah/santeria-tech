import type { CategoryId } from '../data/products'

/** Simple line drawings used when no product photo is available. */
export function Glyph({ category, className = 'glyph' }: { category: CategoryId; className?: string }) {
  const common = {
    className,
    viewBox: '0 0 64 64',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (category) {
    case 'iphone':
      return (
        <svg {...common}>
          <rect x="18" y="5" width="28" height="54" rx="7" />
          <path d="M28 10h8" />
        </svg>
      )
    case 'ipad':
      return (
        <svg {...common}>
          <rect x="10" y="6" width="44" height="52" rx="6" />
          <circle cx="32" cy="10" r="0.6" fill="currentColor" />
        </svg>
      )
    case 'mac':
      return (
        <svg {...common}>
          <rect x="12" y="14" width="40" height="27" rx="3" />
          <path d="M6 45h52l-3 4H9z" />
        </svg>
      )
    case 'watch':
      return (
        <svg {...common}>
          <path d="M24 14l2-9h12l2 9M24 50l2 9h12l2-9" />
          <rect x="18" y="14" width="28" height="36" rx="9" />
          <path d="M46 28h2v6h-2" />
        </svg>
      )
    case 'airpods':
      return (
        <svg {...common}>
          <path d="M20 12a8 8 0 0 1 8 8v4a6 6 0 0 1-4 5.6V50a3 3 0 0 1-6 0V28a8 8 0 0 1 2-16z" />
          <path d="M44 12a8 8 0 0 0-8 8v4a6 6 0 0 0 4 5.6V50a3 3 0 0 0 6 0V28a8 8 0 0 0-2-16z" />
        </svg>
      )
    case 'vision':
      return (
        <svg {...common}>
          <path d="M8 30c0-8 6-12 24-12s24 4 24 12-5 13-12 13c-5 0-7-5-12-5s-7 5-12 5c-7 0-12-5-12-13z" />
        </svg>
      )
    case 'accessories':
      return (
        <svg {...common}>
          <path d="M44 6l8 8-30 30-10 2 2-10z" />
          <path d="M38 12l8 8" />
          <rect x="8" y="50" width="48" height="8" rx="2" />
        </svg>
      )
  }
}
