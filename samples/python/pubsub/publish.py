import sys
from azure.messaging.webpubsubservice import (
    WebPubSubServiceClient
)

if len(sys.argv) != 4:
    print('Usage: python publish.py <connection-string> <hub-name> <message>')
    exit(1)

connection_string = sys.argv[1]
hub_name = sys.argv[2]
message = sys.argv[3]

service_client = WebPubSubServiceClient.from_connection_string(connection_string)
res = service_client.send_to_all(hub_name, message=message, content_type='text/plain')