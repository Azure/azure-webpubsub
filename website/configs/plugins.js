const path = require('path')
const setupPlugins = function ({ root, docPath }) {
    const plugins = [
        '@docusaurus/plugin-content-pages',
        [
            path.resolve(root, 'src/plugins/docusaurus-plugin-content-docs-extend'),
            {
                path: path.resolve(root, docPath),
                include: [
                    '**/*.{md,mdx}',
                ],
                exclude: [
                    '**/node_modules/*.{md,mdx}'
                ],
                routeBasePath: 'demos',
                breadcrumbs: false,
            },
        ],
    ]

    // only add gtag in production
    const trackingID = process.env.trackingID
    const gtmTrackingID = process.env.gtmTrackingID
    if (trackingID && trackingID !== "" && gtmTrackingID && gtmTrackingID !== "") {
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