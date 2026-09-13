/* ScrollShow attribution helper: no network requests, cookies or persistent storage by default. */
(function () {
  "use strict";
  var name = "scrollshow_attribution_v1";
  var click = new URLSearchParams(window.location.search).get("ss_click_id");
  if (!click || !/^[A-Za-z0-9_-]{32}$/.test(click)) click = null;
  window.ScrollShowAttribution = Object.freeze({
    get: function () { return { clickId: click }; },
    remember: function (options) {
      if (!options || options.consent !== true) return { clickId: click };
      try {
        if (click) window.localStorage.setItem(name, JSON.stringify({ clickId: click, expiresAt: Date.now() + 7 * 86400000 }));
        else {
          var saved = JSON.parse(window.localStorage.getItem(name) || "null");
          if (saved && saved.expiresAt > Date.now() && /^[A-Za-z0-9_-]{32}$/.test(saved.clickId)) click = saved.clickId;
          else window.localStorage.removeItem(name);
        }
      } catch (_) {}
      return { clickId: click };
    },
    clear: function () { click = null; try { window.localStorage.removeItem(name); } catch (_) {} }
  });
})();
