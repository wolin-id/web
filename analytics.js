(function () {
  "use strict";

  var ERROR_ENDPOINT = "https://auth.wolin.id/api/report-error";
  var FEEDBACK_ENDPOINT = "https://auth.wolin.id/api/feedback";
  var MAX_ERROR_REPORTS = 5;
  var sentErrorCount = 0;
  var seenErrorKeys = Object.create(null);
  var lastErrorCode = "";

  function getLang() {
    return document.documentElement.getAttribute("lang") || "en";
  }

  function tr(key, fallback) {
    if (typeof window.wolinT === "function") {
      var val = window.wolinT(key);
      if (val && val !== key) return val;
    }
    return fallback;
  }

  function scrubPii(raw) {
    if (!raw || typeof raw !== "string") return "";
    return raw
      .replace(/\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g, "[REDACTED_JWT]")
      .replace(/\b(?:Bearer|DPoP|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "[REDACTED_TOKEN]")
      .replace(/([?&;]|^)(token|access_token|id_token|refresh_token|code|code_verifier|password|passwd|pwd|secret|client_secret|csrf_token|dpop|dpop_proof|api_key|apikey)=([^&\s#"']+)/gi, "$1$2=[REDACTED]")
      .replace(/[a-zA-Z0-9._%+-]+(?:@|%40)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]")
      .replace(/\b(?=[a-fA-F0-9]*[0-9])(?=[a-fA-F0-9]*[a-fA-F])[a-fA-F0-9]{32,}\b/g, "[REDACTED_TOKEN]");
  }

  function cleanSource(src) {
    if (!src || typeof src !== "string") return "";
    try {
      var u = new URL(src, location.origin);
      return scrubPii(u.origin + u.pathname).slice(0, 256);
    } catch (_) {
      return scrubPii(src.split(/[?#]/)[0] || "").slice(0, 256);
    }
  }

  function sendErrorPayload(payload) {
    if (sentErrorCount >= MAX_ERROR_REPORTS) return;
    var dedupKey = (payload.message || "") + "|" + (payload.source || "") + "|" + String(payload.line || 0);
    if (seenErrorKeys[dedupKey]) return;
    seenErrorKeys[dedupKey] = true;
    sentErrorCount += 1;

    var body = JSON.stringify(payload);
    var queued = false;
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      try {
        queued = navigator.sendBeacon(
          ERROR_ENDPOINT,
          new Blob([body], { type: "text/plain;charset=UTF-8" })
        );
      } catch (_) {
        queued = false;
      }
    }
    if (!queued && typeof window.fetch === "function") {
      try {
        window
          .fetch(ERROR_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: body,
            keepalive: true,
            mode: "cors",
            credentials: "omit"
          })
          .then(function (res) {
            return res && res.ok ? res.json() : null;
          })
          .then(function (data) {
            if (data && typeof data.fingerprint === "string") {
              lastErrorCode = data.fingerprint;
            }
          })
          .catch(function () {});
      } catch (_) {}
    }
  }

  var prevOnError = window.onerror;
  window.onerror = function (message, source, lineno, colno, error) {
    try {
      var msgText = typeof message === "string"
        ? message
        : (error && error.message ? String(error.message) : "Unhandled script error");
      var scrubbedMsg = scrubPii(msgText).slice(0, 1000);
      if (scrubbedMsg) {
        sendErrorPayload({
          message: scrubbedMsg,
          source: cleanSource(source),
          line: typeof lineno === "number" ? lineno : null,
          col: typeof colno === "number" ? colno : null,
          page: scrubPii(location.pathname || "/"),
          lang: getLang()
        });
      }
    } catch (_) {}
    if (typeof prevOnError === "function") {
      return prevOnError.apply(this, arguments);
    }
    return false;
  };

  window.addEventListener("unhandledrejection", function (ev) {
    try {
      var reason = ev ? ev.reason : null;
      var rawMsg = "";
      if (reason && typeof reason.message === "string") {
        rawMsg = reason.message;
      } else if (typeof reason === "string") {
        rawMsg = reason;
      } else {
        rawMsg = "Unhandled promise rejection";
      }
      var scrubbed = scrubPii(rawMsg).slice(0, 1000);
      if (scrubbed) {
        sendErrorPayload({
          message: scrubbed,
          source: cleanSource(location.href),
          line: null,
          col: null,
          page: scrubPii(location.pathname || "/"),
          lang: getLang()
        });
      }
    } catch (_) {}
  });

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

    if (target.hasAttribute("data-report-open")) {
      ev.preventDefault();
      openReportModal(target);
      return;
    }

    if (target.hasAttribute("data-report-close")) {
      ev.preventDefault();
      closeReportModal();
      return;
    }

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
  });

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

  /* ========================================================================
     Accessible Lightweight "Report an issue" Modal Controller
     ======================================================================== */
  var lastTriggerEl = null;

  function getModalElements() {
    var modal = document.getElementById("wolin-report-modal");
    if (!modal) return null;
    return {
      modal: modal,
      form: document.getElementById("wolin-report-form"),
      textarea: document.getElementById("wolin-report-message"),
      status: document.getElementById("wolin-report-status"),
      submitBtn: document.getElementById("wolin-report-submit")
    };
  }

  function resetStatus(els) {
    if (!els || !els.status) return;
    els.status.hidden = true;
    els.status.className = "report-status";
    els.status.textContent = "";
  }

  function showFallbackStatus(els, rawMessage) {
    if (!els || !els.status) return;
    els.status.hidden = false;
    els.status.className = "report-status report-status-fallback";
    els.status.textContent = "";
    var prefix = document.createTextNode(
      tr("report.fallbackPrefix", "Couldn’t reach the server right now. Email us directly at ")
    );
    var mailLink = document.createElement("a");
    var subject = encodeURIComponent("Wolin Issue Report (" + (location.pathname || "/") + ")");
    var body = encodeURIComponent(rawMessage || "");
    mailLink.href = "mailto:hello@wolin.id?subject=" + subject + "&body=" + body;
    mailLink.textContent = "hello@wolin.id";
    els.status.appendChild(prefix);
    els.status.appendChild(mailLink);
  }

  function openReportModal(triggerEl) {
    var els = getModalElements();
    if (!els) return;
    lastTriggerEl = triggerEl || document.activeElement;
    resetStatus(els);
    if (els.submitBtn) {
      els.submitBtn.disabled = false;
      els.submitBtn.textContent = tr("report.submit", "Send report");
    }
    els.modal.hidden = false;
    document.body.style.overflow = "hidden";
    if (els.textarea) {
      setTimeout(function () {
        els.textarea.focus();
      }, 0);
    }
    track("report_modal_open");
  }

  function closeReportModal() {
    var els = getModalElements();
    if (!els || els.modal.hidden) return;
    els.modal.hidden = true;
    document.body.style.overflow = "";
    if (lastTriggerEl && typeof lastTriggerEl.focus === "function") {
      lastTriggerEl.focus();
    }
    lastTriggerEl = null;
  }

  document.addEventListener("keydown", function (ev) {
    var els = getModalElements();
    if (!els || els.modal.hidden) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      closeReportModal();
      return;
    }
    if (ev.key === "Tab") {
      var focusables = els.modal.querySelectorAll(
        'button:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    }
  });

  function bindModalEvents() {
    var els = getModalElements();
    if (!els || els.modal._wolinBound) return;
    els.modal._wolinBound = true;

    els.modal.addEventListener("click", function (ev) {
      if (ev.target === els.modal) {
        closeReportModal();
      }
    });

    if (els.form) {
      els.form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var raw = els.textarea ? els.textarea.value.trim() : "";
        if (!raw) {
          if (els.status) {
            els.status.hidden = false;
            els.status.className = "report-status report-status-fallback";
            els.status.textContent = tr("report.emptyError", "Please enter a short description first.");
          }
          if (els.textarea) els.textarea.focus();
          return;
        }

        var message = scrubPii(raw).slice(0, 2000);
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          showFallbackStatus(els, raw);
          return;
        }

        if (els.submitBtn) {
          els.submitBtn.disabled = true;
          els.submitBtn.textContent = tr("report.sending", "Sending…");
        }
        resetStatus(els);

        var controller = typeof AbortController === "function" ? new AbortController() : null;
        var timer = controller
          ? setTimeout(function () {
              controller.abort();
            }, 8000)
          : null;

        var payload = {
          message: message,
          page: scrubPii(location.pathname || "/"),
          lang: getLang()
        };
        if (lastErrorCode) {
          payload.errorCode = lastErrorCode;
        }

        window
          .fetch(FEEDBACK_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            mode: "cors",
            credentials: "omit",
            signal: controller ? controller.signal : undefined
          })
          .then(function (res) {
            if (timer) clearTimeout(timer);
            if (!res || (res.status !== 201 && res.status !== 200)) {
              throw new Error("non_2xx");
            }
            if (els.textarea) els.textarea.value = "";
            if (els.status) {
              els.status.hidden = false;
              els.status.className = "report-status report-status-ok";
              els.status.textContent = tr("report.success", "Thanks — we received your report.");
            }
            if (els.submitBtn) {
              els.submitBtn.disabled = false;
              els.submitBtn.textContent = tr("report.submit", "Send report");
            }
            track("feedback_submitted");
            setTimeout(function () {
              closeReportModal();
            }, 1400);
          })
          .catch(function () {
            if (timer) clearTimeout(timer);
            if (els.submitBtn) {
              els.submitBtn.disabled = false;
              els.submitBtn.textContent = tr("report.submit", "Send report");
            }
            showFallbackStatus(els, raw);
          });
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindModalEvents);
  } else {
    bindModalEvents();
  }
})();
