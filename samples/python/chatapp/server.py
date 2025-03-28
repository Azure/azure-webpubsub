import os
import sys
import json
import html

from flask import (
    Flask, 
    Response,
    request, 
    send_from_directory,
)

from azure.messaging.webpubsubservice import (
    WebPubSubServiceClient
)

hub_name = 'Sample_ChatApp'

app = Flask(__name__)
if len(sys.argv) > 1:
    connection_string = sys.argv[1]
else:
    # If no arguments are provided, fallback to environment variable
    connection_string = os.environ.get('WebPubSubConnectionString')

if connection_string is None:
    print("Error: Connection string not provided. Please provide it as a command-line argument or set it as an environment variable.")
    sys.exit(1)

service = WebPubSubServiceClient.from_connection_string(connection_string, hub=hub_name)

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
        type = request.headers.get('ce-type')
        print("Received event of type:", type)
        # Sample connect logic if connect event handler is configured
        if type == 'azure.webpubsub.sys.connect':
            body = request.data.decode('utf-8')
            print("Reading from connect request body...")
            query = json.loads(body)['query']
            print("Reading from request body query:", query)
            id_element = query.get('id')
            user_id = id_element[0] if id_element else None
            if user_id:
                return {'userId': html.escape(user_id)}, 200
            return 'missing user id', 401
        elif type == 'azure.webpubsub.sys.connected':
            return 'connected', 200
        elif type == 'azure.webpubsub.user.message':
            service.send_to_all(content_type="application/json", message={
                'from': html.escape(user_id),
                'message': request.data.decode('UTF-8')
            })
            return Response(status=204, content_type='text/plain')
        else:
            return 'Bad Request', 400


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
    app.run(port=8080)
