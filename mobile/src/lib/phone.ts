/** Форматирование российского номера для поля ввода: +7 (XXX) XXX-XX-XX */
export function formatRuPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  let d = digits;
  if (d.startsWith('8') && d.length > 1) {
    d = `7${d.slice(1)}`;
  }
  if (!d.startsWith('7') && d.length > 0) {
    d = `7${d}`;
  }
  d = d.slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 1) return '+7';
  const rest = d.slice(1);
  let out = '+7';
  if (rest.length > 0) out += ` (${rest.slice(0, 3)}`;
  if (rest.length >= 3) out += ')';
  if (rest.length > 3) out += ` ${rest.slice(3, 6)}`;
  if (rest.length > 6) out += `-${rest.slice(6, 8)}`;
  if (rest.length > 8) out += `-${rest.slice(8, 10)}`;
  return out;
}

export function phoneToApiFormat(display: string): string {
  const digits = display.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+7${digits}`;
  }
  return display.trim();
}
