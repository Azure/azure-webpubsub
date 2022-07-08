const SET = SET;
const RESET = RESET;

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
    document.cookie = `google-analytics-opt-out=${enable}; expires=` + getSetDate() + "; path=/";
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

module.exports = clientModule = {
    onRouteDidUpdate: function () {
        setEssentialCookies();
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
}