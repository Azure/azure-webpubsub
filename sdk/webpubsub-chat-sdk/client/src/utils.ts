export function decodeMessageBody(base64: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64').toString('utf-8');
  }
  // compatibility for browser environment
  return decodeURIComponent(escape(atob(base64))); 
}
