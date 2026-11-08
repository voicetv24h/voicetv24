import { configured, h, fetchLatest, thumbEl, metaEl, postUrl, mountChrome, setupBanner, loadSettings, adEl, safeUrl } from "./app.js";

const $ = (id) => document.getElementById(id);

async function run() {
  const postsP = configured ? fetchLatest(30).catch(() => null) : Promise.resolve([]);
  const S = await loadSettings();
  const cat = new URLSearchParams(location.search).get("cat");
  const activeCat = S.categories.includes(cat) ? cat : null;
  mountChrome(S, activeCat);
  document.title = (activeCat ? activeCat + " | " : "") + S.siteName + (S.tagline1 ? " | " + S.tagline1 : "");

  const fb = safeUrl(S.social.facebook);
  if (fb) $("fbAll").href = fb; else $("fbAll").hidden = true;
  $("videos").hidden = false;
  const adTop = adEl("top", S);
  if (adTop) $("adTop").append(adTop);

  if (!configured) {
    $("setup").append(setupBanner());
    $("emptyAll").hidden = false;
    $("noVideo").hidden = false;
    return;
  }
  const posts = await postsP;
  if (posts === null) {
    $("emptyAll").hidden = false;
    $("emptyAll").querySelector("h2").textContent = "খবর লোড করা যাচ্ছে না";
    $("emptyAll").querySelector("p").textContent = "ইন্টারনেট সংযোগ দেখে একটু পরে আবার চেষ্টা করুন।";
    $("noVideo").hidden = false;
    return;
  }

  if (posts.length) {
    const links = posts.slice(0, 6).map((p) => h("a", { href: postUrl(p), text: p.title }));
    const dup = links.map((a) => a.cloneNode(true));
    $("ticker").append(...links, h("span", { class: "dup", style: "display:contents" }, dup));
    $("tickerBox").hidden = false;
  }

  const list = activeCat ? posts.filter((p) => p.category === activeCat) : posts;
  if (!posts.length) {
    $("emptyAll").hidden = false;
  } else {
    $("more").hidden = false;
    $("gridTitle").textContent = activeCat || "সর্বশেষ খবর";
    if (!list.length) {
      $("emptyCat").hidden = false;
    } else {
      const lead = list[0];
      const front = $("front");
      front.hidden = false;
      front.append(h("article", { class: "lead" },
        h("a", { href: postUrl(lead) }, thumbEl(lead), h("h2", { text: lead.title })),
        lead.summary ? h("p", { text: lead.summary }) : null,
        metaEl(lead)));
      if (list.length > 1) {
        front.append(h("div", { class: "stack" }, list.slice(1, 5).map((p) =>
          h("article", { class: "item" }, h("a", { href: postUrl(p) }, h("h3", { text: p.title })), metaEl(p)))));
      }
      $("grid").append(...list.slice(5).map((p) =>
        h("article", { class: "card" },
          h("a", { href: postUrl(p) }, thumbEl(p), h("h3", { text: p.title })),
          p.summary ? h("p", { text: p.summary }) : null,
          metaEl(p))));
    }
    $("latest").append(...posts.slice(0, 7).map((p) =>
      h("li", {}, h("a", { href: postUrl(p), text: p.title }), h("div", { class: "meta" }, h("span", { text: p.category || "" })))));
    const adSide = adEl("side", S);
    if (adSide) $("rail").append(adSide);
  }

  const vids = posts.filter((p) => p.videoUrl).slice(0, 4);
  if (vids.length) {
    $("vgrid").append(...vids.map((p) =>
      h("article", { class: "vid" },
        h("a", { href: postUrl(p) },
          thumbEl(p, [h("span", { class: "src", text: "ভিডিও" }), h("span", { class: "play" }, h("i"))]),
          h("h3", { text: p.title })),
        h("div", { class: "meta" }, h("span", { text: p.category || "" })))));
  } else {
    $("noVideo").hidden = false;
  }
}
run();
