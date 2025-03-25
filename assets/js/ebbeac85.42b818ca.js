"use strict";(self.webpackChunkgithub_pages=self.webpackChunkgithub_pages||[]).push([[1535],{5794:e=>{e.exports=JSON.parse('{"blogPosts":[{"id":"azure-web-pubsub-for-socketio-generally-available","metadata":{"permalink":"/azure-webpubsub/blog/azure-web-pubsub-for-socketio-generally-available","source":"@site/blog/2023-11-20-web-pubsub-for-socket.io-ga/index.md","title":"Azure Web PubSub for Socket.IO is now generally available","description":"TL;DR","date":"2023-11-20T00:00:00.000Z","formattedDate":"November 20, 2023","tags":[],"readingTime":3.52,"hasTruncateMarker":false,"authors":[{"name":"Kevin Guo","title":"Senior Product Manager","url":"https://github.com/kevinguo-ed","imageURL":"https://avatars.githubusercontent.com/u/105208143?s=400&u=9fed0cb6d3e64908d9b6b7ae9e12dcb96a0e3882&v=4","key":"KevinG"}],"frontMatter":{"slug":"azure-web-pubsub-for-socketio-generally-available","title":"Azure Web PubSub for Socket.IO is now generally available","authors":["KevinG"],"custom_edit_url":null},"nextItem":{"title":"What is WebSocket? (part 2/2)","permalink":"/azure-webpubsub/blog/what_is_websocket_part2"}},"content":"<main>\\n\\n## **TL;DR**  \\nSocket.IO library is natively supported on Azure. \\n\\nSince we public previewed this feature, we received positive feedback from users. Now we are happy to share that Web PubSub for Socket.IO is generally available, which means that Azure customers can expect stable APIs, SLAs customer support and it\u2019s suitable for use in production.\\n\\n[:link: Follow this quickstarts guide to try out the feature.](https://learn.microsoft.com/azure/azure-web-pubsub/socketio-quickstart)\\n\\n[:link: Check out the repo of a collaborative whiteboard app that showcases the use of Socket.IO APIs and how Azure handles scalability challenges.](https://github.com/Azure-Samples/socket.io-webapp-integration) \\n\\n## **Solve scalability issue without code rewrite**\\nWhen we interviewed Socket.IO users, the challenge of scaling out Socket.IO servers came up repeatedly. It\u2019s a challenge that can be met uniquely by Azure. With the input from Socket.IO users, it\u2019s a challenge we aimed to solve when we public previewed the support for Socket.IO on Azure two months ago. \\n\\nDevelopers can continue using the Socket.IO APIs they know and love and migrate to Azure seamless without code rewrite. The following shows what\u2019s needed in the server-side and the client-side code to get a Socket.IO app running on Azure and instantly reap the benefits of Azure\u2019s massive scale (million+ concurrent users).\\n\\n## **Introduce additional benefits to enterprise-level applications**\\nWeb PubSub for Socket.IO aims to address the scalability challenge Socket.IO developers face. Additionally, it offers enterprise-focused features. \\n- Cross-region replication to make your application more resilient by running in independent Azure regions\\n- Custom domain to add an extra layer of security \\n- Auto-scaling to dynamically scale up and down based on usage\\n\\n## **An example showing how easy it is to migrate a Socket.IO app to Azure**\\n### **Server-side code**\\nDevelopers only need to call `useAzureSocketIO()` to set up the communication between this server and the cloud service. To Socket.IO users, the rest of the code should familiar as they are the APIs of Socket.IO library. These lines are included here for completeness of a working program. \\n```js title=\\"server.js\\"\\nconst { Server } = require(\\"socket.io\\");\\n// highlight-next-line\\nconst { useAzureSocketIO } = require(\\"@azure/web-pubsub-socket.io\\");\\n\\nlet io = new Server(3000);\\n\\n// highlight-start\\n// Use the following line to integrate with Web PubSub for Socket.IO\\nuseAzureSocketIO(io, {\\n    hub: \\"Hub\\", // The hub name can be any valid string.\\n    connectionString: \\"<connection-string>\\"\\n});\\n// highlight-end\\n\\nio.on(\\"connection\\", (socket) => {\\n    // Sends a message to the client\\n    socket.emit(\\"hello\\", \\"world\\");\\n\\n    // Receives a message from the client\\n    socket.on(\\"howdy\\", (arg) => {\\n        console.log(arg);   // Prints \\"stranger\\"\\n    })\\n```\\n### **Client-side code**\\nThe change to the client-side code is also minimal. Notice that we are using `socket.io-client` package and when initializing socket object, we set it up so that the Socket.IO client connects with the cloud service. The rest of the code is included for completeness of a working program.\\n\\n```js title=\\"client.js\\"\\n// highlight-next-line\\nconst io = require(\\"socket.io-client\\");\\n\\n// highlight-start\\nconst socket = io(\\"<web-pubsub-socketio-endpoint>\\", {\\n    path: \\"/clients/socketio/hubs/Hub\\",\\n});\\n// highlight-end\\n\\n// Receives a message from the server\\nsocket.on(\\"hello\\", (arg) => {\\n    console.log(arg);\\n});\\n\\n// Sends a message to the server\\nsocket.emit(\\"howdy\\", \\"stranger\\")\\n\\n```\\n\\n## **How does it work?**\\nAs you can see from the code snippets, both the Socket.IO client and Socket.IO server establish a connection with a cloud service. The benefit of having a cloud service to facilitate the communication between the two is that it reduces the load on your Socket.IO server and removes to the need to worry about what if \u201cI need to send messages to 1000+ clients\u201d. All that\u2019s required is the same `socket.emit()`` call. The cloud service, which maintains persistent connections with your Socket.IO clients, fans out the message to all the clients. Graphically, it looks like this.\\n\\n![Architecture of Socket.IO managed by Azure](./typical-architecture-managed-socketio.jpg)\\n\\nYou can read more about how it works behind the scenes [:link: by reading the article](https://learn.microsoft.com/azure/azure-web-pubsub/socketio-service-internal).\\n\\n## **Now generally available.**\\nSince public preview, we received positive feedback from developers and now we are happy to share that this feature is generally available and suitable for use in production. Besides stable APIs and SLA guarantees, developers can have full support through Azure\u2019s ticket system.\\n\\n## **Resources and references**\\n- [:link: Socket.IO library documentation](https://socket.io/)\\n- [:link: Quickstarts to migrate an existing Socket.IO app on Azure](https://learn.microsoft.com/azure/azure-web-pubsub/socketio-quickstart)\\n- [:link: Internal: how does Azure solve the scalability challenge for Socket.IO developers](https://learn.microsoft.com/azure/azure-web-pubsub/socketio-service-internal)\\n\\n</main>"},{"id":"what_is_websocket_part2","metadata":{"permalink":"/azure-webpubsub/blog/what_is_websocket_part2","source":"@site/blog/2022-11-25-what-is-websockets_part2/index.md","title":"What is WebSocket? (part 2/2)","description":"Summary","date":"2022-11-25T00:00:00.000Z","formattedDate":"November 25, 2022","tags":[],"readingTime":2.52,"hasTruncateMarker":false,"authors":[{"name":"Jialin Xin","title":"Senior Software Engineer","url":"https://github.com/JialinXin","imageURL":"https://avatars.githubusercontent.com/u/15338714?v=4","key":"JialinX"},{"name":"Kevin Guo","title":"Senior Product Manager","url":"https://github.com/kevinguo-ed","imageURL":"https://avatars.githubusercontent.com/u/105208143?s=400&u=9fed0cb6d3e64908d9b6b7ae9e12dcb96a0e3882&v=4","key":"KevinG"}],"frontMatter":{"slug":"what_is_websocket_part2","title":"What is WebSocket? (part 2/2)","authors":["JialinX","KevinG"],"custom_edit_url":null},"prevItem":{"title":"Azure Web PubSub for Socket.IO is now generally available","permalink":"/azure-webpubsub/blog/azure-web-pubsub-for-socketio-generally-available"},"nextItem":{"title":"What is WebSocket? (part 1/2)","permalink":"/azure-webpubsub/blog/what_is_websocket_part1"}},"content":"<main>\\n\\n## **Summary**  \\nThis article is the second of a two-part series that describes the values of WebSocket on a high-level.\\n\\n## **Quick links**\\nExplore a few live apps built with __[:link: Web PubSub](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/overview)__, a fully managed WebSocket service from Azure.  \\n\\n[:link: A simple chat app](https://azure.github.io/azure-webpubsub/demos/chat)  \\n[:link: A collaborative whiteboard app](https://azure.github.io/azure-webpubsub/demos/whiteboard) \\n\\n\\n> **Definition**\\n> \\n> WebSocket gives developers a **_bidirectional_**, **_full-duplex_** communication channels over HTTP through a single TCP connection \\n\\n-\\n\\n## **Full-duplex**\\nTo put it simply, \u201cfull-duplex\u201d means that data can be transmitted at the same time in both directions. Like \u201cbidirectional\u201d we just talked about, full-duplex is also about two things, two entities, but full-duplex is more about the **TIMING** of sending data. \\n\\nA phone call is considered full-duplex because both the caller and the receiver can send voice data to each other at the same time. \\n\\nA walkie-talkie is considered half-duplex because at one time only one person can send voice data. The participants take turns to speak. \\n\\n![Picture of a walkie-talkie](./walkie_talkie.jpg)\\n\\nThe web before WebSocket was largely half-duplex. The client opens a communication channel and requests a resource through this channel from a remote server. It waits for the server to return the requested resource. While the client waits, it cannot send data through the same channel. Also, while the server is sending data, the client cannot request resource through the same channel, much like how we communicate with a walkie-talkie. \\n\\nImagine if you are talking with your grandma using a walkie-talkie and you ask \u201cGrandma, what\u2019s like when you were growing up in the countryside?\u201d Grandma presses the \u201cTalk button\u201d and she starts from the Great Depression, World War 1 and on with World War 2\u2026 While grandma paints the scene of her storied life, teasing grandma by completing the stories for her is not an option. Your only option? Listen on. (No grandmas were hurt in telling this joke.) \\n\\n![Picture of a grandma and her granddaughter](./grandma.jpg)\\n\\nThe walkie-talkie style of the early web was fine when communication was largely infrequent requests for resources from client to server. For web applications with interactive experience, like a collaborative document or a collaborative design application, users could be making changes at the same time and to have a smooth real-time editing experience, the changes need to be reflected on users\u2019 screens as soon as they are made. The trusty HTTP protocol, being an inherently half-duplex communication model, cannot meet the new requirements without resorting to some workarounds. Hacks no more! WebSocket brings native full-duplex communication to the web.\\n\\n## **To conclude**\\n\u201cBidirectional\u201d and \u201cfull-duplex\u201d are the two value propositions WebSocket offers to developers and it has enabled a myriad of new interesting experience on the web, multi-player gaming, online auction, real-time collaborative apps and online chatting, to name a few. And the best of it all, it does not take much to add these real-time capabilities to your applications. \\n![Some scenarios that can be enabled by WebSocket](./scenarios.jpg)\\n\\n\\n**Credits:**  \\nThe walkie-talkie and the grandma photographs were taken by __[:link: cottonbro studio](https://www.pexels.com/@cottonbro/)__.  \\n\\n</main>"},{"id":"what_is_websocket_part1","metadata":{"permalink":"/azure-webpubsub/blog/what_is_websocket_part1","source":"@site/blog/2022-11-14-what-is-websockets_part1/index.md","title":"What is WebSocket? (part 1/2)","description":"Summary","date":"2022-11-14T00:00:00.000Z","formattedDate":"November 14, 2022","tags":[],"readingTime":2.34,"hasTruncateMarker":false,"authors":[{"name":"Jialin Xin","title":"Senior Software Engineer","url":"https://github.com/JialinXin","imageURL":"https://avatars.githubusercontent.com/u/15338714?v=4","key":"JialinX"},{"name":"Kevin Guo","title":"Senior Product Manager","url":"https://github.com/kevinguo-ed","imageURL":"https://avatars.githubusercontent.com/u/105208143?s=400&u=9fed0cb6d3e64908d9b6b7ae9e12dcb96a0e3882&v=4","key":"KevinG"}],"frontMatter":{"slug":"what_is_websocket_part1","title":"What is WebSocket? (part 1/2)","authors":["JialinX","KevinG"],"custom_edit_url":null},"prevItem":{"title":"What is WebSocket? (part 2/2)","permalink":"/azure-webpubsub/blog/what_is_websocket_part2"},"nextItem":{"title":"Welcome","permalink":"/azure-webpubsub/blog/welcome"}},"content":"<main>\\n\\n## **Summary**  \\nThis article is the first of a two-part series that describes the values of WebSocket on a high-level.\\n\\n## **Quick links**\\nExplore a few live apps built with __[:link: Web PubSub](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/overview)__, a fully managed WebSocket service from Azure.  \\n\\n[:link: A simple chat app](https://azure.github.io/azure-webpubsub/demos/chat)  \\n[:link: A collaborative whiteboard app](https://azure.github.io/azure-webpubsub/demos/whiteboard) \\n\\n\\n> **Definition**\\n> \\n> WebSocket gives developers a **_bidirectional_**, **_full-duplex_** communication channels over HTTP through a single TCP connection \\n\\n-\\n\\nLet us unpack this loaded sentence together and try to understand the italicized words (technical jargon). \\n\\n## **Bidirectional**\\nThe prefix \u201cbi-\u201c means two of something. We have bicycles, two wheels. We have bifold doors, the fancy doors with two folds. In the context of computer networking, no surprise here, bidirectional means two directions.\\n\\n![Picture of a bicycle, bi-fold doors and bi-directional communication in computer networking](./bidirectional.jpg)\\n\\nHowever, to truly understand the significance of it, we will need to talk about the interaction between applications running on different computers on a network.\xa0 In a typical client and server model, the client sends an HTTP request. Once the server receives the request, it does some processing and returns an HTTP response. Most of the activities on the web can be simplified to this request and response interaction. For example, when we visit [www.nytimes.com](https://www.nytimes.com/), the browser sends an HTTP request on the user\u2019s behalf and waits for an HTTP response from its server.\\n\\nWhat is relevant to our discussion here is that the client **ALWAYS** initiates the communication, in other words, the client always _asks_ before the server _responds_. We can call this form of communication one-directional because the server cannot send data to clients that is not requested. This is the decision made by the designer of HTTP protocol, and this simple design is the technological backbone of the internet. \\n\\n![Client makes request and server responds.](./http.jpg)\\n\\nAs the web welcomes more and more users, they are increasingly demanding more dynamic and interactive web experience. They want to track their ridesharing car without closing and reopening the app; they want to see the latest financial data, bid in an auction, collaborate on a document all without refreshing the browser all the time. A one-directional communication becomes inadequate in these scenarios. To enable these experiences, the web needs a way for server to send data to clients without client asking. Until WebSocket was standardized in 2008 and quickly supported by modern browsers, the web was unapologetically one-directional. With a bit of uneasiness and feeling cheating, software developers came up with workarounds to mimic bidirectional communication. Hacks no more! WebSocket brings native bi-directional communication to the web.\\n\\n![WebSocket enables bi-directional communication](./websocket.jpg)\\n\\nIn the second part, we will explore the idea of \u201cfull-duplex\u201d.\\n\\n---\\n**Credits:**  \\nThe bicycle photograph is taken by __[:link: Philipp M](https://www.pexels.com/@luftschnitzel/)__.  \\nThe bi-fold door photograph is taken by __[:link: sena](https://www.pexels.com/@sena-124356903/)__.\\n\\n</main>"},{"id":"welcome","metadata":{"permalink":"/azure-webpubsub/blog/welcome","source":"@site/blog/2022-06-29-welcome/index.md","title":"Welcome","description":"This is a site dedicated to showing developers what they can build with Azure Web PubSub through live demos. If a picture is worth a thousand words, a live demo is probably worth a lot more than that.","date":"2022-06-29T00:00:00.000Z","formattedDate":"June 29, 2022","tags":[],"readingTime":0.575,"hasTruncateMarker":false,"authors":[{"name":"Wanpeng Li","title":"Software Engineer II","url":"https://github.com/wanlwanl","imageURL":"https://avatars.githubusercontent.com/u/38236089?v=4","key":"WangpengL"}],"frontMatter":{"slug":"welcome","title":"Welcome","authors":["WangpengL"],"custom_edit_url":null},"prevItem":{"title":"What is WebSocket? (part 1/2)","permalink":"/azure-webpubsub/blog/what_is_websocket_part1"}},"content":"<main>\\n\\nThis is a site dedicated to showing developers what they can build with Azure Web PubSub through live demos. If a picture is worth a thousand words, a live demo is probably worth a lot more than that.\\n\\nAzure Web PubSub is a cloud service that helps you build real-time messaging web applications using WebSockets and the publish-subscribe pattern easily. This real-time functionality allows publishing content updates between server and connected clients (for example a single page web application or mobile application). The clients do not need to poll the latest updates, or submit new HTTP requests for updates.\\n\\nCheck out the demos on the site and let us know what you think.\\n\\n</main>"}]}')}}]);