const SET = "set";
const RESET = "reset";

function getSetDate() {
    var d = new Date();
    d.setMonth(12);
    return d;
}

function getResetDate() {
    var d = new Date();
    d.setMonth(-12);
    return d;
}

function SocialMediaCookie(setString) {
    // todo
}

function AnalyticsCookie(setString) {
    const enable = setString === SET;
    if (enable) {
        document.cookie = `google-analytics-enable=true; expires=` + getSetDate() + "; path=/";
        // client side, have to hard code the id
        window['ga-disable-G-9DVQRCY9L7'] = false;
        if (gtagInit) gtagInit();
    }
    else {
        document.cookie = `google-analytics-enable=true; expires=` + getResetDate() + "; path=/";
        // client side, have to hard code the id
        window['ga-disable-G-9DVQRCY9L7'] = true;
    }
}

function AdvertisingCookie(setString) {
    // todo
}

function setNonEssentialCookies(categoryPreferences) {
    if (categoryPreferences.Advertising) {
        AdvertisingCookie(SET);
    } else {
        AdvertisingCookie(RESET);
    }

    if (categoryPreferences.SocialMedia) {
        SocialMediaCookie(SET);
    } else {
        SocialMediaCookie(RESET);
    }

    if (categoryPreferences.Analytics) {
        AnalyticsCookie(SET);
    } else {
        AnalyticsCookie(RESET);
    }
}

function onConsentChanged(categoryPreferences) {
    setNonEssentialCookies(categoryPreferences);
}

function initConsent() {
    window.siteConsent = null;
    window.WcpConsent && WcpConsent.init("en-US", "cookie-banner", function (err, _siteConsent) {
        if (!err) {
            siteConsent = _siteConsent;  //siteConsent is used to get the current consent
            setNonEssentialCookies(siteConsent.getConsent());
        } else {
            console.log("Error initializing WcpConsent: " + err);
        }
    }, onConsentChanged, WcpConsent.themes.light);
}

function sendEventsToGoogleAnalytics(location, previousLocation) {
    if (previousLocation &&
        (location.pathname !== previousLocation.pathname ||
            location.search !== previousLocation.search ||
            location.hash !== previousLocation.hash)) {
        // Normally, the document title is updated in the next tick due to how
        // `react-helmet-async` updates it. We want to send the current document's
        // title to gtag instead of the old one's, so we use `setTimeout` to defer
        // execution to the next tick.
        // See: https://github.com/facebook/docusaurus/issues/7420
        setTimeout(() => {
            // Always refer to the variable on window in case it gets overridden
            // elsewhere.
            window.gtag('event', 'page_view', {
                page_title: document.title,
                page_location: window.location.href,
                page_path: location.pathname + location.search + location.hash,
            });
        });
    }
}

module.exports = clientModule = {
    onRouteDidUpdate: function ({ location, previousLocation }) {
        initConsent();
        sendEventsToGoogleAnalytics(location, previousLocation);
    }
}
