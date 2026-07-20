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
      keepEventCardAnchored(details, () => {
        closeOtherEventDetails(details);
      });
      settleEventCardIntoView(details);
      trackMetaEvent(details.dataset.trackOpen, details.dataset.trackLabel || "Event details");
    });
  });
}

function closeOtherEventDetails(activeDetails) {
  document.querySelectorAll(".event-more[open]").forEach((details) => {
    if (details !== activeDetails) details.open = false;
  });
}

function keepEventCardAnchored(details, changeLayout) {
  const card = details.closest(".event-card");
  if (!card) {
    changeLayout();
    return;
  }

  const topBefore = card.getBoundingClientRect().top;
  changeLayout();
  const topAfter = card.getBoundingClientRect().top;
  const scrollCorrection = topAfter - topBefore;

  if (scrollCorrection) {
    window.scrollBy({
      top: scrollCorrection,
      behavior: "auto",
    });
  }
}

function settleEventCardIntoView(details) {
  const card = details.closest(".event-card");
  const header = document.querySelector(".site-header");
  if (!card) return;

  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    const headerHeight = header?.getBoundingClientRect().height || 0;
    const cardTop = card.getBoundingClientRect().top + window.scrollY;
    const targetTop = Math.max(0, cardTop - headerHeight - 16);

    if (Math.abs(window.scrollY - targetTop) < 6) return;

    window.scrollTo({
      top: targetTop,
      behavior: "smooth",
    });
  }));
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
  const heroLogo = document.querySelector(".hero-logo");
  if (!header || !brand || !heroLogo) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const compactLogoHandoff = window.matchMedia("(max-width: 920px)");
  let flyer;
  let ticking = false;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const ease = (value) => value * value * (3 - 2 * value);
  const mix = (start, end, progress) => start + (end - start) * progress;

  const removeFlyer = () => {
    flyer?.remove();
    flyer = undefined;
  };

  const update = () => {
    ticking = false;
    const headerHeight = header.getBoundingClientRect().height;
    const from = heroLogo.getBoundingClientRect();
    const to = brand.getBoundingClientRect();
    const isCompact = compactLogoHandoff.matches;
    const startAt = headerHeight + (isCompact ? Math.min(260, window.innerHeight * 0.32) : Math.min(180, window.innerHeight * 0.2));
    const finishAt = headerHeight + (isCompact ? 44 : 8);
    const progress = clamp((startAt - from.top) / (startAt - finishAt), 0, 1);

    if (prefersReducedMotion.matches) {
      const isDocked = from.top <= finishAt;
      removeFlyer();
      heroLogo.classList.toggle("logo-handoff", isDocked);
      header.classList.toggle("logo-visible", isDocked);
      header.classList.toggle("logo-breathe", isDocked);
      heroLogo.style.removeProperty("opacity");
      brand.style.removeProperty("opacity");
      brand.style.removeProperty("transform");
      brand.style.removeProperty("pointer-events");
      return;
    }

    if (progress <= 0) {
      removeFlyer();
      heroLogo.classList.remove("logo-handoff");
      header.classList.remove("logo-visible", "logo-breathe");
      heroLogo.style.removeProperty("opacity");
      brand.style.removeProperty("opacity");
      brand.style.removeProperty("transform");
      brand.style.removeProperty("pointer-events");
      return;
    }

    if (isCompact) {
      removeFlyer();
      const eased = ease(progress);
      const headerOpacity = clamp((progress - 0.24) / 0.62, 0, 1);

      heroLogo.classList.toggle("logo-handoff", progress >= 1);
      heroLogo.style.opacity = progress >= 1 ? "" : 1 - eased;
      header.classList.add("logo-visible");
      header.classList.toggle("logo-breathe", progress >= 0.98);
      Object.assign(brand.style, {
        opacity: headerOpacity,
        pointerEvents: progress >= 0.98 ? "auto" : "none",
        transform: `translateY(${mix(-0.35, 0, headerOpacity)}rem)`,
      });
      return;
    }

    if (progress >= 1) {
      removeFlyer();
      heroLogo.classList.add("logo-handoff");
      heroLogo.style.removeProperty("opacity");
      header.classList.add("logo-visible", "logo-breathe");
      Object.assign(brand.style, {
        opacity: 1,
        pointerEvents: "auto",
        transform: "translateY(0)",
      });
      return;
    }

    if (!flyer) {
      flyer = heroLogo.cloneNode(true);
      flyer.className = "logo-flyer";
      flyer.removeAttribute("id");
      document.body.appendChild(flyer);
    }

    const eased = ease(progress);
    const headerOpacity = clamp((progress - 0.72) / 0.22, 0, 1);
    const flyerOpacity = progress < 0.86 ? 1 : clamp(1 - (progress - 0.86) / 0.14, 0, 1);
    const width = mix(from.width, to.width, eased);
    const height = mix(from.height, to.height, eased);
    const left = mix(from.left, to.left, eased);
    const top = mix(from.top, to.top, eased);

    heroLogo.classList.add("logo-handoff");
    header.classList.add("logo-visible");
    header.classList.toggle("logo-breathe", progress >= 0.98);
    Object.assign(brand.style, {
      opacity: headerOpacity,
      pointerEvents: progress >= 0.98 ? "auto" : "none",
      transform: `translateY(${mix(-0.35, 0, headerOpacity)}rem)`,
    });
    Object.assign(flyer.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      opacity: flyerOpacity,
    });
  };

  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  };

  requestUpdate();
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  if (prefersReducedMotion.addEventListener) {
    prefersReducedMotion.addEventListener("change", requestUpdate);
    compactLogoHandoff.addEventListener("change", requestUpdate);
  } else {
    prefersReducedMotion.addListener(requestUpdate);
    compactLogoHandoff.addListener(requestUpdate);
  }
}

getCampaignData();
hidePastEvents();
setupCookieBanner();
setupEventTracking();
setupTicketScanStatus();
setupHeaderLogoBreath();
