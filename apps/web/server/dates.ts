// School days are Asia/Dhaka (UTC+6, no DST).
export const todayInDhaka = () => new Date(Date.now() + 6 * 3_600_000).toISOString().slice(0, 10);

export const isRealSchoolDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
