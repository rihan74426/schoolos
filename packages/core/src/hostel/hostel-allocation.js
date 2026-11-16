export const hostelRules = {
  singleRoomQuota: 20,
  genderPolicy: 'mixed-by-request',
};

export function canAssignRoom(roomType, occupancy) {
  return occupancy < (roomType === 'single' ? 1 : roomType === 'double' ? 2 : 3);
}
