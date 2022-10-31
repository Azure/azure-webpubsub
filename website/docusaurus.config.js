// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const path = require('path')
const plugins = require(path.resolve(__dirname, 'configs/plugins'))({ root: __dirname })

const lightCodeTheme = require('prism-react-renderer/themes/github')
const darkCodeTheme = require('prism-react-renderer/themes/dracula')

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: process.env.title || 'Demos for Azure Web PubSub Service',
  tagline: 'Easily add real-time capabilities to your apps using your preferred tech stack',
  url: '/azure-webpubsub',
  baseUrl: '/azure-webpubsub/',
  onBrokenLinks: 'warn', // external sites may be out of reach temporarily due to their own problems
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/favicon.ico',
  organizationName: 'azure',
  projectName: 'azure-webpubsub',
  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          routeBasePath: 'demos',
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

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    {
      metadata: [{ name: 'keywords', content: 'websocket, serverless, azure, web pubsub, service, realtime, messaging' }],
      colorMode: {
        disableSwitch: true,
      },
      navbar: {
        title: 'Web PubSub',
        logo: {
          alt: 'Azure Web PubSub Service',
          src: 'img/azure_logo.png',
          className: 'custom-navbar-logo-class',
        },
        items: [
          {
            type: 'doc',
            docId: 'simple_chat_app',
            position: 'left',
            label: 'Demos',
          },
          { to: '/blog', label: 'Blog', position: 'left' },
          {
            to: '/contact_us',
            label: 'Contact Us',
            position: 'left',
          },
        ],
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
      },
    },

  plugins,
}

module.exports = config
