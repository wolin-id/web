(function () {
  "use strict";

  function getLang() {
    return document.documentElement.getAttribute("lang") || "en";
  }

  function track(name, props) {
    var payload = Object.assign({ page: location.pathname, lang: getLang() }, props || {});
    try {
      if (window.rybbit && typeof window.rybbit.event === "function") {
        window.rybbit.event(name, payload);
      }
      if (typeof window.gtag === "function") {
        window.gtag("event", name, payload);
      }
    } catch (_) {}
  }

  window.wolinTrack = track;

  document.addEventListener("click", function (ev) {
    var target = ev.target && ev.target.closest ? ev.target.closest("a, button") : null;
    if (!target) return;

    if (target.hasAttribute("data-wolin-lang")) {
      track("language_switch", {
        to: target.getAttribute("data-wolin-lang")
      });
      return;
    }

    if (target.classList.contains("copy-btn") || target.hasAttribute("data-copy-target")) {
      track("prompt_copy", {
        label: (target.textContent || "").trim().slice(0, 60)
      });
      return;
    }

    if (target.id && target.id.indexOf("pg") === 0) {
      track("playground_execute", {
        control: target.id
      });
      return;
    }

    var href = target.getAttribute("href") || "";
    var isCta = target.classList.contains("btn") || target.classList.contains("nav-cta") || target.classList.contains("cta-btn");
    if (isCta) {
      track("cta_click", {
        label: (target.textContent || "").trim().slice(0, 80),
        href: href
      });
    } else if (/^https?:\/\//i.test(href) && href.indexOf(location.host) === -1) {
      track("outbound_click", {
        url: href.slice(0, 200)
      });
    }
  }, { passive: true });

  var milestones = { 25: false, 50: false, 75: false, 100: false };
  window.addEventListener("scroll", function () {
    var doc = document.documentElement;
    var max = (doc.scrollHeight - window.innerHeight);
    if (max <= 0) return;
    var pct = Math.round((window.scrollY / max) * 100);
    [25, 50, 75, 100].forEach(function (m) {
      if (!milestones[m] && pct >= m) {
        milestones[m] = true;
        track("scroll_depth", { percent: m });
      }
    });
  }, { passive: true });
})();
