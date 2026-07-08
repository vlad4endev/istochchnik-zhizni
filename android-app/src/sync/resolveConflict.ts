import type {LocalTableName} from '../db/schema';
import type {ConflictRecord} from './types';

function parseUpdatedAt(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

export function resolveConflict(
  table: LocalTableName,
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
): ConflictRecord {
  const localTs = parseUpdatedAt(local.updated_at);
  const remoteTs = parseUpdatedAt(remote.updated_at);
  const winner: 'local' | 'remote' = remoteTs >= localTs ? 'remote' : 'local';

  return {
    table,
    recordId:
      typeof remote.id === 'string' || typeof remote.id === 'number'
        ? String(remote.id)
        : typeof local.server_id === 'string'
          ? local.server_id
          : undefined,
    clientId: typeof local.client_id === 'string' ? local.client_id : undefined,
    local,
    remote,
    winner,
  };
}

export function pickWinnerRecord(conflict: ConflictRecord): Record<string, unknown> {
  return conflict.winner === 'remote' ? conflict.remote : conflict.local;
}
