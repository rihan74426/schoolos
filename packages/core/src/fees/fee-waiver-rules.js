export const feeRules = {
  lateFeePercent: 5,
  scholarshipCap: 50,
};

// Amounts are integer minor units (for example, paisa). No fractional currency values.
export function calculateLateFee(amountMinor, lateDays = 0) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new TypeError('amountMinor must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(lateDays) || lateDays < 0) {
    throw new TypeError('lateDays must be a non-negative safe integer');
  }
  return Math.round(amountMinor * feeRules.lateFeePercent * lateDays / 100);
}
