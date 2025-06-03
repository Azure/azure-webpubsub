# Use a base image with Node.js installed
FROM node:20-slim

# Set a placeholder for WebPubSubConnectionString
ENV WebPubSubConnectionString=
ENV Hub=
ENV UpstreamUrl=

# Install the npm tool globally
RUN npm install -g @azure/web-pubsub-tunnel-tool

# Set the working directory inside the container
WORKDIR /app

ENTRYPOINT ["bash", "-c", "awps-tunnel run --hub $hub --webviewHost 0.0.0.0 -u $UpstreamUrl"]
