import type { PortableExport } from '../data/local-data';

export function serializePortableExport(value: PortableExport): string {
  return JSON.stringify(value, null, 2);
}

export function parseRestoreText(value: string): unknown {
  if (value.trim() === '') {
    throw new Error('Restore text is empty.');
  }
  return JSON.parse(value) as unknown;
}

export function formatLocalDataChange(timestamp: string | null): string {
  if (timestamp === null) {
    return 'No local data changes yet';
  }
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}
