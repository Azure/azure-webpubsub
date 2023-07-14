import { KeyTokenCredential } from "./KeyTokenCredential";

interface ParsedConnectionString {
  credential: KeyTokenCredential;
  endpoint: string;
}

export class PromiseCompletionSource<T> {
  private _resolve!: (value: T | PromiseLike<T>) => void;
  private _reject!: (reason?: any) => void;
  public readonly promise: Promise<T> = new Promise<T>((resolve, reject) => {
    this._resolve = resolve;
    this._reject = reject;
  });

  public resolve(value: T | PromiseLike<T>): void {
    this._resolve(value);
  }

  public reject(reason?: any): void {
    this._reject(reason);
  }
}

export class Guid {
  public static newGuid(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

export function parseConnectionString(conn: string): ParsedConnectionString {
  const parsed: { [id: string]: string } = {};

  conn.split(";").forEach((i) => {
    const assignmentPos = i.indexOf("=");
    if (assignmentPos === -1) return;
    const key = i.substring(0, assignmentPos).toLowerCase();
    const value = i.substring(assignmentPos + 1);
    parsed[key] = value;
  });

  let endpointPart = parsed["endpoint"];
  if (!endpointPart) throw new TypeError("connection string missing endpoint");
  if (!endpointPart.startsWith("http")) {
    endpointPart = `https://${endpointPart}`;
  }
  const key = parsed["accesskey"];
  if (!key) throw new TypeError("connection string missing access key");
  const credential = new KeyTokenCredential(key);
  const port = parsed["port"];
  const url = new URL(endpointPart);
  url.port = port;
  const endpoint = url.toString();
  url.port = "";

  return { credential, endpoint };
}
