/**
 * Retourne un UID raccourci (6 premiers caractères).
 * @param {string} uid
 * @returns {string}
 */
export function shortUid(uid) {
  return typeof uid === 'string' && uid.length > 6 ? uid.slice(0, 6) : uid;
}

/**
 * Détermine s'il existe une claim admin (robuste si objet nul).
 * @param {{ claims?: Record<string, unknown> } | null | undefined} tokenResult
 * @returns {boolean}
 */
export function hasAdminClaim(tokenResult) {
  return !!(tokenResult && tokenResult.claims && tokenResult.claims['admin']);
}
