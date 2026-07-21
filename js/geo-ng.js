/**
 * geo-ng.js — Nigerian audience geo-detection
 * Detects Nigerian visitors via IP API, then:
 *  - Adds a Nigeria banner at the top of every page
 *  - Swaps [data-ng-price] element text to Naira prices
 *  - Swaps [data-ng-text] element text/html to Nigeria-specific copy
 *  - Swaps [data-ng-href] link hrefs to Nigeria-specific URLs
 *  - Redirects book.html → book-ng.html (handled separately in book.html)
 */
(function () {
  var BANNER_ID  = 'dv-ng-banner';
  var SESSION_KEY = 'dv_country';
  var FORCE_KEY   = 'dv_force_cad';

  function addBanner() {
    if (document.getElementById(BANNER_ID)) return;

    // Nigerian flag stripe
    var stripe = document.createElement('div');
    stripe.style.cssText = 'height:4px;background:linear-gradient(90deg,#008751 33%,#fff 33%,#fff 66%,#393939 66%);';

    // Notice bar
    var bar = document.createElement('div');
    bar.id = BANNER_ID;
    bar.style.cssText = [
      'background:#eafaf1',
      'border-bottom:1px solid #a9dfbf',
      'text-align:center',
      'padding:9px 16px',
      'font-size:.86rem',
      'color:#1e8449',
      'font-weight:600',
      'font-family:sans-serif',
      'position:relative',
      'z-index:9999'
    ].join(';');

    bar.innerHTML = '\uD83C\uDDF3\uD83C\uDDEC Viewing Nigeria prices in Naira &nbsp;&middot;&nbsp; '
      + '<a href="book-ng.html" style="color:#0a3d62;font-weight:700;">Book Now (\u20A6)</a>'
      + ' &nbsp;&middot;&nbsp; '
      + '<a href="#" onclick="dvSwitchToCAD(event)" style="color:#555;text-decoration:underline;font-size:.82rem;">Switch to CAD</a>';

    document.body.insertBefore(bar, document.body.firstChild);
    document.body.insertBefore(stripe, document.body.firstChild);
  }

  function swapPrices() {
    document.querySelectorAll('[data-ng-price]').forEach(function (el) {
      el.textContent = el.getAttribute('data-ng-price');
    });
  }

  function swapText() {
    document.querySelectorAll('[data-ng-text]').forEach(function (el) {
      el.innerHTML = el.getAttribute('data-ng-text');
    });
  }

  function swapLinks() {
    document.querySelectorAll('[data-ng-href]').forEach(function (el) {
      el.setAttribute('href', el.getAttribute('data-ng-href'));
    });
  }

  function applyNigeriaMode() {
    // Wait for DOM if needed
    if (document.body) {
      run();
    } else {
      document.addEventListener('DOMContentLoaded', run);
    }
  }

  function run() {
    addBanner();
    swapPrices();
    swapText();
    swapLinks();
  }

  // Global switch-to-CAD handler (used by banner link)
  window.dvSwitchToCAD = function (e) {
    e.preventDefault();
    sessionStorage.setItem(SESSION_KEY, 'CAD_FORCED');
    sessionStorage.setItem(FORCE_KEY, '1');
    var banner = document.getElementById(BANNER_ID);
    if (banner) banner.previousSibling.remove(), banner.remove();
    // Restore original prices / text / hrefs
    document.querySelectorAll('[data-ng-price]').forEach(function (el) {
      el.textContent = el.getAttribute('data-orig-price') || el.textContent;
    });
    document.querySelectorAll('[data-ng-text]').forEach(function (el) {
      el.innerHTML = el.getAttribute('data-orig-text') || el.innerHTML;
    });
    document.querySelectorAll('[data-ng-href]').forEach(function (el) {
      el.setAttribute('href', el.getAttribute('data-orig-href') || el.getAttribute('href'));
    });
  };

  function detect() {
    // Don't run if user opted into CAD
    if (sessionStorage.getItem(FORCE_KEY)) return;

    var cached = sessionStorage.getItem(SESSION_KEY);
    if (cached === 'NG') { applyNigeriaMode(); return; }
    if (cached)          { return; } // already resolved, not Nigeria

    fetch('https://ipapi.co/json/', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var cc = (d && d.country_code) ? d.country_code : '';
        sessionStorage.setItem(SESSION_KEY, cc || 'UNKNOWN');
        if (cc === 'NG') applyNigeriaMode();
      })
      .catch(function () { /* fail silently — default to existing page */ });
  }

  // Store original values before any swap (for the opt-out feature)
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-ng-price]').forEach(function (el) {
      el.setAttribute('data-orig-price', el.textContent);
    });
    document.querySelectorAll('[data-ng-text]').forEach(function (el) {
      el.setAttribute('data-orig-text', el.innerHTML);
    });
    document.querySelectorAll('[data-ng-href]').forEach(function (el) {
      el.setAttribute('data-orig-href', el.getAttribute('href'));
    });
    detect();
  });
})();
