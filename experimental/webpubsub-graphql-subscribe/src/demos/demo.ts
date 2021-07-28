// Modified From https://github.com/apollographql/docs-examples/blob/7105d77acfc67d6cb4097cc27a7956051ec0c1b5/server-subscriptions-as3/index.js
import {create_webpubsub_subscribe_server} from '../WpsWebSocketServer'
import {WpsPubSub} from '../azure-wps-pubsub'
import { ApolloServer, gql } from "apollo-server-express";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { createServer } from "http";
import express from 'express';
import {config} from "../utils"

const webpubsub_conn_string = "<webpubsub-connection-string>"
const pubsub = new WpsPubSub(webpubsub_conn_string);

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

	await create_webpubsub_subscribe_server(apolloServer, schema, pubsub, webpubsub_conn_string);
	
	// start the http server
	httpServer.listen(config.DEFAULT_SERVER_PORT, () => {
		console.log(`🚀 Query endpoint ready at http://localhost:${config.DEFAULT_SERVER_PORT}${apolloServer.graphqlPath}`);
		console.log(`🚀 Subscription endpoint ready at ws://localhost:${config.DEFAULT_SERVER_PORT}${apolloServer.graphqlPath}`
		);
	});

	incrementNumber();
}

main()