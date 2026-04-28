export function canonicalize(value) {
  return JSON.stringify(toCanonicalValue(value));
}

function toCanonicalValue(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(toCanonicalValue);
  }

  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) {
      out[key] = toCanonicalValue(value[key]);
    }
  }
  return out;
}
