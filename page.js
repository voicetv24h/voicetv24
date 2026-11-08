import { configured, h, mountChrome, loadSettings, fetchPage, defaultPage, PAGES } from "./app.js";

async function run() {
  const S = await loadSettings();
  mountChrome(S, null);
  const slug = new URLSearchParams(location.search).get("p");
  const root = document.getElementById("page");
  if (!PAGES[slug]) { root.append(h("p", { class: "empty", text: "পেজটি পাওয়া যায়নি।" })); return; }
  let data = null;
  if (configured) { try { data = await fetchPage(slug); } catch (e) {} }
  const def = defaultPage(slug, S.siteName);
  const title = (data && data.title) || def.title;
  const body = (data && data.body) || def.body;
  document.title = title + " | " + S.siteName;
  root.append(h("h1", { text: title }),
    h("div", { class: "body" }, String(body).split(/\n+/).map((t) => t.trim()).filter(Boolean).map((t) => h("p", { text: t }))));
}
run();
