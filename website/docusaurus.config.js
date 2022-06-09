// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Demos for Azure Web PubSub Service',
  url: '/azure-webpubsub',
  baseUrl: '/',
  onBrokenLinks: 'throw',
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
  plugins: [
    '@docusaurus/plugin-content-pages',
    [
      './src/plugins/docusaurus-plugin-content-docs-extend',
      {
        path: "../samples",
        include: [
          '**/*.{md,mdx}',
        ],
        exclude: [
          '**/node_modules/*.{md,mdx}'
        ],
        routeBasePath: 'demos',
        breadcrumbs: false,
      }
    ]
  ],
};

module.exports = config;
