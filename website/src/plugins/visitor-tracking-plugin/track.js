const cookies = require('browser-cookies')

// client side, have to hard code the id
const trackingIndex = '9DVQRCY9L7'
const SET = 'set'
const RESET = 'reset'

function SocialMediaCookie(setString) {
  // todo
}

function AnalyticsCookie(setString) {
  const enable = setString === SET
  if (enable) {
    startGoogleTagManager()
    setGoogleAnalyticsEnableCookie(365)
    window[`ga-disable-G-${trackingIndex}`] = false
    if (gtagInit) gtagInit()
  } else {
    setGoogleAnalyticsEnableCookie(-1)
    window[`ga-disable-G-${trackingIndex}`] = true
    expireCookie('_ga')
    expireCookie(`_ga_${trackingIndex}`)
    expireCookie('_mid')
  }
}

function startGoogleTagManager() {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    'gtm.start':
      new Date().getTime(), event: 'gtm.js'
  })
  limitExpireTimeForGDPR('_ga')
}

function setGoogleAnalyticsEnableCookie(expires) {
  const name = 'google-analytics-enable'
  cookies.set(name, 'true', { expires })
}

function limitExpireTimeForGDPR(name) {
  const val = cookies.get(name)
  if (val) cookies.set(name, val, { expires: 365 })
}

function expireCookie(name) {
  const val = cookies.get(name)
  if (val) cookies.set(name, val, { expires: -365 })
}

function AdvertisingCookie(setString) {
  // todo
}

function setNonEssentialCookies(categoryPreferences) {
  if (categoryPreferences.Advertising) {
    AdvertisingCookie(SET)
  } else {
    AdvertisingCookie(RESET)
  }

  if (categoryPreferences.SocialMedia) {
    SocialMediaCookie(SET)
  } else {
    SocialMediaCookie(RESET)
  }

  if (categoryPreferences.Analytics) {
    AnalyticsCookie(SET)
  } else {
    AnalyticsCookie(RESET)
  }
}

function onConsentChanged(categoryPreferences) {
  setNonEssentialCookies(categoryPreferences)
}

function initConsent() {
  window.siteConsent = null
  window.WcpConsent &&
    WcpConsent.init(
      'en-US',
      'cookie-banner',
      function (err, _siteConsent) {
        if (!err) {
          siteConsent = _siteConsent //siteConsent is used to get the current consent
          setNonEssentialCookies(siteConsent.getConsent())
        } else {
          console.log('Error initializing WcpConsent: ' + err)
        }
      },
      onConsentChanged,
      WcpConsent.themes.light,
    )
}

function sendEventsToGoogleAnalytics(location, previousLocation) {
  if (
    previousLocation &&
    (location.pathname !== previousLocation.pathname || location.search !== previousLocation.search || location.hash !== previousLocation.hash)
  ) {
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
      })
    })
  }
}

module.exports = clientModule = {
  onRouteDidUpdate: function ({ location, previousLocation }) {
    initConsent()
    sendEventsToGoogleAnalytics(location, previousLocation)
  },
}
