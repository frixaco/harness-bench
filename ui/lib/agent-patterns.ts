const svg = (content: string, size: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>${content}</svg>`)}")`;

const s = (opacity: number) => `stroke-opacity='${opacity}'`;
const f = (opacity: number) => `fill-opacity='${opacity}'`;

const n = (value: number) => value.toFixed(2);

const hash = (value: string) => {
  let hashed = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hashed ^= value.charCodeAt(i);
    hashed = Math.imul(hashed, 16777619);
  }
  return hashed >>> 0;
};

const createRng = (seed: string) => {
  let state = hash(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

type ShapeFactory = (x: number, y: number, rand: () => number) => string;

const randomPattern = (
  seed: string,
  size: number,
  count: number,
  shapeFactory: ShapeFactory,
) => {
  const rand = createRng(seed);
  const margin = 6;
  let content = "";

  for (let i = 0; i < count; i += 1) {
    const x = margin + rand() * (size - margin * 2);
    const y = margin + rand() * (size - margin * 2);
    content += shapeFactory(x, y, rand);
  }

  return svg(content, size);
};

const starPath = (cx: number, cy: number, radius: number) => {
  const inner = radius * 0.45;
  let path = "";

  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI * i) / 5;
    const distance = i % 2 === 0 ? radius : inner;
    const px = cx + Math.cos(angle) * distance;
    const py = cy + Math.sin(angle) * distance;
    path += `${i === 0 ? "M" : "L"}${n(px)} ${n(py)} `;
  }

  return `${path}Z`;
};

const petalPath = (cx: number, cy: number, width: number, height: number) =>
  `M${n(cx)} ${n(cy - height)}
   Q${n(cx + width)} ${n(cy - height * 0.55)} ${n(cx + width * 1.35)} ${n(cy)}
   Q${n(cx + width)} ${n(cy + height * 0.55)} ${n(cx)} ${n(cy + height)}
   Q${n(cx - width)} ${n(cy + height * 0.55)} ${n(cx - width * 1.35)} ${n(cy)}
   Q${n(cx - width)} ${n(cy - height * 0.55)} ${n(cx)} ${n(cy - height)} Z`;

const patterns: Record<string, string> = {
  amp: randomPattern("amp", 80, 18, (x, y, rand) => {
    const arm = 2 + rand() * 2.8;
    return `<line x1='${n(x - arm)}' y1='${n(y - arm)}' x2='${n(x + arm)}' y2='${n(y + arm)}' stroke='white' ${s(0.06)} stroke-width='1.4'/>
     <line x1='${n(x + arm)}' y1='${n(y - arm)}' x2='${n(x - arm)}' y2='${n(y + arm)}' stroke='white' ${s(0.04)} stroke-width='1'/>`;
  }),

  droid: randomPattern("droid", 84, 16, (x, y, rand) => {
    const width = 5 + rand() * 4;
    const height = 3 + rand() * 2.5;
    const left = x - width / 2;
    const top = y - height / 2;
    const baseY = top + height + 1.5;
    return `<rect x='${n(left)}' y='${n(top)}' width='${n(width)}' height='${n(height)}' rx='1' fill='none' stroke='white' ${s(0.06)} stroke-width='1'/>
     <line x1='${n(left)}' y1='${n(baseY)}' x2='${n(left + width)}' y2='${n(baseY)}' stroke='white' ${s(0.04)} stroke-width='1'/>`;
  }),

  pi: randomPattern("pi", 82, 18, (x, y, rand) => {
    const ring = 1.7 + rand() * 1.8;
    const dot = 0.7 + rand() * 1.1;
    const offsetX = (rand() - 0.5) * 6;
    const offsetY = (rand() - 0.5) * 6;
    return `<circle cx='${n(x)}' cy='${n(y)}' r='${n(ring)}' fill='none' stroke='white' ${s(0.06)} stroke-width='1'/>
     <circle cx='${n(x + offsetX)}' cy='${n(y + offsetY)}' r='${n(dot)}' fill='white' ${f(0.03)}/>`;
  }),

  opencode: randomPattern("opencode", 80, 16, (x, y, rand) => {
    const outer = 2.4 + rand() * 2.2;
    const inner = 1.2 + rand() * 1.4;
    const innerX = x + (rand() - 0.5) * 4.5;
    const innerY = y + (rand() - 0.5) * 4.5;
    return `<rect x='${n(x - outer)}' y='${n(y - outer)}' width='${n(outer * 2)}' height='${n(outer * 2)}' fill='none' stroke='white' ${s(0.06)} stroke-width='1'/>
     <rect x='${n(innerX - inner)}' y='${n(innerY - inner)}' width='${n(inner * 2)}' height='${n(inner * 2)}' fill='white' ${f(0.03)}/>`;
  }),

  claude: randomPattern("claude", 86, 14, (x, y, rand) => {
    const radius = 2.8 + rand() * 2.2;
    return `<path d='${starPath(x, y, radius)}' fill='none' stroke='white' ${s(0.06)} stroke-width='1'/>`;
  }),

  codex: randomPattern("codex", 88, 14, (x, y, rand) => {
    const width = 1.9 + rand() * 1.8;
    const height = 1.7 + rand() * 1.6;
    const gap = 1.1 + rand() * 1.2;
    const top = petalPath(x, y - gap, width, height);
    const bottom = petalPath(x, y + gap, width, height);
    return `<path d='${top} ${bottom}' fill='none' stroke='white' ${s(0.06)} stroke-width='1'/>`;
  }),
};

export function getAgentPattern(
  agent: string,
): React.CSSProperties | undefined {
  const bg = patterns[agent];
  if (!bg) return undefined;
  return { backgroundImage: bg, backgroundRepeat: "repeat" };
}
