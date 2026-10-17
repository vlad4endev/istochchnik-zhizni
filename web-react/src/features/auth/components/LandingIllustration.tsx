/**
 * Векторная иллюстрация для начальной страницы: община вокруг креста.
 * Образы: «Я есмь лоза, а вы ветви» (лоза с листьями и гроздьями), «где двое или трое
 * собраны во имя Моё» (люди вокруг креста), голубь, свет. Всё в SVG, без внешних файлов.
 */

type Person = { x: number; base: number; h: number; fill: string; staff?: boolean };

const PEOPLE: Person[] = [
  { x: 58, base: 300, h: 84, fill: '#f2b479' },
  { x: 100, base: 296, h: 98, fill: '#f6e3cf' },
  { x: 140, base: 292, h: 76, fill: '#d98aa0' },
  { x: 160, base: 304, h: 46, fill: '#f6e3cf' },
  { x: 240, base: 304, h: 50, fill: '#f2b479' },
  { x: 262, base: 292, h: 90, fill: '#f6e3cf' },
  { x: 302, base: 296, h: 78, fill: '#d98aa0', staff: true },
  { x: 344, base: 300, h: 94, fill: '#f2b479' },
];

function personPaths(p: Person) {
  const w = p.h * 0.26;
  const headR = p.h * 0.1;
  const headY = p.base - p.h + headR;
  const shoulderY = headY + headR + p.h * 0.06;
  const body =
    `M${p.x - w} ${p.base} ` +
    `Q${p.x - w * 0.95} ${shoulderY + p.h * 0.3} ${p.x - w * 0.5} ${shoulderY + p.h * 0.04} ` +
    `Q${p.x} ${shoulderY - p.h * 0.05} ${p.x + w * 0.5} ${shoulderY + p.h * 0.04} ` +
    `Q${p.x + w * 0.95} ${shoulderY + p.h * 0.3} ${p.x + w} ${p.base} Z`;
  return { body, headR, headY };
}

/** Точки вдоль квадратичной кривой — листья лозы. */
function along(p0: [number, number], p1: [number, number], p2: [number, number], n: number) {
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 0.7) / (n + 0.4);
    const x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0];
    const y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1];
    const dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
    const dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
    return { x, y, a: (Math.atan2(dy, dx) * 180) / Math.PI };
  });
}

const VINE_L = { p0: [-10, 150] as [number, number], p1: [30, 60] as [number, number], p2: [150, 70] as [number, number] };
const VINE_R = { p0: [410, 120] as [number, number], p1: [380, 50] as [number, number], p2: [270, 64] as [number, number] };

function Vine({ v, flip }: { v: typeof VINE_L; flip?: boolean }) {
  const leaves = along(v.p0, v.p1, v.p2, 7);
  return (
    <g>
      <path
        d={`M${v.p0[0]} ${v.p0[1]} Q${v.p1[0]} ${v.p1[1]} ${v.p2[0]} ${v.p2[1]}`}
        fill="none"
        stroke="#e9a8a0"
        strokeOpacity="0.55"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {leaves.map((l, i) => {
        const side = i % 2 === 0 ? 1 : -1;
        return (
          <g key={i} transform={`translate(${l.x} ${l.y}) rotate(${l.a + side * 62})`}>
            <path d="M0 0 C6 -9 18 -9 24 0 C18 9 6 9 0 0Z" fill="#f2b479" fillOpacity={0.55 + (i % 3) * 0.1} />
          </g>
        );
      })}
      {/* гроздь винограда */}
      <g transform={`translate(${v.p2[0] + (flip ? 4 : -4)} ${v.p2[1] + 4})`} fill="#c25a7e" fillOpacity="0.9">
        {[
          [0, 6],
          [-7, 12],
          [7, 12],
          [0, 18],
          [-13, 18],
          [13, 18],
          [-6, 25],
          [6, 25],
          [0, 32],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="5.2" />
        ))}
      </g>
    </g>
  );
}

export function LandingIllustration({ className }: { className?: string }) {
  const rays = Array.from({ length: 14 }, (_, i) => i * (360 / 14));
  return (
    <svg
      viewBox="0 0 400 340"
      preserveAspectRatio="xMidYMax meet"
      className={className}
      aria-hidden
      focusable="false"
    >
      <defs>
        <radialGradient id="li-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffe3b8" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#f2b479" stopOpacity="0.45" />
          <stop offset="1" stopColor="#f2b479" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="li-cross" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff4de" />
          <stop offset="1" stopColor="#f2b479" />
        </linearGradient>
        <linearGradient id="li-hill-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b5405f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#5a1830" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="li-hill-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a1226" />
          <stop offset="1" stopColor="#2b0d16" />
        </linearGradient>
      </defs>

      {/* свет */}
      <circle cx="200" cy="200" r="150" fill="url(#li-glow)" />
      <g className="landing-rays" stroke="#ffe3b8" strokeLinecap="round">
        {rays.map((a) => (
          <line
            key={a}
            x1="200"
            y1="200"
            x2="200"
            y2="40"
            strokeWidth="1.6"
            strokeOpacity="0.18"
            transform={`rotate(${a} 200 200)`}
          />
        ))}
      </g>

      {/* звёзды */}
      <g fill="#ffe3b8">
        {[
          [36, 40, 1.6],
          [120, 24, 1.2],
          [318, 30, 1.6],
          [370, 84, 1.2],
          [84, 108, 1.1],
          [300, 110, 1.1],
        ].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} opacity="0.7" />
        ))}
      </g>

      {/* лоза и ветви */}
      <Vine v={VINE_L} />
      <Vine v={VINE_R} flip />

      {/* холмы */}
      <path d="M0 262 Q70 214 150 244 T290 236 T400 250 V340 H0Z" fill="url(#li-hill-back)" />
      <path d="M0 300 Q100 262 200 276 T400 268 V340 H0Z" fill="url(#li-hill-front)" />

      {/* голубь */}
      <g transform="translate(200 112)" fill="#fff4de">
        <ellipse cx="0" cy="4" rx="13" ry="6.5" />
        <circle cx="-12" cy="0" r="5" />
        <path d="M-17 -1 L-24 1 L-17 3Z" fill="#f2b479" />
        <path d="M-2 0 C-8 -16 -22 -22 -34 -20 C-26 -12 -16 -4 -6 4Z" />
        <path d="M2 0 C10 -16 24 -22 36 -18 C27 -11 17 -3 7 4Z" />
        <path d="M12 6 L30 12 L12 10Z" />
      </g>
      {/* оливковая ветвь в клюве */}
      <path d="M-24 1 Q-34 8 -40 6" transform="translate(200 112)" stroke="#f2b479" strokeWidth="1.6" fill="none" strokeLinecap="round" />

      {/* крест */}
      <g>
        <rect x="195.5" y="196" width="9" height="86" rx="4.5" fill="url(#li-cross)" />
        <rect x="178" y="214" width="44" height="9" rx="4.5" fill="url(#li-cross)" />
      </g>

      {/* люди вокруг креста */}
      <g>
        {PEOPLE.map((p, i) => {
          const { body, headR, headY } = personPaths(p);
          return (
            <g key={i} fillOpacity="0.96">
              {p.staff && (
                <path
                  d={`M${p.x + p.h * 0.3} ${p.base} V${p.base - p.h * 0.95} q9 -2 9 7`}
                  stroke="#f2b479"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  fill="none"
                />
              )}
              <path d={body} fill={p.fill} />
              <circle cx={p.x} cy={headY} r={headR} fill={p.fill} />
            </g>
          );
        })}
      </g>

      {/* передний план: травинки */}
      <path d="M0 318 Q100 296 200 306 T400 300 V340 H0Z" fill="#1d0710" fillOpacity="0.85" />
    </svg>
  );
}
