import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebPubSubClient } from "@azure/web-pubsub-client";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const serverUrl = process.env.WHITEBOARD_ENDPOINT || "http://localhost:8080";

const ws = new WebPubSubClient({
  getClientAccessUrl: async () => {
    let res = await fetch(`${serverUrl}/negotiate`);
    let data = await res.json();
    return data.url;
  },
});

const server = new McpServer({
  name: "whiteboard",
  version: "1.0.0",
});

server.tool(
  "add_or_update_shape",
  "Add or update a shape on the whiteboard",
  {
    id: z.string().describe("unique identifier of the shape"),
    patchMode: z.enum(["add", "update"]).describe("Mode to add or update the shape, choose 'update' when the id of an existing shape is used"),
    shapeType: z.enum(["polyline", "line", "rect", "circle", "ellipse", "polygon"]).describe("Type of shape to draw"),
    color: z.string().describe("Color of the shape"),
    fillColor: z.string().describe("Color to fill in the shape"),
    opacity: z.number().optional().describe("Opacity of the shape, range from 0 to 1"),
    width: z.number().describe("Width of the shape border or line"),
    coordinates: z.array(z.number()).describe("Coordinates for the shapes. For a rectangle, it is [x1, y1, x2, y2]; for a circle, it is [cx, cy, radius]; for a line, it is [x1, y1, x2, y]; for a polyline, it is [x1, y1, x2, y2, ...]; for an ellipse, it is [cx, cy, rx, ry]; for a polygon, it is [x1, y1, x2, y2, ...]; "),
    description: z.string().optional().describe("Description of the shape"),
  },
  async ({ id, patchMode, shapeType, color, fillColor, opacity, width, coordinates, description }) => {
    // Simulate drawing the shape on the whiteboard
    const message = {
      kind: shapeType,
      color: color,
      fillColor: fillColor,
      opacity: opacity,
      width: width,
      data: coordinates,
    };
    ws.sendToGroup(
      "draw",
      {
        name: "updateShape",
        data: ["AI", id, message],
      },
      "json",
    );
    if (patchMode === "add") {
      ws.sendEvent(
        "message",
        {
          name: "addShape",
          data: [id, message],
        },
        "json",
      );
    }
    // Return a success message
    return {
      content: [
        {
          type: "text",
          text: `Successfully drew a ${shapeType} ${id} ${description} on the whiteboard.`,
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
for (;;) {
  try {
    await ws.start();
    break;
  } catch (e) {
    console.error("Failed to start WebPubSub connection: " + e.message);
    await sleep(5000);
  }
}
