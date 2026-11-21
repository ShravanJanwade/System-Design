import { BookOpen, FlaskConical, House, Library, PencilRuler, Target } from 'lucide-react';

/** The six top-level sections, shown in the sidebar and the bottom tab bar. */
export const sections = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/learn', label: 'Learn', icon: BookOpen, end: false },
  { to: '/playground', label: 'Playground', icon: FlaskConical, end: false },
  { to: '/problems', label: 'Problems', icon: PencilRuler, end: false },
  { to: '/practice', label: 'Practice', icon: Target, end: false },
  { to: '/reference', label: 'Reference', icon: Library, end: false },
] as const;
