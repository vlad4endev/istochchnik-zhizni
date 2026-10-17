/**
 * Векторная иллюстрация начальной страницы в духе «рассвета над холмами»:
 * солнце за крестом на вершине, община силуэтами, пастух с отарой («Я есмь пастырь добрый»),
 * колосья пшеницы на переднем плане («жатва многа»). Всё в SVG, без внешних файлов.
 * Глубина строится слоями: дальние холмы светлее и теплее, ближние темнее.
 */

/** Детерминированный «шум», чтобы колосья отличались, но не прыгали между рендерами. */
function jitter(i: number, k: number) {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** Маленький человек-силуэт (даль): голова, плечи, ряса. */
function Figure({ x, y, h, tone = '#1f0a13' }: { x: number; y: number; h: number; tone?: string }) {
  const w = h * 0.2;
  const hr = h * 0.12;
  return (
    <g fill={tone}>
      <circle cx={x} cy={y - h + hr} r={hr} />
      <path
        d={`M${x - w} ${y} C${x - w} ${y - h * 0.5} ${x - w * 0.55} ${y - h * 0.74} ${x} ${y - h * 0.76} C${x + w * 0.55} ${y - h * 0.74} ${x + w} ${y - h * 0.5} ${x + w} ${y} Z`}
      />
    </g>
  );
}

/** Овца, силуэт со светлой шерстью (подсвечена рассветом). Начало координат — у копыт. */
function Sheep({ x, y, s = 1, flip }: { x: number; y: number; s?: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <ellipse cx="0" cy="0.5" rx="16" ry="2" fill="#12040a" fillOpacity="0.55" />
      <g fill="#2a0f18">
        <rect x="-9" y="-7" width="2" height="7.4" rx="1" />
        <rect x="-4.5" y="-7" width="2" height="7.4" rx="1" />
        <rect x="4" y="-7" width="2" height="7.4" rx="1" />
        <rect x="8.5" y="-7" width="2" height="7.4" rx="1" />
      </g>
      <g fill="#f1dcc8">
        <ellipse cx="0" cy="-12" rx="13.5" ry="7.5" />
        <circle cx="-9" cy="-13" r="5.6" />
        <circle cx="-3.5" cy="-17.2" r="6.2" />
        <circle cx="3.8" cy="-17" r="6" />
        <circle cx="9.5" cy="-13.2" r="5.4" />
        <circle cx="-8" cy="-8.6" r="4.6" />
        <circle cx="8" cy="-8.4" r="4.6" />
      </g>
      <g fill="#c9a98f" fillOpacity="0.55">
        <ellipse cx="0" cy="-8" rx="10" ry="3.4" />
      </g>
      <g fill="#2a0f18">
        <ellipse cx="15.6" cy="-12.2" rx="4.4" ry="5.2" transform="rotate(14 15.6 -12.2)" />
        <ellipse cx="12.2" cy="-16.2" rx="3.4" ry="1.8" transform="rotate(-35 12.2 -16.2)" />
      </g>
    </g>
  );
}

/** Пастух с посохом, силуэт; свет с левой стороны (там солнце). */
function Shepherd({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="0.6" rx="10" ry="2" fill="#12040a" fillOpacity="0.55" />
      {/* посох */}
      <path d="M11 0 V-46 q0 -6 6 -6 q5 0 5 5" fill="none" stroke="#e8c79a" strokeWidth="1.6" strokeLinecap="round" />
      {/* одежда */}
      <path d="M-8 0 C-8.5 -16 -7 -28 -4 -33 L4 -33 C7 -28 8.5 -16 8.5 0 Z" fill="#c98a5c" />
      <path d="M-8 0 C-8.5 -16 -7 -28 -4 -33 L-1 -33 C-3 -22 -3.5 -10 -3 0 Z" fill="#e8b98a" fillOpacity="0.7" />
      {/* накидка */}
      <path d="M-5 -33 Q0 -37 5 -33 L7 -24 Q0 -21 -7 -24 Z" fill="#7a2a42" />
      {/* голова и покрывало */}
      <circle cx="0" cy="-39.5" r="4.2" fill="#e8c4a4" />
      <path d="M-5 -39 Q-4.5 -46 0 -46 Q4.5 -46 5 -39 Q3 -41.5 0 -41.5 Q-3 -41.5 -5 -39 Z" fill="#f3e3cc" />
      {/* рука с посохом */}
      <path d="M4 -29 L10 -24" stroke="#c98a5c" strokeWidth="2.4" strokeLinecap="round" />
    </g>
  );
}

/** Колос: тонкий стебель, зёрна парами и остья. */
function Ear({ x, base, h, lean }: { x: number; base: number; h: number; lean: number }) {
  const tx = x + lean;
  const ty = base - h;
  return (
    <g>
      <path d={`M${x} ${base} Q${x + lean * 0.15} ${base - h * 0.6} ${tx} ${ty}`} fill="none" stroke="url(#li-wheat)" strokeWidth="0.9" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <g key={i} fill="url(#li-wheat)">
          <ellipse cx={tx - 1.7} cy={ty + i * 3.3 + 2} rx="1.1" ry="2.1" transform={`rotate(-24 ${tx - 1.7} ${ty + i * 3.3 + 2})`} />
          <ellipse cx={tx + 1.7} cy={ty + i * 3.3 + 2} rx="1.1" ry="2.1" transform={`rotate(24 ${tx + 1.7} ${ty + i * 3.3 + 2})`} />
        </g>
      ))}
      <path
        d={`M${tx} ${ty + 1} V${ty - 9} M${tx - 1.4} ${ty + 2} L${tx - 3.6} ${ty - 7} M${tx + 1.4} ${ty + 2} L${tx + 3.6} ${ty - 7}`}
        stroke="url(#li-wheat)"
        strokeWidth="0.5"
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

const WHEAT = Array.from({ length: 46 }, (_, i) => {
  const x = (i / 45) * 410 - 5;
  const edge = Math.abs(x - 200) / 200; // 0 в центре, 1 по краям
  const h = 34 + edge * edge * 62 + jitter(i, 1) * 26;
  return { x, h, lean: (jitter(i, 2) - 0.5) * 14, group: i % 3 };
});

export function LandingIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 372"
      preserveAspectRatio="xMidYMax meet"
      className={className}
      aria-hidden
      focusable="false"
    >
      <defs>
        <radialGradient id="li-sun-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffe9c8" stopOpacity="1" />
          <stop offset="0.25" stopColor="#f7b97a" stopOpacity="0.7" />
          <stop offset="0.6" stopColor="#c2556f" stopOpacity="0.25" />
          <stop offset="1" stopColor="#7d1f3f" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="li-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c2587a" stopOpacity="0.85" />
          <stop offset="1" stopColor="#7a2748" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="li-mid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7a2748" />
          <stop offset="1" stopColor="#4a1630" />
        </linearGradient>
        <linearGradient id="li-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a1628" />
          <stop offset="1" stopColor="#1f0912" />
        </linearGradient>
        <linearGradient id="li-wheat" gradientUnits="userSpaceOnUse" x1="0" y1="250" x2="0" y2="360">
          <stop offset="0" stopColor="#f6c68c" />
          <stop offset="0.55" stopColor="#a8613c" />
          <stop offset="1" stopColor="#2a0e18" />
        </linearGradient>
        <filter id="li-soft" x="-30%" y="-100%" width="160%" height="300%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      {/* свет восхода */}
      <circle cx="200" cy="228" r="190" fill="url(#li-sun-glow)" />
      <circle cx="200" cy="228" r="30" fill="#fff1d8" />
      <circle cx="200" cy="228" r="38" fill="#ffe3b8" fillOpacity="0.35" />

      {/* облака */}
      <g filter="url(#li-soft)" fill="#f7b98a">
        <ellipse cx="70" cy="196" rx="70" ry="6" fillOpacity="0.28" />
        <ellipse cx="318" cy="182" rx="80" ry="7" fillOpacity="0.3" />
        <ellipse cx="190" cy="168" rx="60" ry="4" fillOpacity="0.22" />
        <ellipse cx="350" cy="228" rx="50" ry="5" fillOpacity="0.25" />
      </g>

      {/* птицы */}
      <g fill="none" stroke="#2a0e18" strokeOpacity="0.75" strokeWidth="1.3" strokeLinecap="round">
        <path d="M96 128 q5 -5 10 0 q5 -5 10 0" />
        <path d="M122 112 q4 -4 8 0 q4 -4 8 0" />
        <path d="M284 140 q4 -4 8 0 q4 -4 8 0" />
        <path d="M262 118 q3 -3 6 0 q3 -3 6 0" />
      </g>

      {/* дальние холмы, дымка */}
      <path d="M0 252 Q50 226 110 244 T230 236 T330 242 T400 232 V372 H0Z" fill="url(#li-far)" />
      <path d="M0 262 Q80 244 150 256 T300 250 T400 258 V372 H0Z" fill="#a63f66" fillOpacity="0.35" />

      {/* холм с крестом */}
      <path d="M0 276 Q80 250 160 262 Q184 252 200 246 Q216 252 240 262 Q320 252 400 274 V372 H0Z" fill="url(#li-mid)" />
      <g fill="#1d0710">
        <rect x="198.4" y="212" width="3.2" height="36" rx="1.2" />
        <rect x="190.5" y="221" width="19" height="3.2" rx="1.2" />
      </g>

      {/* община у креста */}
      <g>
        {[
          [138, 266, 17],
          [150, 262, 20],
          [162, 259, 15],
          [172, 257, 19],
          [230, 257, 18],
          [242, 260, 15],
          [254, 263, 20],
          [267, 267, 16],
        ].map(([x, y, h], i) => (
          <Figure key={i} x={x} y={y} h={h} />
        ))}
      </g>

      {/* передний холм */}
      <path d="M0 312 Q100 292 210 304 T400 296 V372 H0Z" fill="url(#li-near)" />

      {/* пастух с отарой слева */}
      <Shepherd x={86} y={308} s={1} />
      <Sheep x={118} y={314} s={0.92} />
      <Sheep x={144} y={320} s={0.7} />
      <Sheep x={52} y={318} s={0.78} flip />

      {/* отара справа */}
      <Sheep x={298} y={312} s={0.9} flip />
      <Sheep x={326} y={320} s={0.7} flip />
      <Sheep x={268} y={322} s={0.55} flip />

      {/* колосья на переднем плане */}
      {[0, 1, 2].map((g) => (
        <g key={g} className="landing-sway" style={{ animationDelay: `${g * 0.9}s` }}>
          {WHEAT.filter((w) => w.group === g).map((w, i) => (
            <Ear key={i} x={w.x} base={372} h={w.h} lean={w.lean} />
          ))}
        </g>
      ))}
    </svg>
  );
}
