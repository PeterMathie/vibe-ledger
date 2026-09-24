import type { MonthlyHeatMap } from './heat-map';

export const MINIMUM_TOUCH_TARGET = 48;

export function asyncStateLabel(
  subject: string,
  state: 'LOADING' | 'EMPTY' | 'ERROR',
): string {
  if (state === 'LOADING') {
    return `Loading ${subject}`;
  }
  if (state === 'EMPTY') {
    return `No ${subject} available`;
  }
  return `${subject} unavailable`;
}

export function heatMapDayLabel(
  dateLabel: string,
  amountLabel: string,
  status: MonthlyHeatMap['days'][number]['status'],
): string {
  return `${dateLabel}. ${amountLabel} included spending. ${status}. Open exact-date Breakdown.`;
}

export function visibleHeatMapCue(
  tone: MonthlyHeatMap['days'][number]['tone'],
): string {
  if (tone === 'RED') {
    return '!';
  }
  if (tone === 'GREEN') {
    return '•';
  }
  return '–';
}
