// Common-prefix/common-suffix diff — good enough for the identifiers this
// app diffs (chassis numbers, booklet numbers): usually same length, one
// changed run in the middle or at an end, not a full rewrite. A full
// Myers/LCS diff would handle insertions/deletions better but is overkill
// for the values actually flowing through VehicleChangeRequest.
export interface ValueDiff {
  prefix: string;
  oldChanged: string;
  newChanged: string;
  suffix: string;
}

export function diffValues(oldValue: string, newValue: string): ValueDiff {
  let prefixLen = 0;
  const maxPrefix = Math.min(oldValue.length, newValue.length);
  while (prefixLen < maxPrefix && oldValue[prefixLen] === newValue[prefixLen]) {
    prefixLen++;
  }

  let suffixLen = 0;
  const maxSuffix = Math.min(oldValue.length, newValue.length) - prefixLen;
  while (
    suffixLen < maxSuffix &&
    oldValue[oldValue.length - 1 - suffixLen] === newValue[newValue.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  return {
    prefix: oldValue.slice(0, prefixLen),
    oldChanged: oldValue.slice(prefixLen, oldValue.length - suffixLen),
    newChanged: newValue.slice(prefixLen, newValue.length - suffixLen),
    suffix: oldValue.slice(oldValue.length - suffixLen),
  };
}
