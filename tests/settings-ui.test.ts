import { describe, expect, it } from 'vitest';

import {
  formatLocalDataChange,
  parseRestoreText,
  serializePortableExport,
} from '../src/app/settings';
import {
  PORTABLE_EXPORT_SCHEMA,
  PORTABLE_EXPORT_VERSION,
  PORTABLE_EXPORT_WARNING,
  type PortableExport,
} from '../src/data/local-data';

describe('Settings local-data helpers', () => {
  it('serializes a portable export with its sensitive-data warning intact', () => {
    const value = {
      schema: PORTABLE_EXPORT_SCHEMA,
      version: PORTABLE_EXPORT_VERSION,
      exportedAt: '2026-09-24T18:00:00.000Z',
      warning: PORTABLE_EXPORT_WARNING,
      data: {},
    } as unknown as PortableExport;

    expect(serializePortableExport(value)).toContain(PORTABLE_EXPORT_WARNING);
  });

  it('parses pasted JSON and rejects empty input', () => {
    expect(parseRestoreText('{"version":1}')).toEqual({ version: 1 });
    expect(() => parseRestoreText('  ')).toThrow('Restore text is empty');
    expect(() => parseRestoreText('{')).toThrow();
  });

  it('formats readiness timestamps and the unchanged state', () => {
    expect(formatLocalDataChange(null)).toBe('No local data changes yet');
    expect(formatLocalDataChange('2026-09-24T18:00:00.000Z')).not.toContain(
      'Invalid',
    );
  });
});
