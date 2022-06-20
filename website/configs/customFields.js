const bannerCount = 4
const getImageSource = (i, bannerType) => `/img/banners/${bannerType}/banner-${i}.jpg`

module.exports = {
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
        mobile: [...Array(bannerCount).keys()].map(i => getImageSource(i, 'mobile')),
        desktop: [...Array(bannerCount).keys()].map(i => getImageSource(i, 'desktop')),
    },
    sidebar: {
        sampleRoot: "https://github.com/Azure/azure-webpubsub/tree/main/samples/",
        reviewLink: "https://github.com/Azure/azure-webpubsub/issues/new?assignees=&labels=&template=30_sample_feedback.md",
        // todo: add share component
        shareLink: "",
        docLink: "https://azure.microsoft.com/services/web-pubsub/",
    }
}