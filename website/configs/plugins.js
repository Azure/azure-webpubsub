const path = require('path')
const setupPlugins = function ({ root, docPath }) {
  const plugins = [
    async function tailwindPlugin(context, options) {
      return {
        name: 'docusaurus-tailwindcss',
        configurePostCss(postcssOptions) {
          // Appends TailwindCSS and AutoPrefixer.
          postcssOptions.plugins.push(require('tailwindcss'))
          postcssOptions.plugins.push(require('autoprefixer'))
          return postcssOptions
        },
      }
    },
  ]

  // only add gtag in production
  const trackingID = process.env.trackingID
  const gtmTrackingID = process.env.gtmTrackingID
  if (trackingID && trackingID !== '' && gtmTrackingID && gtmTrackingID !== '') {
    const gtagPlugin = [
      path.resolve(root, 'src/plugins/visitor-tracking-plugin'),
      {
        trackingID,
        gtmTrackingID,
        anonymizeIP: true,
      },
    ]
    plugins.push(gtagPlugin)
    console.log(`Add visitor-tracking-plugin Successfully. tracking ID: ${trackingID}, GTM tracking ID: ${gtmTrackingID}`)
  } else {
    console.warn('Failed to get "trackingID" for gtag! Should be null in development, but should be non empty string in Production.')
  }

  return plugins
}

module.exports = setupPlugins
