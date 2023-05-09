// Modified From https://github.com/apollographql/docs-examples/tree/50808f11c5cfeaf029422dee3a3b324a6e93783e/apollo-server/v3/subscriptions

const { createServer } = require("http");
const express = require("express");
const { execute, subscribe } = require("graphql");
const { ApolloServer, gql } = require("apollo-server-express");
const { PubSub } = require("graphql-subscriptions");
const { SubscriptionServer } = require("subscriptions-transport-ws");
const { makeExecutableSchema } = require("@graphql-tools/schema");
import { WebPubSubServerAdapter } from "../../src/index";

(async () => {
  const PORT = 4000;
  const pubsub = new PubSub();
  const app = express();
  const httpServer = createServer(app);

  // Schema definition
  const typeDefs = gql`
    type Query {
      currentNumber: Int
    }

    type Subscription {
      numberIncremented: Int
    }
  `;

  // Resolver map
  const resolvers = {
    Query: {
      currentNumber() {
        return currentNumber;
      },
    },
    Subscription: {
      numberIncremented: {
        subscribe: () => pubsub.asyncIterator(["NUMBER_INCREMENTED"]),
      },
    },
  };

  const schema = makeExecutableSchema({ typeDefs, resolvers });

  const server = new ApolloServer({
    schema,
  });
  await server.start();

  const serverAdapter = new WebPubSubServerAdapter(
    {
      connectionString: process.env.WebPubSubConnectionString,
      hub: "graphql_subscription",
      path: "/graphql_subscription",
    },
    app
  );
  server.applyMiddleware({ app });
  SubscriptionServer.create({ schema, execute, subscribe }, serverAdapter);

  httpServer.listen(PORT, () => {
    console.log(
      `🚀 Query endpoint ready at http://localhost:${PORT}${server.graphqlPath}`
    );
    serverAdapter.getSubscriptionPath().then((v) => {
      console.log(`🚀 Subscription endpoint ready at ${v}`);
      console.log(
        `🚀 Event handler listens at http://localhost:${PORT}${serverAdapter.path}`
      );
    });
  });

  let currentNumber = 0;
  function incrementNumber() {
    currentNumber++;
    pubsub.publish("NUMBER_INCREMENTED", { numberIncremented: currentNumber });
    setTimeout(incrementNumber, 1000);
  }
  // Start incrementing
  incrementNumber();
})();
