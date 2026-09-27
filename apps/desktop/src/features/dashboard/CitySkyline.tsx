/**
 * Selamlama bandının arka planı: gün batımı gradyanı üzerinde stilize bir
 * İstanbul silüeti (kubbeler, minareler, Galata kulesi). Tamamen vektör, dış
 * görsel gerektirmez.
 */
export function CitySkyline() {
  return (
    <svg viewBox="0 0 800 220" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1b1446" />
          <stop offset="45%" stopColor="#5b2a6e" />
          <stop offset="75%" stopColor="#c2566b" />
          <stop offset="100%" stopColor="#f08a5d" />
        </linearGradient>
        <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0c1326" stopOpacity="0.95" />
          <stop offset="45%" stopColor="#0c1326" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#0c1326" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a1f4f" />
          <stop offset="100%" stopColor="#0c1326" />
        </linearGradient>
      </defs>
      <rect width="800" height="220" fill="url(#sky)" />
      <circle cx="610" cy="150" r="34" fill="#ffb38a" opacity="0.55" />
      <g fill="#0f0b26" opacity="0.55">
        <path d="M0 170 L60 160 L120 166 L200 150 L280 162 L360 148 L440 160 L520 146 L600 158 L680 150 L800 160 L800 220 L0 220 Z" />
      </g>
      <g fill="#120d2c">
        {/* Galata benzeri kule */}
        <rect x="150" y="120" width="18" height="70" />
        <path d="M146 120 L159 92 L172 120 Z" />
        {/* Büyük cami: kubbe + yarım kubbeler + 4 minare */}
        <rect x="430" y="150" width="150" height="40" />
        <path d="M455 150 A50 50 0 0 1 555 150 Z" />
        <path d="M435 158 A22 22 0 0 1 479 158 Z" />
        <path d="M531 158 A22 22 0 0 1 575 158 Z" />
        <rect x="498" y="92" width="4" height="12" />
        {[418, 440, 570, 592].map((x) => (
          <g key={x}>
            <rect x={x} y="96" width="5" height="94" />
            <path d={`M${x - 1} 96 L${x + 2.5} 76 L${x + 6} 96 Z`} />
          </g>
        ))}
        {/* İkinci cami */}
        <rect x="660" y="160" width="90" height="30" />
        <path d="M675 160 A30 30 0 0 1 735 160 Z" />
        <rect x="650" y="118" width="4" height="72" />
        <path d="M649 118 L652 102 L655 118 Z" />
        <rect x="756" y="118" width="4" height="72" />
        <path d="M755 118 L758 102 L761 118 Z" />
        {/* Binalar */}
        <path d="M0 190 L0 172 L40 172 L40 164 L80 164 L80 176 L120 176 L120 168 L200 168 L200 178 L260 178 L260 170 L330 170 L330 180 L400 180 L400 172 L430 172 L430 190 L800 190 L800 200 L0 200 Z" />
      </g>
      <rect y="196" width="800" height="24" fill="url(#water)" />
      <rect width="800" height="220" fill="url(#fade)" />
    </svg>
  );
}
