/*!
 * George — Duo Prime Care Pharmacy chat widget (v1)
 * Embed with ONE tag (see README):
 *   <script src="george-widget.js?v=1.0" data-api="https://YOUR-BACKEND" defer></script>
 *
 * - Vanilla JS, no framework, no build step.
 * - Renders bottom-LEFT (the site's existing WhatsApp widget owns bottom-right).
 * - Talks only to our /session + /chat endpoints; the API key never reaches the browser.
 * - RTL layout per-message when the reply language is Arabic.
 */
(function () {
  "use strict";

  // ---- config from the <script> tag -------------------------------------
  var script = document.currentScript;
  var API_BASE = (script && script.getAttribute("data-api")) || "http://localhost:8000";
  API_BASE = API_BASE.replace(/\/+$/, "");

  // Load widget.css from the same directory as this script, reusing the
  // script tag's ?v= cache-busting query (the site uses version params).
  var srcUrl = script && script.src ? script.src : "";
  var dir = srcUrl.replace(/[^\/]*$/, "");
  var query = srcUrl.indexOf("?") > -1 ? srcUrl.slice(srcUrl.indexOf("?")) : "";
  if (!document.querySelector('link[href*="george-widget.css"]')) {
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = dir + "george-widget.css" + query;
    document.head.appendChild(link);
  }

  var AR_RE = /[؀-ۿ]/;
  var sessionToken = null;
  var busy = false;

  var I18N = {
    greeting:
      "Hi! I'm George 👋 I can help with our hours, location, services and orders — in English or Arabic.\nمرحباً! أنا جورج — اسألني عن ساعات العمل أو الموقع أو الخدمات بالعربية أو الإنجليزية.",
    placeholder: "Type a message… / اكتب رسالة…",
    send: "Send",
    offline: {
      en: "Sorry, I can't connect right now. Please WhatsApp us on +971502981072.",
      ar: "عذراً، لا يمكنني الاتصال الآن. راسلنا على واتساب ‎+971502981072."
    },
    whatsappBtn: { en: "Continue on WhatsApp", ar: "أكمل عبر واتساب" }
  };

  // ---- DOM ----------------------------------------------------------------
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  var root = el("div", "george-widget");
  root.id = "george-widget";

  // Docked launcher bar (avatar + label + chevron). Whole bar toggles the panel.
  var button = el("button", "george-bar");
  button.setAttribute("aria-label", "Chat with George, the pharmacy assistant");
  var barAvatar = el("span", "george-bar-avatar", "G");
  var barLabel = el("span", "george-bar-label", "Chat with George");
  var barChevron = el("span", "george-bar-chevron");
  barChevron.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
  button.appendChild(barAvatar);
  button.appendChild(barLabel);
  button.appendChild(barChevron);

  var panel = el("div", "george-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Pharmacy chat assistant");

  var header = el("div", "george-header");
  var headAvatar = el("span", "george-header-avatar", "G");
  var headText = el("div", "george-header-text");
  headText.appendChild(el("span", "george-header-name", "George"));
  var headStatus = el("span", "george-header-status");
  headStatus.appendChild(el("span", "george-dot"));
  headStatus.appendChild(el("span", null, "Duo Prime Care · Online"));
  headText.appendChild(headStatus);
  var closeBtn = el("button", "george-close", "");
  closeBtn.setAttribute("aria-label", "Minimize chat");
  closeBtn.innerHTML =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  header.appendChild(headAvatar);
  header.appendChild(headText);
  header.appendChild(closeBtn);

  var messages = el("div", "george-messages");
  var disclaimer = el(
    "div",
    "george-disclaimer",
    "George can't give medical advice — for that, our pharmacist is one tap away. جورج لا يقدم نصائح طبية."
  );

  var form = el("form", "george-form");
  var input = el("input", "george-input");
  input.type = "text";
  input.maxLength = 1000;
  input.placeholder = I18N.placeholder;
  input.setAttribute("aria-label", "Message");
  var sendBtn = el("button", "george-send", I18N.send);
  sendBtn.type = "submit";
  form.appendChild(input);
  form.appendChild(sendBtn);

  panel.appendChild(header);
  panel.appendChild(messages);
  panel.appendChild(disclaimer);
  panel.appendChild(form);
  root.appendChild(panel);
  root.appendChild(button);

  function mount() { document.body.appendChild(root); }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  // ---- messaging ----------------------------------------------------------
  function addMessage(text, who, isArabic) {
    var msg = el("div", "george-msg george-msg-" + who);
    msg.textContent = text;
    if (isArabic) {
      msg.dir = "rtl";
      msg.classList.add("george-rtl");
    } else {
      msg.dir = "ltr";
    }
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
    return msg;
  }

  function addHandoffButton(handoff, isArabic) {
    if (!handoff || !handoff.url) return;
    var wrap = el("div", "george-msg george-msg-bot george-handoff");
    if (isArabic) wrap.dir = "rtl";
    var a = el("a", "george-wa-btn", I18N.whatsappBtn[isArabic ? "ar" : "en"]);
    a.href = handoff.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    wrap.appendChild(a);
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
  }

  function addTyping() {
    var t = el("div", "george-msg george-msg-bot george-typing");
    t.innerHTML = "<span></span><span></span><span></span>";
    messages.appendChild(t);
    messages.scrollTop = messages.scrollHeight;
    return t;
  }

  function ensureSession() {
    if (sessionToken) return Promise.resolve(sessionToken);
    // Unique URL + no-store: the site's service worker (sw.js) caches GETs,
    // which would otherwise serve a stale session token forever.
    return fetch(API_BASE + "/session?_=" + Date.now(), { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("session " + r.status); return r.json(); })
      .then(function (d) { sessionToken = d.session_token; return sessionToken; });
  }

  function send(text) {
    var isArabicInput = AR_RE.test(text);
    addMessage(text, "user", isArabicInput);
    var typing = addTyping();
    busy = true;
    sendBtn.disabled = true;

    ensureSession()
      .then(function (token) {
        return fetch(API_BASE + "/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, session_token: token })
        });
      })
      .then(function (r) {
        if (r.status === 401) { sessionToken = null; throw new Error("session expired"); }
        if (!r.ok) throw new Error("chat " + r.status);
        return r.json();
      })
      .then(function (data) {
        typing.remove();
        var isArabic = data.intent && data.intent.language === "ar";
        addMessage(data.reply, "bot", isArabic);
        addHandoffButton(data.handoff, isArabic);
      })
      .catch(function () {
        typing.remove();
        addMessage(I18N.offline[isArabicInput ? "ar" : "en"], "bot", isArabicInput);
      })
      .then(function () {
        busy = false;
        sendBtn.disabled = false;
        input.focus();
      });
  }

  // ---- events ---------------------------------------------------------------
  var opened = false;
  function togglePanel(open) {
    root.classList.toggle("george-open", open);
    button.setAttribute("aria-expanded", open ? "true" : "false");
    if (open && !opened) {
      opened = true;
      addMessage(I18N.greeting, "bot", false);
      ensureSession().catch(function () { /* retried on first send */ });
    }
    if (open) setTimeout(function () { input.focus(); }, 50);
  }

  button.addEventListener("click", function () { togglePanel(!root.classList.contains("george-open")); });
  closeBtn.addEventListener("click", function () { togglePanel(false); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || busy) return;
    input.value = "";
    send(text);
  });
})();
