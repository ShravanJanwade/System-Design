import type { NodeType } from '@/content/types';

/**
 * Custom line glyphs for diagram components, drawn on a 24×24 grid with a 1.5 px stroke.
 * One glyph per component type, identical everywhere in the app.
 */
const paths: Record<NodeType, string> = {
  client: 'M3.5 5.5a1.5 1.5 0 0 1 1.5-1.5h14a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z M3.5 8.5h17 M7 13h6 M7 16h9',
  dns: 'M12 3v18 M12 5.5h6l2 2.25-2 2.25h-6 M12 12.5H6l-2 2.25 2 2.25h6 M9 21h6',
  cdn: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17z M12 3.5c-2.4 2.4-3.5 5.2-3.5 8.5s1.1 6.1 3.5 8.5 M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5 M3.5 12h17',
  loadBalancer: 'M3 12h4.5 M7.5 12l5-5.5h4.5 M7.5 12h9.5 M7.5 12l5 5.5h4.5 M15 4.5l2 2-2 2 M15 10l2 2-2 2 M15 15.5l2 2-2 2 M19.5 6.5h1 M19.5 12h1 M19.5 17.5h1',
  gateway: 'M4.5 20.5V10a7.5 7.5 0 0 1 15 0v10.5 M3 20.5h18 M9 20.5v-6.5h6v6.5',
  service: 'M4 4.5h16v6H4z M4 13.5h16v6H4z M7.5 7.5h.01 M7.5 16.5h.01 M11 7.5h5.5 M11 16.5h5.5',
  worker: 'M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z M12 3v2.5 M12 18.5V21 M3 12h2.5 M18.5 12H21 M5.6 5.6l1.8 1.8 M16.6 16.6l1.8 1.8 M5.6 18.4l1.8-1.8 M16.6 7.4l1.8-1.8',
  cache: 'M13.5 3 6 13.5h5.5L10.5 21 18 10.5h-5.5z',
  sqlDb: 'M5 6c0-1.4 3.1-2.5 7-2.5s7 1.1 7 2.5-3.1 2.5-7 2.5S5 7.4 5 6z M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6 M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5',
  nosqlDb: 'M5 6c0-1.4 3.1-2.5 7-2.5s7 1.1 7 2.5-3.1 2.5-7 2.5S5 7.4 5 6z M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6 M12 8.5v12',
  objectStore: 'M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z M4 7l1.6 11.6c.2 1.4 3 2.4 6.4 2.4s6.2-1 6.4-2.4L20 7',
  blockStore: 'M4 6.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M4 13.5h16 M7.5 16.5h.01 M11 16.5h5.5 M8 9h8',
  fileStore: 'M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4.2l2 2.2H19a1.5 1.5 0 0 1 1.5 1.5v8.3a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z M3.5 10.5h17',
  queue: 'M2.5 9a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z M7.5 7v10 M12 7v10 M16.5 7v10',
  stream: 'M3 8c3-2.5 6 2.5 9 0s6-2.5 9 0 M3 12.5c3-2.5 6 2.5 9 0s6-2.5 9 0 M3 17c3-2.5 6 2.5 9 0s6-2.5 9 0',
  search: 'M10.5 4.5a6 6 0 1 0 0 12a6 6 0 1 0 0-12z M15 15l5.5 5.5',
  external: 'M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.6 4.5 4.5 0 0 0 7 18.5z',
};

export function Glyph({
  type,
  x = 0,
  y = 0,
  size = 20,
  color = 'currentColor',
}: {
  type: NodeType;
  x?: number;
  y?: number;
  size?: number;
  color?: string;
}) {
  const scale = size / 24;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} aria-hidden="true">
      <path
        d={paths[type]}
        fill="none"
        stroke={color}
        strokeWidth={1.5 / scale}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** Standalone glyph for HTML contexts, such as legends and the command palette. */
export function GlyphIcon({ type, size = 18, className }: { type: NodeType; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d={paths[type]} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
