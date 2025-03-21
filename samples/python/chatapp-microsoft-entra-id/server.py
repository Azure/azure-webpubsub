import sys

from enum import Enum

from flask import (
    Flask, 
    Response,
    request, 
    send_from_directory,
)

from azure.messaging.webpubsubservice import WebPubSubServiceClient

from azure import identity

class AuthType(Enum):
    AzurePowershell = 0
    VisualStudioCode = 1
    ApplicationWithClientSecret = 2
    ApplicationWithCertification = 3
    ApplicationWithFederatedIdentity = 4
    MsiWithSystemAssignedIdentity = 5
    MsiWithUserAssignedIdentity = 6

hub_name = 'sample_chat_microsoft_entra_id'

app = Flask(__name__)

def _get_token_credential(authType: AuthType):
    if authType == AuthType.AzurePowershell:
        return _get_azure_powershell()
    elif authType == AuthType.VisualStudioCode:
        return _get_visual_studio_code()
    elif authType == AuthType.ApplicationWithClientSecret:
        return _get_application_with_client_secret()
    elif authType == AuthType.ApplicationWithCertification:
        return _get_application_with_certification()
    elif authType == AuthType.ApplicationWithFederatedIdentity:
        return _get_application_with_federated_identity()
    elif authType == AuthType.MsiWithSystemAssignedIdentity:
        return _get_system_assigned_identity()
    elif authType == AuthType.MsiWithUserAssignedIdentity:
        return _get_user_assigned_identity()
    raise Exception('Invalid auth type')


def _get_azure_powershell():
    return identity.AzurePowerShellCredential()


def _get_visual_studio_code():
    return identity.VisualStudioCodeCredential()


def _get_application_with_client_secret():
    # authority = identity.AzureAuthorityHosts.AZURE_GOVERNMENT # Entra ID US Government 
    # authority = identity.AzureAuthorityHosts.AZURE_CHINA # Entra ID China operated by 21Vianet
    authority = identity.AzureAuthorityHosts.AZURE_PUBLIC_CLOUD
    return identity.ClientSecretCredential(
        tenant_id='TENANT_ID',
        client_id='CLIENT_ID',
        client_secret='CLIENT_SECRET',
        authority=authority
    )

def _get_application_with_certification():
    # authority = identity.AzureAuthorityHosts.AZURE_GOVERNMENT # Entra ID US Government 
    # authority = identity.AzureAuthorityHosts.AZURE_CHINA # Entra ID China operated by 21Vianet
    authority = identity.AzureAuthorityHosts.AZURE_PUBLIC_CLOUD
    return identity.CertificateCredential(
        tenant_id='TENANT_ID',
        client_id='CLIENT_ID',
        certificate_path='PATH_TO_CERTIFICATE',
        authority=authority
    )

def _get_application_with_federated_identity():
    # authority = identity.AzureAuthorityHosts.AZURE_GOVERNMENT # Entra ID US Government 
    # authority = identity.AzureAuthorityHosts.AZURE_CHINA # Entra ID China operated by 21Vianet
    authority = identity.AzureAuthorityHosts.AZURE_PUBLIC_CLOUD

    msiCredential = identity.ManagedIdentityCredential(
        client_id='CLIENT_ID',
        authority=authority
    )

    def get_token():
        # Entra ID US Government: api://AzureADTokenExchangeUSGov
        # Entra ID China operated by 21Vianet: api://AzureADTokenExchangeChina
        scope = "api://AzureADTokenExchange/.default"
        return msiCredential.get_token(scope)

    return identity.ClientAssertionCredential(
        tenant_id='TENANT_ID',
        client_id='CLIENT_ID',
        func=get_token,
        authority=authority
    )


def _get_system_assigned_identity():
    return identity.ManagedIdentityCredential()


def _get_user_assigned_identity():
    return identity.ManagedIdentityCredential(client_id='CLIENT_ID')


credential = _get_token_credential(AuthType.AzurePowershell)
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
