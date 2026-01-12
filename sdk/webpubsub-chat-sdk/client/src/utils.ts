export function decodeMessageBody(base64: string | null | undefined): string {
  if (!base64) return "";
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64').toString('utf-8');
  }
  // compatibility for browser environment
  return decodeURIComponent(escape(atob(base64))); 
}
