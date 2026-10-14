import { useEffect, useState } from 'react';

// A filter the person chose, remembered on this device for them (Phase 6, B2:
// «remembered filters per user»). The key carries the user id so two people
// sharing a desk computer do not inherit each other's filters. Storage that
// is blocked or full simply means nothing is remembered.
export function usePersistedState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // not remembered
    }
  }, [key, value]);
  return [value, setValue];
}
