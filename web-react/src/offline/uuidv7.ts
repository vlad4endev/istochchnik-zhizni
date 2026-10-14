import { v7 as uuidv7 } from 'uuid';

export function newClientId(): string {
  return uuidv7();
}

export function newIdempotencyKey(): string {
  return uuidv7();
}
