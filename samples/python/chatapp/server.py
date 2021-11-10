import sys
import json

from flask import (
    Flask, 
    Response,
    request, 
    send_from_directory,
)

from azure.messaging.webpubsubservice import (
    WebPubSubServiceClient
)

hub_name = 'chat'

app = Flask(__name__)

client = WebPubSubServiceClient.from_connection_string(sys.argv[1])


@app.route('/<path:filename>')
def index(filename):
    return send_from_directory('public', filename)


@app.route('/eventhandler', methods=['POST', 'OPTIONS'])
def handle_event():
    if request.method == 'OPTIONS' or request.method == 'GET':
        if request.headers.get('WebHook-Request-Origin'):
            res = Response()
            res.headers['WebHook-Allowed-Origin'] = '*'
            res.status_code = 200
            return res
    elif request.method == 'POST':
        user_id = request.headers.get('ce-userid')
        if request.headers.get('ce-type') == 'azure.webpubsub.sys.connected':
            return user_id + ' connected', 200
        elif request.headers.get('ce-type') == 'azure.webpubsub.user.message':
            client.send_to_all(hub_name, content_type="application/json", message={
                'from': user_id,
                'message': request.data.decode('UTF-8')
            }
            return 200
        else:
            return 'Not found', 404


@app.route('/negotiate')
def negotiate():
    id = request.args.get('id')
    if not id:
        return 'missing user id', 400

    token = client.get_client_access_token(hub_name, user_id=id)
    return {
        'url': token['url']
    }, 200


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print('Usage: python server.py <connection-string>')
        exit(1)
    app.run(port=8080)
