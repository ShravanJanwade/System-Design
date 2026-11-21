import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Content-box width of an element, kept current with a ResizeObserver. */
export function useElementWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [width, setWidth] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    observer.current = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.current.observe(el);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, width];
}

/** True while at least `threshold` of the element is on screen. */
export function useInView<T extends Element>(threshold = 0.3): [(el: T | null) => void, boolean] {
  const [inView, setInView] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const ref = useCallback(
    (el: T | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!el) return;
      if (typeof IntersectionObserver === 'undefined') {
        setInView(true);
        return;
      }
      observer.current = new IntersectionObserver((entries) => setInView(Boolean(entries[0]?.isIntersecting)), {
        threshold,
      });
      observer.current.observe(el);
    },
    [threshold],
  );
  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, inView];
}

export const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Matches a CSS media query, updating on change. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** True if the keyboard event came from a text field, where shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
