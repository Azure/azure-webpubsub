import { WebPubSubServiceClient } from '@azure/web-pubsub';
import { isLiveMode, assertEnvironmentVariable } from '@azure-tools/test-recorder';
import { Context } from 'mocha';
import { assert } from 'chai';
import ws from 'ws';
import dotenv from 'dotenv';

class TestEnvironment {
  static connectionString;

  static globalSetup() {
    // TODO: provision the resources?
    // What if multiple different resources needed?
    dotenv.config();

    this.connectionString = process.env.WEB_PUBSUB_CONNECTION_STRING;
    if (!this.connectionString) {
      throw new Error('Please set the WEB_PUBSUB_CONNECTION_STRING environment variable.');
    }
  }

  static globalTeardown() {
    // Clean up any resources if necessary
  }
}

export default TestEnvironment;
