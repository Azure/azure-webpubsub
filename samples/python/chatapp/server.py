import json
import sys
from flask import Flask, request, send_from_directory, Response, make_response
from azure.messaging.webpubsubservice import (
    build_authentication_token,
    WebPubSubServiceClient
)
from azure.messaging.webpubsubservice.rest import *

hub_name = 'chat'

app = Flask(__name__)

@app.route('/<path:filename>')
def index(filename):
    return send_from_directory('public', filename)

@app.route('/eventhandler', methods = ['Post', 'OPTIONS'])
def handle_event():
    if request.method == 'OPTIONS' or request.method == 'GET':
        if request.headers.get('WebHook-Request-Origin'):
            res = Response()
            res.headers['WebHook-Allowed-Origin'] = '*'
            res.status_code = 200
            return res
    elif request.method == 'POST':
        user_id = request.headers.get('Ce-Userid')
        if request.headers.get('Ce-Type') == 'azure.webpubsub.sys.connected':
            return user_id + ' connected', 200
        elif request.headers.get('Ce-Type') == 'azure.webpubsub.user.message':
            client = WebPubSubServiceClient.from_connection_string(sys.argv[1])
            client.send_request(build_send_to_all_request(hub_name, json={
                'from': user_id,
                'message': request.data.decode('UTF-8')
            }))
            res = Response(content_type='text/plain', status=200)
            return res
        else:
            return 'Not found', 404


@app.route('/negotiate')
def negotiate():
    id = request.args.get('id')
    if not id:
        return 'missing user id', 400
    
    token = build_authentication_token(sys.argv[1], hub_name, user=id)
    return {
        'url': token['url']
    }, 200

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print('Usage: python server.py <connection-string>')
        exit(1)
    app.run(port=8080)