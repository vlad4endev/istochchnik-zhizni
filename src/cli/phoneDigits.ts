/** Варианты цифр телефона для поиска в members (10 ↔ 11 для РФ). */
export function phoneDigitsVariants(phoneOrDigits: string): string[] {
  const digits = phoneOrDigits.replace(/\D+/g, '');
  if (!digits) return [];

  const variants = new Set<string>([digits]);
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    const national = digits.slice(1);
    if (national.length === 10) {
      variants.add(national);
      variants.add(`7${national}`);
      variants.add(`8${national}`);
    }
  }
  if (digits.length === 10) {
    variants.add(`7${digits}`);
    variants.add(`8${digits}`);
  }
  return Array.from(variants);
}

export function formatPhoneForStorage(phoneOrDigits: string): string {
  const digits = phoneOrDigits.replace(/\D+/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `+7${digits}`;
  }
  return phoneOrDigits.trim();
}
