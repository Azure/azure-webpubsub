module.exports = pluginVisitorBehaviorChecking(context, { anonymizeIP, trackingID, gtmTrackingID }) {
    return {
        name: 'visitor-behavior-tracking-plugin',
        getClientModules: function () {
            return [
                './track'
            ]
        },
        injectHtmlTags() {
            if (!isProd) {
                return {};
            }
            return {
                // Gtag includes GA by default, so we also preconnect to
                // google-analytics.
                headTags: [
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
                    function getCookie(cname)
                    {
                    var name = cname + "=";
                    var ca = document.cookie.split(';');
                    for(var i=0; i<ca.length; i++) 
                    {
                        var c = ca[i].trim();
                        if (c.indexOf(name)==0) return c.substring(name.length,c.length);
                    }
                    return "";
                    }
                    function gtag(){
                        var optOutCookie = getCookie('google-analytics-opt-out') === 'true';
                        if (!optOutCookie) dataLayer.push(arguments);
                    }
                    gtag('js', new Date());
                    gtag('config', '${trackingID}', { ${anonymizeIP ? "'anonymize_ip': true" : ''} });`,
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
            };
        },
    }
}