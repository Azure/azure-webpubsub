/**
 * A `WebPubSubTranslator` instance is created for each Engine.IO server instance and
 * 1. Manages all Azure Web PubSub client connections corresponding to all Engine.IO clients of a Engine.IO server instance.
 * 2. Receives requests from Azure Web PubSub requests and translate them into Engine.IO behaviours.
 * 3. Translates Engine.IO behaviours to Azure Web PubSub service behaviours like REST API calls.
 * 4. Makes the Engine.IO `sid` same as its corresponding Azure Web PubSub client connection id.
 */
class WebPubSubTranslator {
}

export { WebPubSubTranslator };
