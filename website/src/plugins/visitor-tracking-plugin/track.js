const cookies = require('browser-cookies')

// client side, have to hard code the id
const trackingIndex = '9DVQRCY9L7'
const SET = 'set'
const RESET = 'reset'
const originalCookieSetter = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')?.set;
const originalCookieGetter = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')?.get;

function SocialMediaCookie(setString) {
  // todo
}

function AnalyticsCookie(setString) {
  const enable = setString === SET
  var documentExist = typeof document !== 'undefined'
  if (documentExist) {
    document.__defineGetter__('cookie', function () {
      return originalCookieGetter.call(document);
    });
  }
  if (enable) {
    if (documentExist) {
      document.__defineSetter__('cookie', function (value) {
        originalCookieSetter.call(document, value);
      });
    }
    window[`ga-disable-G-${trackingIndex}`] = false
    if (window['_ga']) cookies.set('_ga', window['_ga'], { domain: '.azure.github.io', expires: 365, path: '/' })
    if (window[`_ga_${trackingIndex}`]) cookies.set(`_ga_${trackingIndex}`, window[`_ga_${trackingIndex}`], { domain: '.azure.github.io', expires: 365, path: '/' })
    setGoogleAnalyticsEnableCookie(365)

    if (window['_ga_started'] === true) { }
    else {
      if (gtagInit) gtagInit()
      startGoogleTagManager()
    }
    window['_ga_started'] = true
  } else {
    setGoogleAnalyticsEnableCookie(-365)
    window[`ga-disable-G-${trackingIndex}`] = true
    window['_ga'] = cookies.get('_ga')
    window[`_ga_${trackingIndex}`] = cookies.get(`_ga_${trackingIndex}`)
    expireCookie('_ga', '/', '.azure.github.io')
    expireCookie(`_ga_${trackingIndex}`, '/', '.azure.github.io')
    expireCookie('_mid', '/')
    expireCookie('_mid', normalizePath(location.pathname))
    expireCookie('_mid', getParentPath())
    if (documentExist) {
      document.__defineSetter__('cookie', function (value) {
        const cookieName = value.split('=')[0].trim();
        // Block _mid cookie if consent is not given
        if (cookieName === '_mid') return;

        // Proceed with setting the cookie using the original setter
        originalCookieSetter.call(document, value);
      });
    }
  }
}

function normalizePath(path) {
  if (path[path.length - 1] === '/') path = path.substring(0, path.length - 1)
  return path
}

function getParentPath() {
  let path = location.pathname
  if (path) {
    if (path === '/') return path
    path = normalizePath(path)
    path = path.substring(1)
    const arr = path.split('/').slice(0, -1)
    const parentPath = '/' + arr.join('/')
    return parentPath
  }
  return path
}

function startGoogleTagManager() {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    'gtm.start':
      new Date().getTime(), event: 'gtm.js'
  })
}

function setGoogleAnalyticsEnableCookie(expires) {
  const name = 'google-analytics-enable'
  cookies.set(name, 'true', { expires })
}

function expireCookie(name, path, domain) {
  const val = cookies.get(name)
  if (val) {
    cookies.erase(name, {
      path: path || cookies.defaults.path,
      domain: domain || cookies.defaults.domain
    })
  }
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
  expireCookie('_mid', '/')
  expireCookie('_mid', normalizePath(location.pathname))
  expireCookie('_mid', getParentPath())
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
          console.error('Error initializing WcpConsent: ' + err)
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
