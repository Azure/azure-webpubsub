const {create_webpubsub_subscribe_server, WpsPubSub} = require("web-pubsub-graphql-subscribe");
const { ApolloServer, gql } = require("apollo-server-express");
const { makeExecutableSchema } = require("@graphql-tools/schema");
const { createServer } = require("http");
const express = require('express');

const webpubsub_conn_string = "<web-pubsub-connection-string>";
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
    const PORT = 4000;
	httpServer.listen(PORT, () => {
		console.log(`🚀 Query endpoint ready at http://localhost:${PORT}${apolloServer.graphqlPath}`);
		console.log(`🚀 Subscription endpoint ready at ws://localhost:${PORT}${apolloServer.graphqlPath}`
		);
	});

	incrementNumber();
}

main()