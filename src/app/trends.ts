import { DomainValidationError } from '../domain/errors';
import type {
  TrendBar,
  TrendModel,
  TrendRequest,
  TrendSelection,
} from '../domain/trends';

export type TrendPeriod = 3 | 6 | 12 | 24;

export interface TrendSegmentLayout {
  readonly id: string;
  readonly amountMinor: number;
  readonly height: number;
  readonly direction: 'POSITIVE' | 'NEGATIVE';
}

export interface TrendBarLayout {
  readonly id: string;
  readonly positiveHeight: number;
  readonly negativeHeight: number;
  readonly targetHeight: number | null;
  readonly segments: readonly TrendSegmentLayout[];
}

export interface TrendChartLayout {
  readonly scaleMinor: number;
  readonly bars: ReadonlyMap<string, TrendBarLayout>;
}

export function periodRequest(
  endMonth: string,
  period: TrendPeriod,
  selection: TrendSelection,
): TrendRequest {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(endMonth)) {
    throw new DomainValidationError('Trend month must use YYYY-MM.');
  }
  const [year, month] = endMonth.split('-').map(Number);
  if (year === undefined || month === undefined) {
    throw new DomainValidationError('Trend month must use YYYY-MM.');
  }
  const start = new Date(Date.UTC(year, month - period, 1));
  return {
    startMonth: `${start.getUTCFullYear()}-${(start.getUTCMonth() + 1)
      .toString()
      .padStart(2, '0')}`,
    endMonth,
    selection,
  };
}

export function createTrendChartLayout(
  model: TrendModel,
  positiveAreaHeight = 180,
  negativeAreaHeight = 72,
): TrendChartLayout {
  const allBars = model.months.flatMap(({ bars }) => bars);
  const scaleMinor = Math.max(
    1,
    ...allBars.flatMap((bar) => [
      Math.abs(bar.targetMinor ?? 0),
      positiveTotal(bar),
      negativeTotal(bar),
    ]),
  );
  const bars = new Map<string, TrendBarLayout>();
  for (const bar of allBars) {
    const segments = bar.segments.map((segment) => ({
      id: segment.id,
      amountMinor: segment.amountMinor,
      height: scalePixels(
        Math.abs(segment.amountMinor),
        segment.amountMinor < 0 ? negativeAreaHeight : positiveAreaHeight,
        scaleMinor,
      ),
      direction:
        segment.amountMinor < 0 ? ('NEGATIVE' as const) : ('POSITIVE' as const),
    }));
    bars.set(bar.id, {
      id: bar.id,
      positiveHeight: scalePixels(
        positiveTotal(bar),
        positiveAreaHeight,
        scaleMinor,
      ),
      negativeHeight: scalePixels(
        negativeTotal(bar),
        negativeAreaHeight,
        scaleMinor,
      ),
      targetHeight:
        bar.targetMinor === null
          ? null
          : scalePixels(bar.targetMinor, positiveAreaHeight, scaleMinor),
      segments,
    });
  }
  return { scaleMinor, bars };
}

function scalePixels(value: number, area: number, scale: number): number {
  return (value * area) / scale;
}

function positiveTotal(bar: TrendBar): number {
  return bar.segments.reduce(
    (total, segment) =>
      segment.amountMinor > 0 ? addSafe(total, segment.amountMinor) : total,
    0,
  );
}

function negativeTotal(bar: TrendBar): number {
  return bar.segments.reduce(
    (total, segment) =>
      segment.amountMinor < 0
        ? addSafe(total, Math.abs(segment.amountMinor))
        : total,
    0,
  );
}

function addSafe(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new DomainValidationError(
      'Trend chart arithmetic exceeded safe range.',
    );
  }
  return result;
}
