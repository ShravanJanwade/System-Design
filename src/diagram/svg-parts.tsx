import { measureText } from './text';
import { CHIP_FONT, CHIP_H } from './layout';

export type ChipTone = 'signal' | 'alert' | 'plain' | 'success';

const chipFill: Record<ChipTone, string> = {
  signal: 'var(--signal)',
  alert: 'var(--panel-alert)',
  plain: 'var(--panel-raised)',
  success: 'var(--panel-success)',
};
const chipText: Record<ChipTone, string> = {
  signal: 'var(--on-signal)',
  alert: 'var(--on-signal)',
  plain: 'var(--panel-text)',
  success: 'var(--on-signal)',
};

export function chipWidthFor(text: string): number {
  return Math.ceil(measureText(text, CHIP_FONT, 'semibold')) + 16;
}

/** A small rounded chip drawn on the blueprint panel. (x, y) is the top-left corner. */
export function SvgChip({ x, y, text, tone = 'plain' }: { x: number; y: number; text: string; tone?: ChipTone }) {
  const w = chipWidthFor(text);
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        width={w}
        height={CHIP_H}
        rx={CHIP_H / 2}
        fill={chipFill[tone]}
        stroke={tone === 'plain' ? 'var(--panel-chip-border)' : 'none'}
        strokeWidth={1}
      />
      <text x={w / 2} y={14} textAnchor="middle" fontSize={CHIP_FONT} fontWeight={600} fill={chipText[tone]}>
        {text}
      </text>
    </g>
  );
}

/** Edge label: a panel-colored chip that masks the line beneath it. Dimmed, it recedes but its text stays readable. */
export function EdgeLabel({ x, y, w, text, dimmed = false }: { x: number; y: number; w: number; text: string; dimmed?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={w} height={CHIP_H} rx={CHIP_H / 2} fill="var(--panel)" stroke="var(--panel-chip-border)" strokeOpacity={dimmed ? 0.5 : 1} strokeWidth={1} />
      <text x={w / 2} y={14} textAnchor="middle" fontSize={CHIP_FONT} fontWeight={dimmed ? 400 : 600} fill={dimmed ? 'var(--panel-muted)' : 'var(--panel-text)'}>
        {text}
      </text>
    </g>
  );
}

export function HatchPattern({ id }: { id: string }) {
  return (
    <pattern id={id} width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width={7} height={7} fill="#ffffff" />
      <line x1={0} y1={0} x2={0} y2={7} stroke="var(--card-alert)" strokeOpacity={0.28} strokeWidth={3} />
    </pattern>
  );
}
