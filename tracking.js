const META_PIXEL_ID = "562839845464269";
const CONSENT_KEY = "bopsMarketingCookies";
const UTM_KEY = "bopsCampaign";

function getCampaignData() {
  const params = new URLSearchParams(window.location.search);
  const campaign = {};
  ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach((key) => {
    const value = params.get(key);
    if (value) campaign[key] = value;
  });

  if (Object.keys(campaign).length > 0) {
    localStorage.setItem(UTM_KEY, JSON.stringify(campaign));
    return campaign;
  }

  try {
    return JSON.parse(localStorage.getItem(UTM_KEY) || "{}");
  } catch {
    return {};
  }
}

function loadMetaPixel(pixelId) {
  if (!pixelId || window.fbq) return;

  (function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = true;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

  window.fbq("init", pixelId);
  window.fbq("track", "PageView", getCampaignData());
}

function trackMetaEvent(eventName, label, extra = {}) {
  if (!window.fbq) return;

  window.fbq("trackCustom", eventName, {
    label,
    ...getCampaignData(),
    ...extra,
  });
}

function setConsent(value) {
  localStorage.setItem(CONSENT_KEY, value);
  document.querySelector("[data-cookie-banner]")?.setAttribute("hidden", "");
  if (value === "accepted") loadMetaPixel(META_PIXEL_ID);
}

function setupCookieBanner() {
  const banner = document.querySelector("[data-cookie-banner]");
  const consent = localStorage.getItem(CONSENT_KEY);

  if (consent === "accepted") {
    loadMetaPixel(META_PIXEL_ID);
  } else if (!consent) {
    banner?.removeAttribute("hidden");
  }

  document.querySelector("[data-cookie-accept]")?.addEventListener("click", () => setConsent("accepted"));
  document.querySelector("[data-cookie-decline]")?.addEventListener("click", () => setConsent("declined"));
  document.querySelector("[data-cookie-settings]")?.addEventListener("click", () => {
    banner?.removeAttribute("hidden");
  });
}

function setupEventTracking() {
  document.querySelectorAll("[data-track-event]").forEach((link) => {
    link.addEventListener("click", () => {
      trackMetaEvent(link.dataset.trackEvent, link.dataset.trackLabel || link.textContent.trim(), {
        destination: link.href,
      });
    });
  });

  document.querySelectorAll("[data-track-open]").forEach((details) => {
    details.addEventListener("toggle", () => {
      if (!details.open) return;
      closeOtherEventDetails(details);
      trackMetaEvent(details.dataset.trackOpen, details.dataset.trackLabel || "Event details");
    });
  });
}

function closeOtherEventDetails(activeDetails) {
  document.querySelectorAll(".event-more[open]").forEach((details) => {
    if (details !== activeDetails) details.open = false;
  });
}

async function getReferenceTime() {
  try {
    const response = await fetch(`${window.location.href.split("#")[0]}?time=${Date.now()}`, {
      method: "HEAD",
      cache: "no-store",
    });
    const serverDate = response.headers.get("date");
    if (serverDate) {
      const parsedDate = new Date(serverDate);
      if (!Number.isNaN(parsedDate.getTime())) return parsedDate;
    }
  } catch {
    // Local file previews do not have a server date header.
  }

  return new Date();
}

async function hidePastEvents() {
  const now = await getReferenceTime();

  document.querySelectorAll(".event-card").forEach((card) => {
    const eventTime = card.dataset.eventEnd || card.querySelector("time")?.dateTime;
    if (!eventTime) return;

    const eventDate = new Date(eventTime);
    if (Number.isNaN(eventDate.getTime())) return;

    if (card.dataset.eventEnd) {
      if (eventDate < now) card.hidden = true;
      return;
    }

    const endOfEventDay = new Date(eventDate);
    endOfEventDay.setHours(23, 59, 59, 999);
    if (endOfEventDay < now) card.hidden = true;
  });
}

function setupTicketScanStatus() {
  const status = document.querySelector("[data-bops-ticket-status]");
  if (!status || !window.fetch) return;

  fetch("data/bops-ticket-scan.json", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((scan) => {
      const match = scan?.matches?.[0];
      if (!match?.url) return;

      status.innerHTML = `<a href="${match.url}" target="_blank" rel="noopener" data-track-event="TicketClick" data-track-label="BOPS ticket scan match">Tickets</a>`;
      status.querySelector("a")?.addEventListener("click", (event) => {
        trackMetaEvent(event.currentTarget.dataset.trackEvent, event.currentTarget.dataset.trackLabel, {
          destination: event.currentTarget.href,
        });
      });
    })
    .catch(() => {});
}

function setupHeaderLogoBreath() {
  const header = document.querySelector(".site-header");
  const brand = document.querySelector(".brand");
  const heroTagline = document.querySelector(".hero .eyebrow");
  const heroLogo = document.querySelector(".hero-logo");
  if (!header || !brand || !heroTagline || !heroLogo) return;

  let logoIsVisible = false;
  let isAnimating = false;

  const revealHeaderLogo = () => {
    if (logoIsVisible || isAnimating) return;

    const from = heroLogo.getBoundingClientRect();
    const to = brand.getBoundingClientRect();
    const heroIsVisible = from.bottom > 0 && from.top < window.innerHeight && from.width > 0 && from.height > 0;

    heroLogo.classList.add("logo-handoff");

    if (!heroIsVisible || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      header.classList.add("logo-visible", "logo-breathe");
      logoIsVisible = true;
      return;
    }

    isAnimating = true;
    const flyer = heroLogo.cloneNode(true);
    flyer.className = "logo-flyer";
    flyer.removeAttribute("id");
    Object.assign(flyer.style, {
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
    });
    document.body.appendChild(flyer);

    flyer
      .animate(
        [
          { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 },
          {
            transform: `translate3d(${to.left - from.left}px, ${to.top - from.top}px, 0) scale(${to.width / from.width})`,
            opacity: 1,
          },
        ],
        {
          duration: 680,
          easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
          fill: "forwards",
        }
      )
      .finished.catch(() => {})
      .then(() => {
        flyer.remove();
        header.classList.add("logo-visible", "logo-breathe");
        logoIsVisible = true;
        isAnimating = false;
      });
  };

  const hideHeaderLogo = () => {
    if (!logoIsVisible && !isAnimating) return;
    document.querySelectorAll(".logo-flyer").forEach((flyer) => flyer.remove());
    isAnimating = false;
    logoIsVisible = false;
    header.classList.remove("logo-visible", "logo-breathe");
    heroLogo.classList.remove("logo-handoff");
  };

  const update = () => {
    const headerHeight = header.getBoundingClientRect().height;
    const taglineBottom = heroTagline.getBoundingClientRect().bottom;
    const logoShouldShow = taglineBottom <= headerHeight;
    if (logoShouldShow) {
      revealHeaderLogo();
    } else {
      hideHeaderLogo();
    }
  };

  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
}

getCampaignData();
hidePastEvents();
setupCookieBanner();
setupEventTracking();
setupTicketScanStatus();
setupHeaderLogoBreath();
