import "@azure/web-pubsub-socket.io"
import { Server } from "socket.io";

const wpsOptions = {
    hub: "eio_hub",
    connectionString: process.argv[2] || process.env.WebPubSubConnectionString,
    webPubSubServiceClientOptions: { allowInsecureConnection: true }
};

async function main() {
    const io = await (new Server(3000) as any).useAzureSocketIO(wpsOptions);

    io.on("connect", (socket) => {
        console.log(`connect ${socket.id}`);

        socket.on("ping", (cb) => {
            console.log("ping");
            cb();
        });

        socket.on("disconnect", () => {
            console.log(`disconnect ${socket.id}`);
        });
    });
}

main();