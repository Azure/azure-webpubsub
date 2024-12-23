import json
import sys

from flask import (
    Flask, 
    Response,
    request, 
    send_from_directory,
)

from azure.messaging.webpubsubservice import WebPubSubServiceClient

from azure.identity import (
    DefaultAzureCredential
)

hub_name = 'sample_aadchat'

app = Flask(__name__)

credential = DefaultAzureCredential()
service = WebPubSubServiceClient(hub=hub_name, endpoint=sys.argv[1], credential=credential)


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
            return 'connected', 200
        elif request.headers.get('ce-type') == 'azure.webpubsub.user.message':
            service.send_to_all(content_type="application/json", message={
                'from': user_id,
                'message': request.data.decode('UTF-8')
            })
            res = Response(content_type='text/plain', status=200)
            return res
        else:
            return 'Not found', 404


@app.route('/negotiate')
def negotiate():
    id = request.args.get('id')
    if not id:
        return 'missing user id', 400

    token = service.get_client_access_token(user_id=id)
    return {
        'url': token['url']
    }, 200


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print('Usage: python server.py <endpoint>')
        exit(1)
    app.run(port=8080)
