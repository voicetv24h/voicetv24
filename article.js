import { configured, h, fetchLatest, fetchPost, fetchImage, postUrl, mountChrome, setupBanner, fullDate, loadSettings, adEl } from "./app.js";

const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get("id");

function fbEmbed(url) {
  const src = "https://www.facebook.com/plugins/video.php?height=315&show_text=false&width=560&t=0&href=" + encodeURIComponent(url);
  return h("div", { class: "video-embed" },
    h("iframe", {
      src, title: "ভিডিও", loading: "lazy", scrolling: "no", frameborder: "0", allowfullscreen: "true",
      allow: "autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
    }));
}

async function run() {
  const S = await loadSettings();
  mountChrome(S, null);
  if (!configured) { $("setup").append(setupBanner()); $("status").hidden = true; return; }
  if (!id) { $("status").textContent = "খবরটি পাওয়া যায়নি।"; return; }

  let post = null;
  try { post = await fetchPost(id); } catch (e) {
    $("status").textContent = "খবর লোড করা যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।";
    return;
  }
  if (!post) { $("status").textContent = "খবরটি পাওয়া যায়নি।"; return; }

  document.title = post.title + " | " + S.siteName;
  const setMeta = (prop, val) => {
    let m = document.querySelector('meta[property="' + prop + '"]');
    if (!m) { m = document.createElement("meta"); m.setAttribute("property", prop); document.head.append(m); }
    m.setAttribute("content", val);
  };
  setMeta("og:title", post.title);
  if (post.summary) setMeta("og:description", post.summary);

  const art = $("article");
  art.append(
    h("div", { class: "byline" },
      h("span", { class: "c", text: post.category || "" }),
      h("span", { text: fullDate(post.ms) }),
      post.byline ? h("span", { text: post.byline }) : null),
    h("h1", { text: post.title }));
  const figure = h("figure", { hidden: true });
  art.append(figure);
  if (post.summary) art.append(h("p", { class: "lede", text: post.summary }));
  if (post.videoUrl) {
    if (/facebook\.com|fb\.watch/i.test(post.videoUrl)) art.append(fbEmbed(post.videoUrl));
    else art.append(h("p", {}, h("a", { class: "morebtn", href: post.videoUrl, target: "_blank", rel: "noopener", text: "ভিডিও দেখুন" })));
  }

  const paras = String(post.body || "").split(/\n+/).map((t) => t.trim()).filter(Boolean).map((t) => h("p", { text: t }));
  const body = h("div", { class: "body" }, paras);
  const adIn = adEl("article", S);
  if (adIn) { if (paras.length > 2) paras[1].after(adIn); else body.append(adIn); }
  art.append(body);

  const shareUrl = location.href;
  const copyBtn = h("button", { type: "button", text: "লিংক কপি" });
  copyBtn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(shareUrl); copyBtn.textContent = "কপি হয়েছে"; } catch (e) { copyBtn.textContent = "কপি করা যায়নি"; }
  });
  art.append(h("div", { class: "share" },
    h("a", { href: "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(shareUrl), target: "_blank", rel: "noopener", text: "ফেসবুকে শেয়ার" }),
    copyBtn));

  $("status").hidden = true;
  $("wrap").hidden = false;

  fetchImage(id).then((data) => {
    if (data) { figure.append(h("img", { src: data, alt: post.title })); figure.hidden = false; }
  }).catch(() => {});

  fetchLatest(8).then((posts) => {
    $("latest").append(...posts.filter((p) => p.id !== id).slice(0, 7).map((p) =>
      h("li", {}, h("a", { href: postUrl(p), text: p.title }), h("div", { class: "meta" }, h("span", { text: p.category || "" })))));
    const adSide = adEl("side", S);
    if (adSide) $("rail").append(adSide);
  }).catch(() => {});
}
run();
