// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require('prism-react-renderer/themes/github');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Demos for Azure Web PubSub Service',
  url: 'https://azure.github.io/azure-webpubsub',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/favicon.ico',
  organizationName: 'microsoft',
  projectName: 'docusaurus',

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          path: "../samples",
          include: ['**/scoreboard/*.{md,mdx}'],
          sidebarPath: require.resolve('./sidebars.js'),
        },
        blog: {
          showReadingTime: true,
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  // themeConfig:
  //   /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
  //   ({
  //   }),
};

module.exports = config;
