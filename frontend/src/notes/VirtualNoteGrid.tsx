import { Spinner } from "@/components/ui/spinner";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

// Mirrors the old CSS grid: repeat(auto-fill, minmax(260px, 320px)) with a
// 16px gap, i.e. as many 260px-min columns as fit.
const MIN_CARD_WIDTH = 260;
const MAX_CARD_WIDTH = 320;
const GAP = 16;
const ESTIMATED_ROW_HEIGHT = 280 + GAP;
const LOAD_MORE_WITHIN_ROWS = 3;

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

interface VirtualNoteGridProps<T extends { id: number }> {
  items: T[];
  renderItem: (item: T) => ReactNode;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

// Only the rows near the viewport are ever mounted (thousands of cards would
// otherwise each run a full markdown+syntax-highlight render), and the next
// server page is fetched as the user nears the bottom. The page itself scrolls
// (there's no inner scroll container), hence the window virtualizer.
export function VirtualNoteGrid<T extends { id: number }>({
  items,
  renderItem,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: VirtualNoteGridProps<T>) {
  // The React Compiler memoizes calls on the (stable-identity) virtualizer,
  // e.g. getTotalSize(), and serves stale results -- TanStack Virtual's known
  // incompatibility with it. Opt this component out.
  "use no memo";
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const columns = Math.max(1, Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP)));
  const rowCount = Math.ceil(items.length / columns);

  // Distance from the top of the document to the top of this list (the header
  // and filter rows above it can change height), so scroll offsets line up.
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const top = element.getBoundingClientRect().top + window.scrollY;
    if (Math.abs(top - scrollMargin) > 0.5) setScrollMargin(top);
  });

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 3,
    scrollMargin,
    getItemKey: (row) => items[row * columns]?.id ?? row,
  });
  const virtualRows = virtualizer.getVirtualItems();

  const lastRow = virtualRows[virtualRows.length - 1]?.index ?? -1;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && lastRow >= rowCount - LOAD_MORE_WITHIN_ROWS) {
      fetchNextPage();
    }
  }, [lastRow, rowCount, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div ref={containerRef} className="w-full">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualRows.map((row) => (
          <div
            key={row.key}
            data-index={row.index}
            ref={virtualizer.measureElement}
            className="absolute top-0 left-0 w-full"
            style={{
              transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
              paddingBottom: GAP,
            }}
          >
            <div
              className="grid items-start"
              style={{
                gap: GAP,
                gridTemplateColumns: `repeat(${columns}, minmax(${MIN_CARD_WIDTH}px, ${MAX_CARD_WIDTH}px))`,
              }}
            >
              {items.slice(row.index * columns, row.index * columns + columns).map((item) => (
                <div key={item.id} className="min-w-0">
                  {renderItem(item)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {isFetchingNextPage && (
        <div className="flex justify-center py-4 text-muted-foreground">
          <Spinner />
        </div>
      )}
    </div>
  );
}
