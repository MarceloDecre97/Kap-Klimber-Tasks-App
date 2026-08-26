import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

/**
 * True only after the client has hydrated. Prefer this over
 * `useEffect(() => setMounted(true), [])`, which triggers a synchronous
 * setState-in-effect (cascading render) lint warning; useSyncExternalStore
 * is the React-recommended way to force the one client-only re-render a
 * hydration-safe component needs.
 */
export function useHasMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
