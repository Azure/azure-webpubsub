import sys
from azure.messaging.webpubsubservice import (
    WebPubSubServiceClient
)
from azure.messaging.webpubsubservice.rest import *

if len(sys.argv) != 4:
    print('Usage: python publish.py <connection-string> <hub-name> <message>')
    exit(1)

connection_string = sys.argv[1]
hub_name = sys.argv[2]
message = sys.argv[3]

service_client = WebPubSubServiceClient.from_connection_string(connection_string)
res = service_client.send_request(build_send_to_all_request(hub_name, content=message, content_type='text/plain'))
print(res)