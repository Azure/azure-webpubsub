const path = require('path')
const setupPlugins = function ({ root }) {
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

    // handle "back to main menu" issue with Docusaurus
    function handleBackToMainMenuBtn(context, options) {
      return {
        name: 'handle-back-to-main-btn',
        injectHtmlTags({ content }) {
          return {
            postBodyTags: [
              `<script>
                window.addEventListener('load', ()=> {
                  const backBtn = document.querySelector(".navbar-sidebar__back");
                  if(backBtn) backBtn.style.display = "none";
                });

                window.addEventListener('resize', () => {
                  const backBtn = document.querySelector(".navbar-sidebar__back");
                  if(backBtn) backBtn.style.display = "none";
                });
            </script>`,
            ],
          }
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
