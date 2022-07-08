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
        window['ga-disable-MEASUREMENT_ID'] = true;
        if (gtagInit) gtagInit();
    }
    else {
        document.cookie = `google-analytics-enable=true; expires=` + getResetDate() + "; path=/";
        window['ga-disable-MEASUREMENT_ID'] = false;
    }
}

function AdvertisingCookie(setString) {
    // todo
}

function setNonEssentialCookies(categoryPreferences) {
    console.log('set non essential')
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
    console.log('change', categoryPreferences)
    setNonEssentialCookies(categoryPreferences);
}

module.exports = clientModule = {
    onRouteDidUpdate: function () {
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