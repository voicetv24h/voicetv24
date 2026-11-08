import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const configured = !String(firebaseConfig.apiKey).startsWith("PASTE");
export let app = null;
export let db = null;
if (configured) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}

// ---------- ডিফল্ট সেটিংস (অ্যাডমিন থেকে বদলানো যায়) ----------
export const SOCIAL_LABELS = { facebook: "ফেসবুক", tiktok: "টিকটক", youtube: "ইউটিউব", instagram: "ইনস্টাগ্রাম", x: "এক্স (টুইটার)" };
export const PLACEMENTS = {
  top: "হোম পেজের ওপরে (শিরোনাম টিকারের নিচে)",
  side: "ডানপাশের কলাম",
  article: "খবরের লেখার ভেতরে",
  bottom: "পেজের নিচে (ফলো অংশের আগে)"
};
export const PAGES = { about: "আমাদের সম্পর্কে", contact: "যোগাযোগ", privacy: "গোপনীয়তা নীতি" };

export const DEFAULTS = {
  siteName: "Voice TV24",
  tagline1: "সবার কথা, দেশের কণ্ঠ",
  tagline2: "নির্ভীক ও নিরপেক্ষ",
  footer: "সর্বস্বত্ব সংরক্ষিত।",
  logo: "",
  colors: { accent: "#D63B07", main: "#1B1F8F", navy: "#10136B", gold: "#FFC81E" },
  categories: ["জাতীয়", "আন্তর্জাতিক", "রাজনীতি", "অর্থনীতি", "খেলা", "বিনোদন", "প্রযুক্তি"],
  social: { facebook: "https://www.facebook.com/share/1Dg9BA5Nz3/", tiktok: "https://www.tiktok.com/@voice_tv24h", youtube: "", instagram: "", x: "" },
  ads: { enabled: false, client: "", auto: false, placements: {} }
};

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const str = (v, d) => (typeof v === "string" && v.trim() ? v : d);
const HEX = /^#[0-9a-f]{6}$/i;

export function mergeSettings(raw) {
  raw = isObj(raw) ? raw : {};
  const D = DEFAULTS;
  const rc = isObj(raw.colors) ? raw.colors : {};
  const colors = {};
  for (const k of Object.keys(D.colors)) colors[k] = HEX.test(rc[k] || "") ? rc[k] : D.colors[k];
  const ra = isObj(raw.ads) ? raw.ads : {};
  const rp = isObj(ra.placements) ? ra.placements : {};
  const placements = {};
  for (const k of Object.keys(PLACEMENTS)) {
    const p = isObj(rp[k]) ? rp[k] : {};
    placements[k] = { type: ["none", "adsense", "banner"].includes(p.type) ? p.type : "none", slot: String(p.slot || ""), link: String(p.link || "") };
  }
  return {
    siteName: str(raw.siteName, D.siteName),
    tagline1: typeof raw.tagline1 === "string" ? raw.tagline1 : D.tagline1,
    tagline2: typeof raw.tagline2 === "string" ? raw.tagline2 : D.tagline2,
    footer: typeof raw.footer === "string" ? raw.footer : D.footer,
    logo: typeof raw.logo === "string" ? raw.logo : "",
    colors,
    categories: Array.isArray(raw.categories) && raw.categories.length ? raw.categories.map(String).filter(Boolean) : D.categories.slice(),
    social: { ...D.social, ...(isObj(raw.social) ? raw.social : {}) },
    ads: { enabled: !!ra.enabled, client: String(ra.client || ""), auto: !!ra.auto, placements }
  };
}

// ---------- রং ----------
function hex2rgb(x) { const n = parseInt(x.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgb2hex(a) { return "#" + a.map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""); }
function mix(a, b, t) { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map((v, i) => v + (y[i] - v) * t)); }
function lum(x) {
  const [r, g, b] = hex2rgb(x).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const readable = (x) => (lum(x) > 0.4 ? "#14141F" : "#FFFFFF");

export function themeCss(c) {
  const dAcc = mix(c.accent, "#ffffff", 0.28), dMain = mix(c.main, "#ffffff", 0.18), dNavy = mix(c.navy, "#000000", 0.25);
  const dark = "--accent:" + dAcc + ";--accent-ink:" + readable(dAcc) + ";--teal:" + dMain + ";--navy:" + dNavy + ";";
  return ":root{--accent:" + c.accent + ";--accent-ink:" + readable(c.accent) + ";--teal:" + c.main + ";--navy:" + c.navy + ";--gold:" + c.gold + "}" +
    "@media (prefers-color-scheme:dark){:root:not([data-theme=\"light\"]){" + dark + "}}" +
    ":root[data-theme=\"dark\"]{" + dark + "}";
}
export function applyTheme(S) {
  let el = document.getElementById("vt-theme");
  if (!el) { el = document.createElement("style"); el.id = "vt-theme"; document.head.append(el); }
  el.textContent = themeCss(S.colors);
}

// ---------- সেটিংস লোড (ব্রাউজারে জমা রাখে, ফ্রি সীমা বাঁচাতে) ----------
const SKEY = "vt24_settings_v2";
const STTL = 90 * 1000;
let current = mergeSettings(null);
function readCache() { try { return JSON.parse(localStorage.getItem(SKEY) || "null"); } catch (e) { return null; } }
function writeCache(s) { try { localStorage.setItem(SKEY, JSON.stringify({ t: Date.now(), s })); } catch (e) {} }
{ const c = readCache(); if (c && c.s) current = mergeSettings(c.s); }
applyTheme(current);

async function refreshSettings() {
  try {
    const s = await getDoc(doc(db, "settings", "site"));
    current = mergeSettings(s.exists() ? s.data() : null);
    applyTheme(current);
    writeCache(current);
  } catch (e) {}
}
export async function loadSettings() {
  if (!configured) return current;
  const c = readCache();
  if (c && c.s) {
    if (Date.now() - c.t > STTL) refreshSettings();
    return current;
  }
  await refreshSettings();
  return current;
}
export function setCachedSettings(S) { current = S; applyTheme(S); writeCache(S); }

export const hueFor = (name) => { let x = 0; for (const ch of String(name || "")) x = (x * 31 + ch.charCodeAt(0)) % 360; return x; };

// ---------- সাধারণ সহায়ক ----------
const bn = new Intl.NumberFormat("bn-BD", { useGrouping: false });
export const n = (x) => bn.format(x);
export function ago(ms) {
  const m = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (m < 60) return n(m) + " মিনিট আগে";
  const hr = Math.floor(m / 60);
  if (hr < 24) return n(hr) + " ঘণ্টা আগে";
  const d = Math.floor(hr / 24);
  if (d < 30) return n(d) + " দিন আগে";
  return fullDate(ms);
}
export function fullDate(ms) {
  try { return new Date(ms).toLocaleDateString("bn-BD", { year: "numeric", month: "long", day: "numeric" }); } catch (e) { return ""; }
}
// ছোট DOM বানানোর সহায়ক। ব্যবহারকারীর লেখা কখনো HTML হিসেবে বসানো হয় না।
export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

// ---------- খবর ----------
const KEY = "vt24_posts_v1";
const TTL = 90 * 1000;
export function clearCache() { try { sessionStorage.removeItem(KEY); } catch (e) {} }
function toPost(d) {
  const data = d.data();
  const { createdAt, updatedAt, ...rest } = data;
  const ms = createdAt && createdAt.toMillis ? createdAt.toMillis() : Date.now();
  return { id: d.id, ...rest, ms };
}
export async function fetchLatest(count) {
  if (!configured) return [];
  try {
    const c = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (c && Date.now() - c.t < TTL && c.count >= count) return c.items.slice(0, count);
  } catch (e) {}
  const snap = await getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(count)));
  const items = snap.docs.map(toPost);
  try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), count, items })); } catch (e) {}
  return items;
}
export async function fetchPost(id) { const s = await getDoc(doc(db, "posts", id)); return s.exists() ? toPost(s) : null; }
export async function fetchImage(id) { const s = await getDoc(doc(db, "images", id)); return s.exists() ? s.data().data : null; }
export async function fetchPage(slug) { const s = await getDoc(doc(db, "pages", slug)); return s.exists() ? s.data() : null; }

export function defaultPage(slug, name) {
  const t = {
    about: { title: "আমাদের সম্পর্কে", body: name + " একটি বাংলা অনলাইন সংবাদ মাধ্যম। আমরা নির্ভীক ও নিরপেক্ষভাবে খবর, ভিডিও ও বিশ্লেষণ পাঠকের কাছে পৌঁছে দিতে কাজ করি।\n\nআমাদের খবর ও ভিডিও ফেসবুক, টিকটক ও এই ওয়েবসাইটে প্রকাশিত হয়।" },
    contact: { title: "যোগাযোগ", body: "খবর পাঠাতে, মতামত জানাতে বা অভিযোগ করতে আমাদের ফেসবুক পেজে বা টিকটকে মেসেজ করুন।" },
    privacy: { title: "গোপনীয়তা নীতি", body: name + " ওয়েবসাইটে আপনি এলে ব্রাউজারের ধরন, আইপি ঠিকানা ও কোন পাতা দেখেছেন, এমন সাধারণ তথ্য হোস্টিং ও ডাটাবেস সেবার মাধ্যমে জমা হতে পারে। এই তথ্য আমরা বিক্রি করি না।\n\nসাইটে প্রদর্শিত বিজ্ঞাপন Google AdSense-এর মতো তৃতীয় পক্ষের মাধ্যমে আসতে পারে। তারা আপনার আগ্রহ অনুযায়ী বিজ্ঞাপন দেখাতে কুকি ব্যবহার করতে পারে। আপনি ব্রাউজারের সেটিংস থেকে কুকি বন্ধ করতে পারেন।\n\nআমাদের সাইটে অন্য ওয়েবসাইটের লিংক থাকতে পারে। ওইসব সাইটের গোপনীয়তা নীতির দায় আমাদের নয়।\n\nএই নীতি যেকোনো সময় বদলাতে পারে। প্রশ্ন থাকলে যোগাযোগ পেজ দেখুন।" }
  };
  return t[slug] || { title: "", body: "" };
}

export function thumbEl(p, extra) {
  return h("div", { class: "thumb", style: "--h:" + hueFor(p.category) },
    p.thumb ? h("img", { src: p.thumb, alt: "", loading: "lazy" }) : null,
    extra || null,
    h("span", { class: "lbl", text: p.category || "" }));
}
export function metaEl(p) { return h("div", { class: "meta" }, h("span", { class: "c", text: p.category || "" }), h("span", { text: ago(p.ms) })); }
export const postUrl = (p) => "article.html?id=" + encodeURIComponent(p.id);
export const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");

export function setupBanner() {
  return h("div", { class: "setup" }, h("b", { text: "সেটআপ বাকি: " }), "firebase-config.js ফাইলে Firebase কনফিগ বসানো হয়নি।");
}

// ---------- বিজ্ঞাপন ----------
let adsLoaded = false;
function loadAdsScript(client) {
  if (adsLoaded || !/^ca-pub-\d{6,}$/.test(client)) return false;
  adsLoaded = true;
  const s = document.createElement("script");
  s.async = true; s.crossOrigin = "anonymous";
  s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + client;
  document.head.append(s);
  return true;
}
export function initAds(S) {
  if (S.ads.enabled && S.ads.auto) loadAdsScript(S.ads.client);
}
export function adEl(name, S) {
  const a = S.ads;
  if (!a || !a.enabled) return null;
  const p = a.placements[name];
  if (!p || p.type === "none") return null;
  if (p.type === "adsense") {
    if (!/^\d{5,}$/.test(p.slot) || !/^ca-pub-\d{6,}$/.test(a.client)) return null;
    loadAdsScript(a.client);
    const ins = h("ins", { class: "adsbygoogle", style: "display:block", "data-ad-client": a.client, "data-ad-slot": p.slot, "data-ad-format": "auto", "data-full-width-responsive": "true" });
    setTimeout(() => { try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {} }, 60);
    return h("div", { class: "ad ad-" + name }, h("small", { text: "বিজ্ঞাপন" }), ins);
  }
  if (p.type === "banner" && db) {
    const box = h("div", { class: "ad ad-" + name, hidden: true }, h("small", { text: "বিজ্ঞাপন" }));
    getDoc(doc(db, "assets", "ad-" + name)).then((s) => {
      if (!s.exists()) return;
      const img = h("img", { src: s.data().data, alt: "বিজ্ঞাপন" });
      const link = safeUrl(p.link);
      box.append(link ? h("a", { href: link, target: "_blank", rel: "sponsored noopener" }, img) : img);
      box.hidden = false;
    }).catch(() => {});
    return box;
  }
  return null;
}

// ---------- পেজের ওপর-নিচের অংশ ----------
export function mountChrome(S, activeCat) {
  const top = document.getElementById("chrome-top");
  const bottom = document.getElementById("chrome-bottom");
  let today = "";
  try { today = new Date().toLocaleDateString("bn-BD", { weekday: "long", year: "numeric", month: "long", day: "numeric" }); } catch (e) {}

  const socials = Object.keys(SOCIAL_LABELS).filter((k) => safeUrl(S.social[k])).map((k) =>
    h("a", { href: S.social[k], target: "_blank", rel: "noopener", text: SOCIAL_LABELS[k] }));

  const nav = h("div", { class: "catbar", role: "navigation", "aria-label": "বিভাগ" },
    h("a", { href: "index.html", "aria-current": !activeCat ? "page" : null, text: "সব" }),
    S.categories.map((c) => h("a", { href: "index.html?cat=" + encodeURIComponent(c), "aria-current": activeCat === c ? "page" : null, text: c })));

  top.replaceChildren(
    h("div", { class: "wrap" },
      h("div", { class: "strip" }, h("span", { text: today }), h("nav", { class: "social", "aria-label": "সোশ্যাল মিডিয়া" }, socials))),
    h("header", { class: "masthead" },
      h("div", { class: "wrap" },
        h("div", { class: "brand" },
          h("h1", {}, h("a", { class: "logo-plate", href: "index.html" }, h("img", { src: S.logo || "logo.png", alt: S.siteName, height: 62 }))),
          (S.tagline1 || S.tagline2) ? h("span", { class: "tag" }, S.tagline1, S.tagline2 ? h("small", { text: S.tagline2 }) : null) : null))),
    h("div", { class: "catbar-holder" }, h("div", { class: "wrap" }, nav)));

  const fbBtns = Object.keys(SOCIAL_LABELS).filter((k) => ["facebook", "tiktok", "youtube", "instagram"].includes(k) && safeUrl(S.social[k])).map((k) =>
    h("a", { href: S.social[k], target: "_blank", rel: "noopener", text: SOCIAL_LABELS[k] }));
  const follow = fbBtns.length ? h("section", { class: "fb" },
    h("div", {}, h("h2", { text: "আমাদের সাথে থাকুন" }), h("p", { text: "প্রতিটি খবর ও ভিডিও সবার আগে পেতে ফলো করুন।" })),
    h("div", { class: "fb-actions" }, fbBtns)) : null;

  const adB = adEl("bottom", S);
  bottom.replaceChildren(
    h("div", { class: "wrap" },
      adB,
      follow,
      h("footer", {},
        h("span", { text: "© " + S.siteName + "। " + S.footer }),
        h("span", { class: "flinks" }, Object.keys(PAGES).map((k) => h("a", { href: "page.html?p=" + k, text: PAGES[k] }))))));
  initAds(S);
}
