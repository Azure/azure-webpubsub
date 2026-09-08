import os
import pytest

class TestEnvironment:
    connection_string = None

    @pytest.fixture(scope='session', autouse=True)
    def global_setup(self):
        # TODO: provision the resources?
        # What if multiple different resources needed?
        self.connection_string = os.getenv('WEB_PUBSUB_CONNECTION_STRING')
        if not self.connection_string:
            raise ValueError('Please set the WEB_PUBSUB_CONNECTION_STRING environment variable.')

    @pytest.fixture(scope='session', autouse=True)
    def global_teardown(self):
        # Clean up any resources if necessary
        yield