/**
 * Single source for runtime detection (architecture P-05 / R-13).
 */
export function getIsTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window
}
