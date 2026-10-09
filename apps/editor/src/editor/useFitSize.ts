import { useLayoutEffect, useState, type RefObject } from 'react';

/** The largest box of a given aspect ratio that fits inside an element, kept up to date as the element resizes. */
export function useFitSize(ref: RefObject<HTMLElement | null>, aspect: number): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const { clientWidth: w, clientHeight: h } = el;
      const width = Math.max(0, Math.floor(Math.min(w, h * aspect)));
      const height = Math.floor(width / aspect);
      setSize(prev => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, aspect]);
  return size;
}
