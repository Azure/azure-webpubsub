/**
 * Generates a random ID
 */
export const generateId = (prefix: string): string => {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return `${prefix}-${result}`;
};

/**
 * Gets room ID from URL parameters, or generates a new one
 */
export const getIdFromUrl = (key: string): string | null => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(key);
};

export const getOrGenerateIdFromUrl = (key: string, prefix: string): string => {
  const idParam = getIdFromUrl(key);

  if (idParam) {
    return idParam;
  }
  
  return generateId(prefix);
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
