const request = require("supertest");
const server = require("../server");

describe("negotiate requests", () => {
  test("responds with 400 with no userId", async () => {
    const response = await request(server).get("/negotiate");
    expect(response.status).toBe(400);
    expect(response.text).toBe("missing user id");
  });
  test("responds with 200 with userId", async () => {
    const response = await request(server).get("/negotiate?id=A");
    expect(response.status).toBe(200);
    expect(response.type).toEqual("application/json");

    expect(response.body.url).toMatch(/^wss:\/\/a\/client\/hubs\/sample_chat\?access_token=/);
  });
});

describe("event handler requests", () => {
  test("responds with 404 with event handler request however no valid header", async () => {
    const response = await request(server).options("/eventhandler");
    expect(response.status).toBe(404);
  });

  test("responds with 200 with event handler request", async () => {
    const response = await request(server).options("/eventhandler").set("ce-awpsversion", "1.0").set("WebHook-Request-Origin", "a");
    expect(response.status).toBe(200);
    console.log(response.headers);
    expect(response.headers["webhook-allowed-origin"]).toBe("a");
  });
});

afterAll((done) => {
  server.close(done);
});
