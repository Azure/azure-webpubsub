// Modified From https://github.com/apollographql/docs-examples/blob/7105d77acfc67d6cb4097cc27a7956051ec0c1b5/server-subscriptions-as3/index.js
import { create_webpubsub_subscribe_server, WpsPubSub } from '../index';
import { ApolloServer, gql } from "apollo-server-express";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { SubscriptionServer } from 'subscriptions-transport-ws';
import { PubSub } from "graphql-subscriptions";
import { createServer } from "http";
import { execute, subscribe } from "graphql";
import {config} from "../utils"
import express from 'express';

const webpubsub_conn_string = "<web-pubsub-connection-string>";

// when useWPS = false, subscription server will be launched without Azure WebPub support
const useWPS = true;

const pubsub = useWPS ? new WpsPubSub(webpubsub_conn_string) : new PubSub();

let currentNumber = 0;

// Schema definition
const typeDefs = gql`
	type Query { currentNumber: Int }
	type Subscription { numberIncremented: Int }
`;

// Resolver map
const resolvers = {
	Query: {
		currentNumber() { return currentNumber; }
	},
	Subscription: {
		numberIncremented: {
			subscribe: () => pubsub.asyncIterator(['NUMBER_INCREMENTED']),    // subscribe: asyncIterator([<event-name-1>, ...])
		},
	}
};

const schema = makeExecutableSchema({ typeDefs, resolvers });

function incrementNumber() {
	currentNumber++;
	pubsub.publish('NUMBER_INCREMENTED', { numberIncremented: currentNumber });     // publish: publish(<event-name>, <event-data>)
	setTimeout(incrementNumber, 1000);
}

async function main() {
	// Create a HTTP server
	const app = express();
	const httpServer = createServer(app);	// http.createServer
	
	// Create and instlal Apollo Server
	const apolloServer = new ApolloServer({schema});
	await apolloServer.start();
	app.use(apolloServer.getMiddleware());

	// Create a Subscription Server
	if (useWPS) {
		await create_webpubsub_subscribe_server(apolloServer, schema, pubsub as WpsPubSub, webpubsub_conn_string);
	} else {
		SubscriptionServer.create(
			{ schema, execute, subscribe },
			{ server: httpServer, path: apolloServer.graphqlPath }
		);
	}

	// start the http server
	httpServer.listen(config.DEFAULT_SERVER_PORT, () => {
		console.log(`🚀 Query endpoint ready at http://localhost:${config.DEFAULT_SERVER_PORT}${apolloServer.graphqlPath}`);
		console.log("🚀 Subscription endpoint ready at "  + (useWPS ? apolloServer.subscriptionsPath : `ws://localhost:${config.DEFAULT_SERVER_PORT}${apolloServer.graphqlPath}`));
	});

	incrementNumber();
}

main()