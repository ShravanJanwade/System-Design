import type { ComponentType } from 'react';
import type { SimulatorPreset, WidgetId } from '@/content/types';

/**
 * Props every widget receives. The lesson renderer draws the title and caption around it;
 * the widget draws its own interactive panel and a text description for screen readers.
 */
export type WidgetProps = {
  /** Lesson-specific settings, from the block's `props`. */
  props?: SimulatorPreset;
};

type WidgetModule = { default: ComponentType<WidgetProps> };

/** Every widget folder with a View.tsx is picked up automatically. */
const views = import.meta.glob<WidgetModule>('./*/View.tsx');

export function widgetLoader(id: WidgetId): (() => Promise<WidgetModule>) | undefined {
  return views[`./${id}/View.tsx`];
}
