# Environment Variables for AI Chat Demo
# Copy this file to .env and fill in your values

# GitHub Personal Access Token with AI model access
# Get your token from: https://github.com/settings/tokens
# GitHub AI (requires "Models" read-only permission)
GITHUB_TOKEN="{{GITHUB_TOKEN}}"

# API Version for GitHub AI models
API_VERSION="{{api_version}}"

# AI Model to use (gpt-4o-mini is recommended for cost efficiency)
MODEL_NAME="{{model_name}}"

## Uncomment the below section to use Azure Web PubSub as the transport
#### Web PubSub Section ###
# TRANSPORT_MODE="webpubsub"
# WEBPUBSUB_HUB="demo_ai_chat"
# WEBPUBSUB_ENDPOINT="https://{{your_webpubsub_host}}"
###########################

## Uncomment the below section to use Azure Storage for data persistency
#### Storage Section ###
# STORAGE_MODE="table"
# # Azurite (local Storage emulator). Simple form:
# AZURE_STORAGE_CONNECTION_STRING="UseDevelopmentStorage=true"

# # Real Azure Storage alternative (remove emulator line above):
# # AZURE_STORAGE_ACCOUNT="{{your_account_name}}"
###########################
