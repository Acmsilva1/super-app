/** Server-owned scope: never derive isAdmin or the effective owner from request bodies. */
export function scopeOwnedQuery(query, actorId, isAdmin = false, ownerColumn = 'created_by') {
  if (typeof actorId !== 'string' || !actorId.trim()) throw new Error('scope_actor_required');
  return isAdmin === true ? query : query.eq(ownerColumn, actorId);
}

export function resolveOwnedRecord(record, actorId, isAdmin = false, ownerColumn = 'created_by') {
  if (typeof actorId !== 'string' || !actorId.trim()) throw new Error('scope_actor_required');
  if (!record || typeof record[ownerColumn] !== 'string' || !record[ownerColumn]) return null;
  return isAdmin === true || record[ownerColumn] === actorId ? record : null;
}
