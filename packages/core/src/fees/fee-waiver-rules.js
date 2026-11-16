export const feeRules = {
  lateFeePercent: 5,
  scholarshipCap: 50,
};

// Amounts are integer minor units (for example, paisa). No fractional currency values.
export function calculateLateFee(amountMinor, lateDays = 0, percent = feeRules.lateFeePercent) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new TypeError('amountMinor must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(lateDays) || lateDays < 0) {
    throw new TypeError('lateDays must be a non-negative safe integer');
  }
  if (!Number.isFinite(percent) || percent < 0) {
    throw new TypeError('percent must be a non-negative finite number');
  }
  const fee = Math.round((amountMinor * percent * lateDays) / 100);
  if (!Number.isSafeInteger(fee)) throw new RangeError('calculated fee exceeds the safe integer range');
  return fee;
}
