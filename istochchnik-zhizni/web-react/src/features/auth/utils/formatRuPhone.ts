import type { KeyboardEvent } from 'react';

/** Маска как во Flutter _PhoneNumberFormatter: +7 (XXX) XXX-XX-XX */

export function formatRuPhoneInput(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, '');
  if (digitsOnly.length === 0) {
    return '';
  }

  let digits = digitsOnly;
  if (digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  }
  if (!digits.startsWith('7')) {
    digits = `7${digits}`;
  }
  if (digits.length > 11) {
    digits = digits.slice(0, 11);
  }

  const buf: string[] = [`+${digits[0]}`];
  if (digits.length > 1) {
    const area = digits.slice(1, Math.min(4, digits.length));
    buf.push(` (${area}`);
    if (area.length === 3) {
      buf.push(')');
    }
  }
  if (digits.length > 4) {
    buf.push(` ${digits.slice(4, Math.min(7, digits.length))}`);
  }
  if (digits.length > 7) {
    buf.push(`-${digits.slice(7, Math.min(9, digits.length))}`);
  }
  if (digits.length > 9) {
    buf.push(`-${digits.slice(9, Math.min(11, digits.length))}`);
  }

  return buf.join('');
}

export function phoneInputAllowedKeys(e: KeyboardEvent<HTMLInputElement>): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  if (['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
    return true;
  }
  return /^[0-9+]$/.test(e.key);
}
