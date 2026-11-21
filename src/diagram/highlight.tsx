import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DiagramNode } from '@/content/types';
import { typeAliases } from './types-style';

/**
 * Lets bold component names in prose ("the **load balancer**") light up the matching node
 * in the nearest diagram. One provider wraps each lesson section.
 */
type HighlightApi = {
  term: string | null;
  setTerm: (term: string | null) => void;
  register: (id: string, nodes: DiagramNode[]) => () => void;
  matches: (text: string) => boolean;
};

const HighlightContext = createContext<HighlightApi | null>(null);

function normalize(text: string): string[] {
  const t = text
    .toLowerCase()
    .replace(/[’'`]s\b/g, '')
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
  const out = [t];
  if (t.endsWith('es')) out.push(t.slice(0, -2));
  if (t.endsWith('s')) out.push(t.slice(0, -1));
  return out;
}

/** Ids of nodes that a piece of bold prose refers to. Exact label matches win over type aliases. */
export function matchNodes(text: string, nodes: DiagramNode[]): string[] {
  const candidates = normalize(text);
  const exact = nodes.filter((n) => {
    const label = n.label.toLowerCase().replace(/\n/g, ' ');
    return candidates.includes(label) || candidates.includes(n.id.toLowerCase());
  });
  if (exact.length) return exact.map((n) => n.id);
  return nodes.filter((n) => typeAliases[n.type].some((alias) => candidates.includes(alias))).map((n) => n.id);
}

export function HighlightProvider({ children }: { children: ReactNode }) {
  const [term, setTerm] = useState<string | null>(null);
  const registry = useRef(new Map<string, DiagramNode[]>());
  const [version, setVersion] = useState(0);

  const register = useCallback((id: string, nodes: DiagramNode[]) => {
    registry.current.set(id, nodes);
    setVersion((v) => v + 1);
    return () => {
      registry.current.delete(id);
      setVersion((v) => v + 1);
    };
  }, []);

  // `version` changes whenever a diagram registers, so consumers re-check their matches.
  const matches = useCallback(
    (text: string) => {
      void version;
      for (const nodes of registry.current.values()) if (matchNodes(text, nodes).length) return true;
      return false;
    },
    [version],
  );

  const api = useMemo(() => ({ term, setTerm, register, matches }), [term, register, matches]);
  return <HighlightContext.Provider value={api}>{children}</HighlightContext.Provider>;
}

export function useHighlight(): HighlightApi | null {
  return useContext(HighlightContext);
}
