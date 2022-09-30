const bannerCount = 4//if bannerCount change, please change the bannerImageSourcesAriaLabels accordingly
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
            mobile: ["Push time-sensitive data to your client at scale", "Build real time chat apps that connect users across the globe", "Focus on your users, not infrastructure", "Monitor and synchronize internet-connected devices with high reliability"],
            desktop: ["Push time-sensitive data to your client at scale", "Build real time chat apps that connect users across the globe", "Focus on your users, not infrastructure", "Monitor and synchronize internet-connected devices with high reliability"]
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