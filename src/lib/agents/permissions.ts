/**
 * Agent permission definitions and checking helpers
 */

export const ALL_PERMISSIONS = [
  "memory:read",
  "memory:write",
  "memory:delete",
  "memory:list",
  "audit:read",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  "memory:read": "Read memory entries in granted folders",
  "memory:write": "Create and update memory entries in granted folders",
  "memory:delete": "Delete memory entries in granted folders",
  "memory:list": "List entry keys and folder structure without reading values",
  "audit:read": "View the agent's own audit access logs",
};

/**
 * Checks if an agent has a specific permission.
 */
export function hasPermission(
  agentPermissions: string[] | null | undefined,
  required: Permission
): boolean {
  if (!agentPermissions || !Array.isArray(agentPermissions)) {
    return false;
  }
  return agentPermissions.includes(required);
}

/**
 * Validates an array of permission strings.
 */
export function validatePermissions(permissions: string[]): Permission[] {
  const valid = new Set(ALL_PERMISSIONS);
  for (const p of permissions) {
    if (!valid.has(p as Permission)) {
      throw new Error(`Invalid permission: ${p}`);
    }
  }
  return permissions as Permission[];
}
