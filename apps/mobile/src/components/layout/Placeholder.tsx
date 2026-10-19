import type { ReactNode } from 'react';

import { StateCard } from '@/components/feedback/StateCard';
import type { IconName } from '@/components/ui/Icon';

import { Screen } from './Screen';
import { StackHeader } from './StackHeader';

/** Route stub for screens not yet designed in Stitch. */
export function Placeholder({ title, icon, message, children }: { title: string; icon: IconName; message: string; children?: ReactNode }) {
  return (
    <Screen header={<StackHeader backLabel="Back" title={title} />}>
      {children}
      <StateCard icon={icon} title={title} message={message} />
    </Screen>
  );
}
