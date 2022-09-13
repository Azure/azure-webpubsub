const bannerCount = 4
const getImageSource = (i, bannerType, baseUrl) => baseUrl + `img/banners/${bannerType}/banner-${i}.jpg`

module.exports = function ({ baseUrl }) {
    return {
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
            isSearchReady: false,
        },
        bannerImageSources: {
            mobile: [...Array(bannerCount).keys()].map(i => getImageSource(i, 'mobile', baseUrl)),
            desktop: [...Array(bannerCount).keys()].map(i => getImageSource(i, 'desktop', baseUrl)),
        },
        bannerImageSourcesAriaLabels: {
            mobile: ["mobile-aria-0", "mobile-aria-1", "mobile-aria-2", "mobile-aria-3"],
            desktop: ["desktop-aria-0", "desktop-aria-1", "desktop-aria-2", "desktop-aria-3"]
        },
        sidebar: {
            sampleRoot: "https://github.com/Azure/azure-webpubsub/tree/main/samples/",
            reviewLink: "https://github.com/Azure/azure-webpubsub/issues/new?assignees=&labels=&template=30_sample_feedback.md",
            // todo: add share component
            shareLink: "",
            docLink: "https://azure.microsoft.com/services/web-pubsub/",
        }
    }
}