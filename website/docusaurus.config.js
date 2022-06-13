// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const customFields = {
  doc: {
    path: "../samples"
  },
  developmentStatus: {
    isCustomerStoryReady: false,
    isFeedbackReady: false,
    isRequestDemoMessageBarReady: false,
    isDemoCategoryReady: false,
    isTellUsReady: false,
    isContactNavBarReady: false,
    isRatingWithFeedback: false,
    isShareReady: false,
  },
  sidebar: {
    sampleRoot: "https://github.com/Azure/azure-webpubsub/tree/main/samples/",
    // todo: add an issue template for live demo
    reviewLink: "https://github.com/Azure/azure-webpubsub/issues",
    // todo: add share component
    shareLink: "",
    docLink: "https://azure.microsoft.com/services/web-pubsub/",
  }
}

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
        path: customFields.doc.path,
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
  customFields: customFields
};

module.exports = config;
