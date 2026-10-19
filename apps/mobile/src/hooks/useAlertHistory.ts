import type { AlertHistoryItem } from '@/domain/types';
import { alertHistory } from '@/mocks/fixtures';

import { resolved, type DataResult } from './result';

/** Past alert events, newest first. Rules themselves live in the alerts store. */
export function useAlertHistory(): DataResult<AlertHistoryItem[]> {
  return resolved(alertHistory);
}
