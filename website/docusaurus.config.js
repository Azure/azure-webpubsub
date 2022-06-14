// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const path = require('path')
const customFields = require(path.resolve(__dirname, 'configs/customFields'))
const plugins = require(path.resolve(__dirname, 'configs/plugins'))({ root: __dirname, docPath: customFields.doc.path })

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Demos for Azure Web PubSub Service',
  url: '/azure-webpubsub',
  baseUrl: '/',
  onBrokenLinks: 'warn', // external sites may be out of reach temporarily due to their own problems
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/favicon.ico',
  organizationName: 'microsoft',
  projectName: 'docusaurus',
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
