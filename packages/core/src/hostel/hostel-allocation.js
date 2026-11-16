export const hostelRules = {
  singleRoomQuota: 20,
  // Institutions must explicitly configure a different policy when appropriate.
  genderPolicy: 'separate',
};

const capacities = { single: 1, double: 2, triple: 3 };

export function canAssignRoom(roomType, occupancy, options = {}) {
  const capacity = capacities[roomType];
  if (!capacity || !Number.isSafeInteger(occupancy) || occupancy < 0 || occupancy >= capacity) return false;

  const { residentGender, roomGender, genderPolicy = hostelRules.genderPolicy, approvedMixedRequest = false } = options;
  if (genderPolicy === 'mixed') return true;
  if (genderPolicy === 'mixed-by-request') return approvedMixedRequest === true;
  if (genderPolicy !== 'separate' || !residentGender || !roomGender) return false;
  return residentGender === roomGender;
}
