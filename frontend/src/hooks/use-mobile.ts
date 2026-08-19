import * as React from "react"

const MOBILE_BREAKPOINT = 768

const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

const getSnapshot = () => window.matchMedia(query).matches

const subscribe = (onChange: () => void) => {
  const mql = window.matchMedia(query)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

/**
 * `useSyncExternalStore` rather than useState + useEffect: the viewport is external state, and
 * reading it during render means the first paint already has the right value. The previous version
 * set state inside an effect, so it always rendered once with `isMobile` undefined and then again
 * with the real value — a cascading render, and a visible layout flip on mobile.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, () => false)
}
