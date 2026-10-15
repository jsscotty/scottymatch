import { useEffect, useRef, useState } from 'react';

// Renders a long list in pages and loads the next page when the sentinel
// scrolls into view. Keeps the first paint fast for libraries with thousands of songs.
export function useIncremental<T>(items: T[], pageSize = 40) {
  const [count, setCount] = useState(pageSize);
  const sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => setCount(pageSize), [items, pageSize]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || count >= items.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setCount((c) => Math.min(items.length, c + pageSize));
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [count, items.length, pageSize]);

  return { visible: items.slice(0, count), hasMore: count < items.length, sentinel, showAll: () => setCount(items.length) };
}
