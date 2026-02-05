const svg = (content: string, size: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>${content}</svg>`)}")`

const s = (opacity: number) => `stroke-opacity='${opacity}'`
const f = (opacity: number) => `fill-opacity='${opacity}'`

const patterns: Record<string, string> = {
  amp: svg(
    `<line x1='0' y1='0' x2='20' y2='20' stroke='white' ${s(0.06)} stroke-width='1.5'/>
     <line x1='20' y1='0' x2='0' y2='20' stroke='white' ${s(0.04)} stroke-width='1'/>`,
    20,
  ),

  droid: svg(
    `<rect x='4' y='4' width='16' height='10' rx='1' fill='none' stroke='white' ${s(0.06)} stroke-width='1'/>
     <line x1='4' y1='18' x2='20' y2='18' stroke='white' ${s(0.04)} stroke-width='1'/>`,
    24,
  ),

  pi: svg(
    `<circle cx='10' cy='10' r='4' fill='none' stroke='white' ${s(0.06)} stroke-width='1'/>
     <circle cx='22' cy='22' r='2' fill='white' ${f(0.03)}/>`,
    28,
  ),

  opencode: svg(
    `<rect x='3' y='3' width='8' height='8' fill='none' stroke='white' ${s(0.06)} stroke-width='1'/>
     <rect x='14' y='14' width='5' height='5' fill='white' ${f(0.03)}/>`,
    22,
  ),

  claude: svg(
    `<path d='M12 2 L14 8 L20 8 L15 12 L17 18 L12 14 L7 18 L9 12 L4 8 L10 8 Z'
       fill='none' stroke='white' ${s(0.06)} stroke-width='1'/>`,
    24,
  ),

  codex: svg(
    `<path d='M12 2 Q14 6 18 7 Q14 8 12 12 Q10 8 6 7 Q10 6 12 2 Z
             M12 12 Q14 16 18 17 Q14 18 12 22 Q10 18 6 17 Q10 16 12 12 Z'
       fill='none' stroke='white' ${s(0.06)} stroke-width='1'/>`,
    24,
  ),
}

export function getAgentPattern(
  agent: string,
): React.CSSProperties | undefined {
  const bg = patterns[agent]
  if (!bg) return undefined
  return { backgroundImage: bg, backgroundRepeat: 'repeat' }
}
