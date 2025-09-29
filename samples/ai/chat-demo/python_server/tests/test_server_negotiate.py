import os
import time
import threading
import pytest
from flask.testing import FlaskClient

# We import the server module inside the test so environment fixtures apply first

@pytest.mark.timeout(15)
def test_server_negotiate_endpoint(monkeypatch):
    monkeypatch.setenv('TRANSPORT_MODE','self')
    monkeypatch.setenv('STORAGE_MODE','memory')

    import importlib
    # Import the application module (contains Flask app)
    appmod = importlib.import_module('python_server.application')

    # Use Flask test client directly; background loop should have been started
    client: FlaskClient = appmod.app.test_client()

    # Poll negotiate until ready or timeout
    deadline = time.time() + 5
    while time.time() < deadline:
        resp = client.get('/negotiate?roomId=public')
        if resp.status_code == 200:
            # Current negotiate returns a plain text URL
            text = resp.get_data(as_text=True)
            assert isinstance(text, str) and len(text.strip()) > 0
            return
        time.sleep(0.1)
    pytest.fail('negotiate endpoint not ready in time')
