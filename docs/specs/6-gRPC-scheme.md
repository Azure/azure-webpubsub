---
layout: docs
toc: true
title: gRPC scheme for Web PubSub
group: specs
---

# Overview

Our goal is to replace HTTP communication between Web PubSub service and upstream server with gRPC.
In this scheme, Web PubSub service is a gRPC server while upstream server is gRPC client.
Sequence Diagram is [here](https://microsoft-my.sharepoint.com/personal/t-siyuanxing_microsoft_com/_layouts/15/Doc.aspx?sourcedoc={819e080f-0358-4719-b7f7-9bc281f1f91a}&action=embedview).

# WorkFlow
1. Start up our Web Pubsub service as a gRPC server
2. Start up upstream server as a gRPC client
3. Upstream server calls the gRPC method `register`, which is a server-side streaming gRPC method, with a `RegisterMessage`
4. Our service verify the `RegisterMessage` sent by upstream server and decide whether to accept or reject it. If the service accepts this `RegisterMessage`, the workflow will go on.
5. Downstream clients will build WebSocket connection with the service and then sends messages to the service. According the this, the service will constanly send `StreamingRequest` to the upstream server via its response stream. `StreamingRequest` is a protobuf datatype which is one of `ConnectRequest`, `ConnectedRequest`, `MessageRequest`, `DisconnectedRequest`.
5. If the upstream receive a `StreamingRequest` which is actually `ConnectRequest`, it will call the simple gRPC method `ackConnect` with a `AckConnectRequest` to respond the `ConnectRequest`
6. If the upstream receive a `StreamingRequest` which is actually `MessageRequest`, it will call the simple gRPC method `ackMessage` with a `AckMessageRequest` to respond the `MessageRequest`

# GRPC methods 
`register` is the only one server-side streaming gRPC method. While the others are all simple gRPC method.

## rpc register(RegisterMessage) returns (stream StreamingRequest){}

Upstream server calls this method with a `RegisterMessage` to our service. After the service verifiy this registration successfully, this service-side streaming method will be built and will keep active until the upstream service is shutdown. 

`StreamingRequest` is a protobuf datatype which is one of `ConnectRequest`, `ConnectedRequest`, `MessageRequest`, `DisconnectedRequest`.
When downstream client communicates with the service, the service will create a `StreamingRequest` with a corresponding protobuf datatype, which is listed above.
Upstream will respond two kinds of `StreamingRequest`, which are `ConnectRequest` and `MessageRequest`, via their corresponding simple gRPC methods rather than this server-side streaming method.


## rpc ackConnect(AckConnectRequest) returns (Empty) { }

After receiving a `ConnectRequest` from server-side streaming `register`, the upstream server calls this method with `AckConnectRequest` to repond to a `ConnectRequest`


## rpc ackMessage(AckMessageRequest) returns (Empty) { }

After receiving a `MessageRequest` from server-side streaming `register`, the upstream server calls this method whose parameter is `AckMessageRequest` to repond to a `MessageRequest`.

 

## rpc sendToGroup(SendToGroupRequest) returns (Empty) { }

Upstream server calls this method to send a message to a specific group of downstream clients.

Similary methods:

- rpc SendToAll(SendToAllRequest) returns (Empty) { }

- rpc leaveGroup(LeaveGroupRequest) returns (Empty) { }

- rpc joinGroup(JoinGroupRequest) returns (Empty) { }

- ...

# Sample
In Web PubSub service (gRPC server)
```csharp
public override async Task register(RegisterMessage registerMessage, IServerStreamWriter<StreamingRequest> responseStream, ServerCallContext context) {
    AsyncQueue<StreamingRequest> s; // s is a queue which simulates the events triggered by downstream clients
	if (verify(registerMessage)) {
        Console.WriteLine("A new downstream client is accepted & registered");
        var responseWriterTask = Task.Run(async () => {
			while (true) {
	            var x = await s.DequeueAsync();
	            switch (x.RequestCase) {
	              case StreamingRequest.RequestOneofCase.ConnectRequest:
	              	Console.WriteLine("Connect Request");
	                await responseStream.WriteAsync(x); break;

	              case StreamingRequest.RequestOneofCase.ConnectedRequest:
	                Console.WriteLine("Connected Request");
	                await responseStream.WriteAsync(x); break;

	              case StreamingRequest.RequestOneofCase.MessageRequest:
	                Console.WriteLine("Message Reqeust");
	                await responseStream.WriteAsync(x); break;

	              case StreamingRequest.RequestOneofCase.DisconnectedRequest:
	                Console.WriteLine("Disconnected Request");
	                await responseStream.WriteAsync(x); break;

	              default: throw new ArgumentException("Unknown instrument type");
            }
          }
        });
        await responseWriterTask;
	}
}		
```

In upstream server (gRPC client)
```csharp
var channel = new Channel("127.0.0.1:30052", ChannelCredentials.Insecure);
var client = new WpsRpcClient(new WpsRpc.WpsRpcClient(channel));

using (var call = client.register(new RegisterMessage())) {
	while (await call.ResponseStream.MoveNext()) {
		switch (call.ResponseStream.Current.RequestCase) {
      
		case StreamingRequest.RequestOneofCase.ConnectRequest:
			Console.WriteLine("a downstream client want to connect and we permit it");
			var ackConnectCall = client.ackConnect(new AckConnectRequest());
			break;

		case StreamingRequest.RequestOneofCase.ConnectedRequest: 
			Console.WriteLine("a downstream client is connected"); 
			break;

		case StreamingRequest.RequestOneofCase.MessageRequest:
			Console.WriteLine("a downstream client send a message and we respond to it");
			var ackMessageCall= client.ackMessage(new AckMessageRequest());
			break;

		case StreamingRequest.RequestOneofCase.DisconnectedRequest: 
			Console.WriteLine("a downstream client is disconnected"); 
			break;

		default: 
			throw new ArgumentException("Unknown instrument type");
    }
  }
}
```

# Protobuf Definitions
```protobuf
// message definitions
message ConnectRequest		{ int32 data = 1; ... }
message ConnectedRequest	{ int32 data = 1; ... } 
message MessageRequest		{ int32 data = 1; ... } 
message DisconnectedRequest	{ int32 data = 1; ... }
message AckEventMessage		{ int32 data = 1; ... }
message AckConnectMessage	{ int32 data = 1; ... }
message StreamingRequest {
	oneof request {
		ConnectRequest connect_request = 1;
		ConnectedRequest connected_request = 2;
		MessageRequest message_request = 3;
		DisconnectedRequest disconnected_request = 4;
	}
}

message StreamingResponse{
    oneof response{
    	ConnectResponse connect_response= 1;
    	MessageResponse message_response= 2;
	}
}
message AckConnectRequest {
	string connection_id = 1;
	AckConnectMessage ack_connect_message = 2;
}
message AckMessageRequest {
    string connection_id = 1;
    AckEventMessage ack_event_message = 2;
}
message SendToGroupRequest {
	string connection_id = 1;
	string group_name = 2;
	Message message = 3;
}

// method defintions
service WpsRpc {
    rpc register(RegisterMessage) returns (stream StreamingRequest) { }
    rpc ackConnect(AckConnectRequest) returns (google.protobuf.Empty) { }
    rpc ackMessage(AckMessageRequest) returns (google.protobuf.Empty) { }
    rpc sendToGroup(SendToGroupRequest) returns (google.protobuf.Empty) { }
    ...
}
```