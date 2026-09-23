# Get started with the Web PubSub emulator in Docker

You need Docker with Linux containers and BuildKit, curl, and a checkout of this
repository. Building and running this image does not require .NET on your host.

The commands below use Bash and start from the repository root.

## 1. Build the image from a package

Choose a published version from the [emulator package on NuGet](https://www.nuget.org/packages/Microsoft.Azure.WebPubSub.Emulator).
Replace `<version>` below with that version, then download the package and build the image:

```bash
version='<version>'
mkdir -p artifacts/emulator
curl --fail --location \
  "https://www.nuget.org/api/v2/package/Microsoft.Azure.WebPubSub.Emulator/$version" \
  --output "artifacts/emulator/Microsoft.Azure.WebPubSub.Emulator.$version.nupkg"
docker build --file tools/emulator/Dockerfile \
  --build-arg "EMULATOR_VERSION=$version" \
  --tag webpubsub-emulator:local artifacts/emulator
```

## 2. Start the emulator

```bash
docker run --rm --name webpubsub-emulator \
  --publish 127.0.0.1:8080:8080 \
  webpubsub-emulator:local
```

Keep this terminal open. The emulator starts with its default local-development
settings and access key; no configuration file is needed. Keep the published port
bound to `127.0.0.1` for local use.

## 3. Connect your application

Copy the connection string printed at startup into your server SDK. In another
terminal, check readiness:

```bash
curl --head http://localhost:8080/api/health
```

A ready emulator returns `200 OK`. Next, [connect a client](../README.md#connect-a-client)
and [send messages with your server SDK](../README.md#use-a-server-sdk).

If you publish another host port, such as `127.0.0.1:8090:8080`, use
`http://localhost:8090` in the connection string. Applications on the same Docker
network can use the emulator's network name and port 8080.

Stop the emulator with Ctrl+C in its terminal, or from another terminal:

```bash
docker stop webpubsub-emulator
```

The `--rm` option removes the container when it stops. Run the start command again
to create a new instance.

## Optional: configure HTTP handlers or other settings

To receive client events in your application, create a folder for your configuration:

```bash
config_dir="$HOME/webpubsub-emulator"
mkdir -p "$config_dir"
```

Create `appsettings.json` in that folder. For example, this configures a handler
for the `chat` hub while keeping the default access key:

```json
{
  "WebPubSub": {
    "Hubs": {
      "chat": {
        "EventHandlers": [{
          "UrlTemplate": "http://host.docker.internal:7071/events/{hub}/{event}",
          "SystemEvents": ["connect", "connected", "disconnected"],
          "EventPattern": "*"
        }]
      }
    }
  }
}
```

Replace the example URL with your application's [HTTP handler](../README.md#http-lifecycle-notifications).
Stop the previous emulator, then start it with the configuration folder mounted:

```bash
docker run --rm --name webpubsub-emulator \
  --publish 127.0.0.1:8080:8080 \
  --mount "type=bind,source=$config_dir,target=/app,readonly" \
  webpubsub-emulator:local
```

The emulator reads `/app/appsettings.json`. Edit the file on your host; changes to
`EventHandlers` and `EventListeners` reload without rebuilding or reconnecting clients.
Changes to `AccessKey` or `AllowUnvalidatedEntraTokens` require `docker restart webpubsub-emulator`.
If you customize the access key, update your application's connection string and client tokens.
See [configuration and access keys](../README.md#configure-the-endpoint-and-access-key).

Settings take precedence in this order: **emulator arguments → environment variables →
`appsettings.json`**. Use `__` for nested environment-variable keys and `:` for emulator arguments.
The image listens on port 8080; normally you only need to change the published host port.

- On Docker Desktop, `host.docker.internal` reaches your host application.
- On Linux Docker Engine, add `--add-host host.docker.internal:host-gateway` to `docker run`.
- For another container on the same network, use its service name and port.

The handler must listen on an address reachable from Docker. `localhost` inside the
emulator container refers to the emulator itself. Server-to-client messaging does
not require an HTTP handler.

## Optional: test source changes

With the .NET SDK installed on your host, [pack the tool](../README.md#pack-and-install-the-tool)
to produce a `.nupkg` in `artifacts/emulator`. Set `version` to the package version
and run the `docker build` command from step 1.
