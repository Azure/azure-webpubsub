from flask.testing import FlaskClient


def test_readyz_endpoint_imports_app_and_returns_json():
    import importlib
    appmod = importlib.import_module('python_server.app')
    client: FlaskClient = appmod.app.test_client()
    resp = client.get('/readyz')
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, dict)
    assert 'ready' in data
    assert 'transport' in data and 'storage' in data

