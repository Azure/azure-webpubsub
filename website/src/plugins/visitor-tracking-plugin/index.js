module.exports = function pluginVisitorTracking(context, options) {
  const { anonymizeIP, trackingID, gtmTrackingID } = options
  return {
    name: 'visitor-tracking-plugin',

    getClientModules() {
      return ['./track']
    },

    injectHtmlTags() {
      return {
        headTags: [
          {
            tagName: 'script',
            attributes: {
              async: true,
              src: `https://wcpstatic.microsoft.com/mscc/lib/v2/wcp-consent.js`,
            },
          },
          // Gtag includes GA by default, so we also preconnect to
          // google-analytics.
          {
            tagName: 'link',
            attributes: {
              rel: 'preconnect',
              href: 'https://www.google-analytics.com',
            },
          },
          {
            tagName: 'link',
            attributes: {
              rel: 'preconnect',
              href: 'https://www.googletagmanager.com',
            },
          },
          // https://developers.google.com/analytics/devguides/collection/gtagjs/#install_the_global_site_tag
          {
            tagName: 'script',
            attributes: {
              async: true,
              src: `https://www.googletagmanager.com/gtag/js?id=${trackingID}`,
            },
          },
          {
            tagName: 'script',
            innerHTML: `
                    window.dataLayer = window.dataLayer || [];

                    function gtag(){
                        dataLayer.push(arguments);
                    }

                    function gtagInit() {
                        gtag('js', new Date());
                        gtag('config', '${trackingID}', { ${anonymizeIP ? "'anonymize_ip': true" : ''} });
                    }
                   `,
          },
          // for GTM
          {
            tagName: 'script',
            innerHTML: `
                  (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
                  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
                  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
                  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
                  })(window,document,'script','dataLayer','${gtmTrackingID}');
                  `,
          },
        ],
      }
    },
  }
}
