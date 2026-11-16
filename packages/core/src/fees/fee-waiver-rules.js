export const feeRules = {
  lateFeePercent: 5,
  scholarshipCap: 50,
};

export function calculateLateFee(amount, lateDays = 0) {
  return amount * (feeRules.lateFeePercent / 100) * Math.max(lateDays, 0);
}
