import { loadApiSpec } from "./utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("loadApiSpec requests the spec from a fully resolved URL", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => ({ paths: {}, definitions: {} }),
  });
  vi.stubGlobal("fetch", fetchMock);

  await loadApiSpec();

  const url = fetchMock.mock.calls[0][0] as string;
  expect(url).not.toContain("undefined");
  expect(url).toBe(`./api/${import.meta.env.VITE_API_VERSION}/webpubsub.json`);
});
