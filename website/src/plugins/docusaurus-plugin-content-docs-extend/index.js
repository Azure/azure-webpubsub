const docsPluginExports = require('@docusaurus/plugin-content-docs')
const docuUtils = require('@docusaurus/utils')

const docsPlugin = docsPluginExports.default

async function docsPluginEnhanced(context, options) {
  const docsPluginInstance = await docsPlugin(context, options)

  const { breadcrumbs } = options
  const { baseUrl } = context

  return {
    ...docsPluginInstance,
    name: 'docusaurus-plugin-content-docs',
    async loadContent() {
      const content = await docsPluginInstance.loadContent()
      let docs = content.loadedVersions[0].docs.filter(c => (c.frontMatter && c.frontMatter.id ? true : false))
      docs.forEach(c => {
        if (!isValidHttpUrl(c.frontMatter.live_demo_link)) {
          console.warn(`Invalid live demo link for {c.id}`)
        }
      })
      content.loadedVersions[0].docs = docs
      content.loadedVersions[0].sidebars = []
      return content
    },
    async contentLoaded({ content, actions, allContent }) {
      const { loadedVersions } = content
      const versions = loadedVersions.map(version => {
        return {
          ...version,
          sidebarsUtils: null,
          categoryGeneratedIndices: null,
        }
      })

      await docsPluginInstance.contentLoaded({ content, actions, allContent })

      actions.setGlobalData({
        path: docuUtils.normalizeUrl([baseUrl, options.routeBasePath]),
        versions,
        breadcrumbs,
      })
    },
  }
}

function isValidHttpUrl(string) {
  let url

  try {
    url = new URL(string)
  } catch (_) {
    return false
  }

  return url.protocol === 'http:' || url.protocol === 'https:'
}

module.exports = {
  ...docsPluginExports,
  default: docsPluginEnhanced,
}
