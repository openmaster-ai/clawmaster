/**
 * If the models editor contains a full `{"models":{ "mode","providers" }}`, save would produce
 * top-level `models.models` and OpenClaw reports Unrecognized key: "models".
 * Unwrap one level only when the outer object has a single `models` key and the inner object
 * looks like a real models block (mode/providers).
 */
export function unwrapDoubleNestedModelsInRoot<T extends Record<string, unknown>>(root: T): T {
  const m = root.models
  if (m === undefined || typeof m !== 'object' || m === null || Array.isArray(m)) {
    return root
  }
  const o = m as Record<string, unknown>
  const keys = Object.keys(o)
  if (
    keys.length === 1 &&
    keys[0] === 'models' &&
    typeof o.models === 'object' &&
    o.models !== null &&
    !Array.isArray(o.models)
  ) {
    const inner = o.models as Record<string, unknown>
    if ('providers' in inner || 'mode' in inner) {
      return { ...root, models: inner } as T
    }
  }
  return root
}
