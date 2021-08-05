// Modified From https://github.com/apollographql/docs-examples/blob/7105d77acfc67d6cb4097cc27a7956051ec0c1b5/server-subscriptions-as3/index.js
import { getWebPubSubServerOptions, WpsPubSub } from '../index';
import { ApolloServer, gql } from "apollo-server-express";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { SubscriptionServer } from 'subscriptions-transport-ws';
import { PubSub } from "graphql-subscriptions";
import { createServer } from "http";
import { execute, subscribe } from "graphql";
import { DEFAULT_OPTIONS } from '../utils';
import express from 'express';

const webpubsub_conn_string = "<webpubsub-connection-string>";

// when useWPS = false, subscription server will be launched without Azure WebPub support
const useWPS = false;

const pubsub = useWPS ? new WpsPubSub(webpubsub_conn_string, DEFAULT_OPTIONS.pubsubOptions) : new PubSub();

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
	// --------------------		Step 1 : Create an Apollo HTTP server		---------------------

	// a. Create an Express application
	const app = express();
	
	// b. Create an Apollo Server and apply it to the Express application
	const apolloServer = new ApolloServer({schema});
	await apolloServer.start();
	app.use(apolloServer.getMiddleware());

	// c. Create a HTTP server with the Express application
	const httpServer = createServer(app);	// http.createServer


	// --------------------		Step 2 : Create an Subscription Server		---------------------
	var createOptions = useWPS 
					? await getWebPubSubServerOptions(apolloServer, pubsub as WpsPubSub, webpubsub_conn_string, DEFAULT_OPTIONS.subscribeServerOptions)
					: { server: httpServer, path: apolloServer.graphqlPath }

	SubscriptionServer.create( 
		{ schema, execute, subscribe, }, 
		createOptions,
	);


	// --------------------		Step 3 : Launch the httpServer				---------------------
	httpServer.listen(DEFAULT_OPTIONS.apolloPort, () => {
		console.log(`🚀 Query endpoint ready at http://localhost:${DEFAULT_OPTIONS.apolloPort}${apolloServer.graphqlPath}`);
		console.log("🚀 Subscription endpoint ready at "  + (useWPS ? apolloServer.subscriptionsPath : `ws://localhost:${DEFAULT_OPTIONS.apolloPort}${apolloServer.graphqlPath}`));
	});

	incrementNumber();
}

main()