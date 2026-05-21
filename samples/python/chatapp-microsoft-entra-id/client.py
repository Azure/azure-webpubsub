from azure.messaging.webpubsubclient import (
    WebPubSubClient,
)

from azure.messaging.webpubsubclient.models import CallbackType

if __name__ == '__main__':
    client = WebPubSubClient("<client-access-url>")
    client.subscribe(CallbackType.CONNECTED, lambda: print("Connected!"))