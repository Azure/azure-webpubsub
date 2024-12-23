import { AbortSignalLike } from "@azure/abort-controller";
import { AzureKeyCredential } from "@azure/core-auth";
import { URL } from "url";
import { randomBytes } from "crypto";

interface ParsedConnectionString {
  credential: AzureKeyCredential;
  endpoint: string;
}

export class AckEntity<T> {
  private readonly _reader: (data: T | undefined, error: string|null, done: boolean) => void;

  constructor(ackId: number, reader: (data: T | undefined, error: string|null, done: boolean) => void, abortSignal?: AbortSignalLike) {
    this._reader = reader;

    this.ackId = ackId;
    abortSignal?.addEventListener("abort", () => {
      // TODO: clean it from map
      this.write(undefined, "aborted", true);
    });
  }

  public ackId;

  public write(value: T | undefined, error: string|null, done: boolean): void {
    setTimeout(() => {
      this._reader(value, error, done);
    }, 0);
  }
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
      const r = randomBytes(1)[0] % 16;
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
  const credential = new AzureKeyCredential(key);
  const port = parsed["port"];
  const url = new URL(endpointPart);
  url.port = port;
  const endpoint = url.toString();
  url.port = "";

  return { credential, endpoint };
}

export class AsyncIterator<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private isClosed = false;
  private resolveCurrent: (() => void) | null = null;
  private errorToThrow: any | null = null;

  add(item: T): void {
    if (!this.isClosed) {
      this.items.push(item);
      if (this.resolveCurrent) {
        this.resolveCurrent();
        this.resolveCurrent = null;
      }
    } else {
      throw new Error('Iterator has been closed. No more items can be added.');
    }
  }

  async next(): Promise<IteratorResult<T>> {
    if (this.errorToThrow) {
      throw this.errorToThrow;
    }

    if (this.items.length > 0) {
      let item = this.items.shift()!;
      return { value: item, done: false };
    } else if (this.isClosed) {
      return { done: true, value: undefined as any };
    } else {
      await new Promise<void>((resolve) => {
        this.resolveCurrent = resolve;
      });

      if (this.errorToThrow) {
        throw this.errorToThrow;
      }

      if (this.items.length > 0) {
        let item = this.items.shift()!;
        return { value: item, done: false };
      } else {
        return { done: true, value: undefined as any };
      }
    }
  }

  error(err: any) {
    this.errorToThrow = err;
    if (this.resolveCurrent) {
      this.resolveCurrent();
      this.resolveCurrent = null;
    }
  }

  close(): void {
    this.isClosed = true;
    if (this.resolveCurrent) {
      this.resolveCurrent();
      this.resolveCurrent = null;
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this;
  }
}

async function readToEnd(iterator: AsyncIterator<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of iterator) {
    chunks.push(chunk);
  }

  return concatUint8Arrays(...chunks);
}

function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, array) => acc + array.length, 0);
  const resultArray = new Uint8Array(totalLength);
  let offset = 0;

  for (const array of arrays) {
    resultArray.set(array, offset);
    offset += array.length;
  }

  return resultArray;
}
