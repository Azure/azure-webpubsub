module.exports = function pluginWcpConsent() {
    return {
        name: 'wcp-consent-plugin',

        getClientModules() {
            return ['./wcpConsent'];
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
                ]
            }
        }
    }
}