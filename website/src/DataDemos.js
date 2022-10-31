export let DataDemos = [
  {
    id: 1,
    title: 'Simple chat app',
    description: 'A simple real-time chat app demonstrating the use of JavaScript server SDK',
    languages: [
      // { language: 'JavaScript', percent: '' }
    ],
    detailURL: 'demos/chat',
    thumbnailURL: 'img/thumbnails/chat_abstract.jpeg',
    githubRepo: 'https://github.com/Azure/azure-webpubsub/tree/main/samples/javascript/chatapp',
  },
  {
    id: 2,
    title: 'Collaborative whiteboard',
    description: 'A whiteboard app demonstrating how to build real-time collaborative apps using Azure Web PubSub and Node.js',
    languages: [
      // { language: 'JavaScript', percent: '' }
    ],
    detailURL: 'demos/whiteboard',
    thumbnailURL: 'img/thumbnails/whiteboard.jpeg',
    githubRepo: 'https://github.com/Azure/azure-webpubsub/tree/main/samples/javascript/whiteboard',
  },
  {
    id: 3,
    title: 'Metaverse',
    description: 'An app demonstrating how Azure Web PubSub can be used to enable multi-player experience in Metaverse (coming soon)',
    languages: [
      // { language: 'C#', percent: '27' },
    ],
    detailURL: 'demos/metaverse',
    thumbnailURL: 'img/thumbnails/metaverse.jpeg',
    githubRepo: '',
  },
  {
    id: 4,
    title: 'Code stream',
    description: 'Real-time collaborative code editor',
    languages: [
      // { language: 'C#', percent: '27' },
    ],
    detailURL: 'demos/code-streaming',
    thumbnailURL: 'img/thumbnails/code.png',
    githubRepo: 'https://github.com/Azure/azure-webpubsub/tree/main/samples/javascript/codestream',
  },
  {
    id: 5,
    title: 'Chatr',
    description: 'This demo is developed by Ben Coleman using Azure Web PubSub and other Azure technologies',
    languages: [
      // { language: 'C#', percent: '27' },
    ],
    detailURL: 'demos/chatr',
    thumbnailURL: 'img/thumbnails/chat_closeup.jpeg',
    githubRepo: 'https://github.com/Azure/azure-webpubsub/tree/main/samples/javascript/chatr',
  },
  {
    id: 6,
    title: 'Real-time scoreboard',
    description: 'This app demonstrates how to push data from server to connected clients using Azure Web PubSub',
    languages: [
      // { language: 'C#', percent: '27' },
    ],
    detailURL: 'demos/scoreboard',
    thumbnailURL: 'img/thumbnails/scoreboard.jpeg',
    githubRepo: 'https://github.com/Azure/azure-webpubsub/tree/main/samples/javascript/scoreboard',
    deployLink:
      'https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Flivedemopackages.blob.core.windows.net%2Ftemplate%2Fscoreboard-deploy.json',
  },
]
