/**
 * What every data hook returns. The field names match TanStack Query's `useQuery` result, so a
 * hook can switch from mock data to a real query without its screens changing.
 */
export type DataResult<T> = {
  data: T | undefined;
  isLoading: boolean;
  error: Error | null;
};

/** A result that is already available — what the mock-backed hooks return today. */
export function resolved<T>(data: T): DataResult<T> {
  return { data, isLoading: false, error: null };
}

/** Loading if any input is loading; the first error if any failed. */
export function combine(...results: DataResult<unknown>[]): Pick<DataResult<unknown>, 'isLoading' | 'error'> {
  return {
    isLoading: results.some((r) => r.isLoading),
    error: results.find((r) => r.error)?.error ?? null,
  };
}
