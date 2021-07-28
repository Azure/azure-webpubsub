// Modified From https://github.com/apollographql/docs-examples/blob/7105d77acfc67d6cb4097cc27a7956051ec0c1b5/server-subscriptions-as3/index.js
import { ApolloServer, gql } from "apollo-server-express";
import { execute, subscribe } from "graphql";
import { PubSub } from "graphql-subscriptions";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { createServer } from "http";
import { SubscriptionServer } from 'subscriptions-transport-ws';
import express from 'express';
import {config} from "../utils"

const pubsub = new PubSub();

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
	SubscriptionServer.create(
		{ schema, execute, subscribe },
		{ server: httpServer, path: apolloServer.graphqlPath }
	);
	
	// start the http server
	httpServer.listen(config.DEFAULT_SERVER_PORT, () => {
		console.log(`🚀 Query endpoint ready at http://localhost:${config.DEFAULT_SERVER_PORT}${apolloServer.graphqlPath}`);
		console.log(`🚀 Subscription endpoint ready at ws://localhost:${config.DEFAULT_SERVER_PORT}${apolloServer.graphqlPath}`
		);
	});

	incrementNumber();
}

main()