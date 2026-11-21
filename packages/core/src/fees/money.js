// Money is integer minor units (paisa). Parse/format only at the edges.

/** "1250.5" -> 125050. Returns null for anything that is not a plain amount with at most 2 decimals. */
export function takaToMinor(input) {
  const text = String(input ?? '').trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function formatMinor(minor, currency = 'BDT') {
  if (!Number.isSafeInteger(minor)) throw new TypeError('minor must be a safe integer');
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${currency} ${whole}.${String(abs % 100).padStart(2, '0')}`;
}
