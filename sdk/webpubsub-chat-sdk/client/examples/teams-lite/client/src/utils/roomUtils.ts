/**
 * Gets room ID from URL parameters, or generates a new one
 */
export const getIdFromUrl = (key: string): string | null => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(key);
};

/**
 * Updates the browser URL with the ID
 */
export const updateUrlWithId = (id: string | undefined, key: string): void => {
  const url = new URL(window.location.href);
  if (id) {
    url.searchParams.set(key, id);
  } else {
    url.searchParams.delete(key);
  }
  window.history.replaceState({}, '', url.toString());
};
