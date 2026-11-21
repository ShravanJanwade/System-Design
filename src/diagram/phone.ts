import type { DiagramSpec } from '@/content/types';
import { chooseLayout } from './fit';
import { layoutDiagram } from './layout';

/** The diagram panel's inside width on a 375 px phone: 327 px, or 285 px inside a compare block. */
export const PHONE_PANEL = 327;
export const PHONE_COMPARE_PANEL = 285;
/** On a phone every diagram draws at this zoom or more, so card labels stay about 12 px and notes about 10 px. */
export const PHONE_MIN_SCALE = 0.85;

/** The zoom a diagram draws at on a 375 px phone, with the layout the panel would choose. */
export function phoneScale(spec: DiagramSpec, panel: number = PHONE_PANEL): number {
  return chooseLayout({ wide: layoutDiagram(spec, 'wide'), compact: layoutDiagram(spec, 'compact'), narrow: layoutDiagram(spec, 'narrow') }, panel).scale;
}
