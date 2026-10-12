// wcstack tutorial — language selection.
// Loaded as a classic script in <head> so <html data-lang> is set before the
// first paint. Order: ?lang= in the URL, then the reader's last choice, then
// the browser's language.
(function () {
  var KEY = "wcstack-tutorial-lang";
  var root = document.documentElement;

  function read() {
    var lang = null;
    try { lang = new URLSearchParams(location.search).get("lang"); } catch (e) {}
    if (lang !== "en" && lang !== "ja") {
      try { lang = localStorage.getItem(KEY); } catch (e) {}
    }
    if (lang !== "en" && lang !== "ja") {
      var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
      lang = /^ja\b/i.test(langs[0] || "") ? "ja" : "en";
    }
    return lang;
  }

  function apply(lang) {
    root.setAttribute("data-lang", lang);
    root.setAttribute("lang", lang);
    var buttons = document.querySelectorAll("[data-set-lang]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute("aria-pressed", String(buttons[i].getAttribute("data-set-lang") === lang));
    }
    var title = root.getAttribute("data-title-" + lang);
    if (title) document.title = title;
  }

  apply(read());

  document.addEventListener("DOMContentLoaded", function () {
    apply(root.getAttribute("data-lang"));
    document.addEventListener("click", function (event) {
      var button = event.target.closest && event.target.closest("[data-set-lang]");
      if (!button) return;
      var lang = button.getAttribute("data-set-lang");
      try { localStorage.setItem(KEY, lang); } catch (e) {}
      try {
        var url = new URL(location.href);
        if (url.searchParams.has("lang")) { url.searchParams.set("lang", lang); history.replaceState(null, "", url); }
      } catch (e) {}
      apply(lang);
    });
  });
})();
