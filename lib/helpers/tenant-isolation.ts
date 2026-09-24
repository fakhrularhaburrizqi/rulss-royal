export interface TenantScopedEntity {
  tenantId: string;
}

export function validateSameTenant(
  entityA: TenantScopedEntity,
  entityB: TenantScopedEntity
): boolean {
  return entityA.tenantId === entityB.tenantId;
}

export function assertSameTenant(entityA: TenantScopedEntity, entityB: TenantScopedEntity): void {
  if (!validateSameTenant(entityA, entityB)) {
    throw new Error(
      `Cross-tenant relation violation: Entity A tenant (${entityA.tenantId}) does not match Entity B tenant (${entityB.tenantId})`
    );
  }
}
