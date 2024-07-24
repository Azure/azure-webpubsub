# MQTT Client Authentication and Authorization Server Based On Client Certificate

This project is an server to authenticate and authorize MQTT client based on client certificate.

-

## Running the server
To run the server, follow these simple steps:

```
go run main.go
```

To run the server in a docker container
```
docker build --network=host -t openapi .
```

Once image is built use
```
docker run --rm -it openapi
```

## Contributing guidance

This server is based on a generated version by the [openapi-generator]
(https://openapi-generator.tech) project from [Swagger API spec](..\..\..\\protocols\server\cloud-events\tsp-output\@typespec\openapi3\openapi.yaml).

After installing the Open API generator, you can generate the code with the following command:
```bash
openapi-generator-cli generate -i ..\..\..\\protocols\server\cloud-events\tsp-output\@typespec\openapi3\openapi.yaml -g go-server -o .
```

The following files are cutomized:
1. [api_default_service.go](./go/api_default_service.go) is updated to read and parse the client certificates, and return proper struct.
2. The [generated code](./go/api_default.go) to disallow unknwon properties is already made into comment. **As it's expected to have new properties added in the Web PubSub CloudEvents protocol, you MUST allow unknown properties when deserializing request payload from Web PubSub.**
1. The [route()](./go/api_default.go) function is updated to modify exposed endpoints.
3. [go.mod](./go.mod) is updated to add required dependencies.
4. All the above files are added into[.openapi-generator-ignore](./.openapi-generator-ignore) so that regeneration won't override the cutomization part.
