import { parseUrl, tryParseInt } from "../util";

describe("util.ts", () => {
  it("tryParseInt", () => {
    expect(tryParseInt(undefined)).toBeUndefined();
    expect(tryParseInt("")).toBeUndefined();
    expect(tryParseInt("abc")).toBeUndefined();
    expect(tryParseInt("123")).toBe(123);
  });
  it("parseUrl", () => {
    expect(parseUrl("http://localhost:3000")).toEqual(new URL("http://localhost:3000"));
    expect(parseUrl("localhost:3000", "http")).toEqual(new URL("http://localhost:3000"));
    expect(parseUrl("localhost:3000", "https")).toEqual(new URL("https://localhost:3000"));
    expect(parseUrl("localhost", "https")).toEqual(new URL("https://localhost"));
    expect(parseUrl("localhost:3000", false)).toBeUndefined();
    expect(parseUrl("localhost:3000")).toBeUndefined();
    expect(parseUrl("localhost")).toBeUndefined();
  });
});
