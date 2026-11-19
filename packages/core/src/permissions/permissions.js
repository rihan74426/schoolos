// Role → permission matrix. Single source of truth for "who may do what".
// Roles come from Membership.role. Add actions here, never inline role lists in UI/actions.
export const ROLES = ['OWNER', 'ADMIN', 'PRINCIPAL', 'ACADEMIC_COORDINATOR', 'TEACHER', 'ACCOUNTS', 'GUARDIAN', 'STUDENT'];

const LEADERSHIP = ['OWNER', 'ADMIN', 'PRINCIPAL'];

export const permissionMatrix = {
  'policy:read': [...LEADERSHIP, 'ACADEMIC_COORDINATOR', 'ACCOUNTS'],
  'policy:write': ['OWNER', 'ADMIN'],
  'settings:write': ['OWNER', 'ADMIN'],
  'student:read': [...LEADERSHIP, 'ACADEMIC_COORDINATOR', 'TEACHER', 'ACCOUNTS'],
  'student:write': [...LEADERSHIP, 'ACADEMIC_COORDINATOR'],
  'attendance:submit': [...LEADERSHIP, 'ACADEMIC_COORDINATOR', 'TEACHER'],
  // Roles that may take attendance for ANY section; others (TEACHER) need a TeachingAssignment.
  'attendance:any-section': [...LEADERSHIP, 'ACADEMIC_COORDINATOR'],
  'structure:read': [...LEADERSHIP, 'ACADEMIC_COORDINATOR', 'TEACHER'],
  'structure:write': [...LEADERSHIP],
  'teaching:assign': [...LEADERSHIP, 'ACADEMIC_COORDINATOR'],
  'staff:invite': ['OWNER', 'ADMIN', 'PRINCIPAL', 'ACADEMIC_COORDINATOR'],
  'fees:read': [...LEADERSHIP, 'ACCOUNTS'],
  'fees:write': ['OWNER', 'ADMIN', 'ACCOUNTS'],
  'exams:write': [...LEADERSHIP, 'ACADEMIC_COORDINATOR', 'TEACHER'],
  'notices:send': [...LEADERSHIP, 'ACADEMIC_COORDINATOR'],
};

export function can(role, action) {
  return Object.hasOwn(permissionMatrix, action) && permissionMatrix[action].includes(role);
}

export function rolesFor(action) {
  if (!Object.hasOwn(permissionMatrix, action)) throw new RangeError(`Unknown action: ${action}`);
  return [...permissionMatrix[action]];
}

// Roles a given role may invite (never equal to or above their own authority).
const invitable = {
  OWNER: ['ADMIN', 'PRINCIPAL', 'ACADEMIC_COORDINATOR', 'TEACHER', 'ACCOUNTS'],
  ADMIN: ['PRINCIPAL', 'ACADEMIC_COORDINATOR', 'TEACHER', 'ACCOUNTS'],
  PRINCIPAL: ['ACADEMIC_COORDINATOR', 'TEACHER', 'ACCOUNTS'],
  ACADEMIC_COORDINATOR: ['TEACHER'],
};
export function invitableRoles(role) {
  return Object.hasOwn(invitable, role) ? [...invitable[role]] : [];
}
// Roles that must complete a staff profile after joining.
export const STAFF_PROFILE_ROLES = ['ADMIN', 'PRINCIPAL', 'ACADEMIC_COORDINATOR', 'TEACHER', 'ACCOUNTS'];
