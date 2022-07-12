// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const path = require('path')
const baseUrl = '/azure-webpubsub/'
const customFields = require(path.resolve(__dirname, 'configs/customFields'))({ baseUrl })
const plugins = require(path.resolve(__dirname, 'configs/plugins'))({ root: __dirname, docPath: customFields.doc.path })

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: process.env.title || 'Demos for Azure Web PubSub Service',
  url: '/azure-webpubsub',
  baseUrl: '/azure-webpubsub/',
  onBrokenLinks: 'warn', // external sites may be out of reach temporarily due to their own problems
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/favicon.ico',
  organizationName: 'azure',
  projectName: 'azure-webpubsub',
  themeConfig: {
    metadata: [{ name: 'keywords', content: 'websocket, serverless, azure, web pubsub, service, realtime, messaging' }],
  },
  themes: [
    [
      "@docusaurus/theme-classic",
      {
        customCss: require.resolve("./src/css/custom.css"),
      },
    ],
  ],
  plugins,
  customFields,
};

module.exports = config;
