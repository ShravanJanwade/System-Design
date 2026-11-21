import { RouterProvider } from 'react-router/dom';
import { Tooltip } from 'radix-ui';
import { MotionConfig } from 'motion/react';
import { useReducedMotion } from '@/state/settings';
import { router } from './router';

export function App() {
  const reduced = useReducedMotion();
  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      <Tooltip.Provider delayDuration={350} skipDelayDuration={150}>
        <RouterProvider router={router} />
      </Tooltip.Provider>
    </MotionConfig>
  );
}
