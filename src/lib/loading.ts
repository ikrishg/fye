/** Ensures loading flag is cleared even when the wrapped promise rejects. */
export async function withLoadingFlag<T>(
  setLoading: (value: boolean) => void,
  work: () => Promise<T>,
): Promise<T> {
  setLoading(true);
  try {
    return await work();
  } finally {
    setLoading(false);
  }
}
