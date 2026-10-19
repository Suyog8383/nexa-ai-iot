import type { DataResult } from '@/hooks/result';

import { StateCard } from './StateCard';

/** The loading or error card for a data hook's result. Render it when the data isn't there yet. */
export function ResultState({ isLoading, error }: Pick<DataResult<unknown>, 'isLoading' | 'error'>) {
  if (error) return <StateCard tone="danger" icon="error" title="Couldn't load data" message="Check your connection and try again." />;
  if (isLoading) return <StateCard loading title="Loading…" />;
  return null;
}
