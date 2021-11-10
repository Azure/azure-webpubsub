import sys

from azure.messaging.webpubsubservice import WebPubSubServiceClient

if __name__ == '__main__':

    if len(sys.argv) != 4:
        print('Usage: python publish.py <connection-string> <hub-name> <message>')
        exit(1)

    connection_string = sys.argv[1]
    hub_name = sys.argv[2]
    message = sys.argv[3]

    client = WebPubSubServiceClient.from_connection_string(connection_string)
    res = client.send_to_all(hub_name, message, content_type='text/plain')
    print(res)
