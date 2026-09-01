import { render, waitFor } from "@testing-library/react";
import { Method } from "./Methods";
import { Operation } from "../../models";

// Regression guard: the example request is what populates the request body, and
// an empty body leaves the Invoke button permanently disabled. A bad API
// version segment still compiles, type-checks and renders, so only an assertion
// on the requested URL catches it.

vi.mock("./Parameters", () => ({ Parameters: () => <div data-testid="parameters" /> }));
vi.mock("./Response", () => ({ Response: () => <div data-testid="response" /> }));

const method: Operation = {
  operationId: "WebPubSub_SendToAll",
  summary: "Broadcast content inside request body to all the connected client connections",
  parameters: [],
  responses: {},
  "x-ms-examples": {
    WebPubSub_SendToAll: { $ref: "examples/WebPubSub_SendToAll.json" },
  },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    json: async () => ({ parameters: { message: "Message to send" }, responses: {} }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("requests the example from a fully resolved URL", async () => {
  render(<Method method={method} path="/api/hubs/{hub}/:send" methodName="post" />);

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

  const url = fetchMock.mock.calls[0][0] as string;
  expect(url).not.toContain("undefined");
  expect(url).toBe(`./api/${import.meta.env.VITE_API_VERSION}/examples/WebPubSub_SendToAll.json`);
});
