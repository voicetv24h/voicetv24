import { app, db, configured, h, ago, clearCache, thumbEl, setupBanner, mergeSettings, applyTheme, setCachedSettings, loadSettings, DEFAULTS, SOCIAL_LABELS, PLACEMENTS, PAGES, defaultPage } from "./app.js";
import { OWNER_EMAIL } from "./firebase-config.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, doc, getDocs, getDoc, setDoc, deleteDoc, query, orderBy, limit, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const root = document.getElementById("app");
const OWNER = String(OWNER_EMAIL).toLowerCase();
const ROLE_LABEL = { owner: "মূল অ্যাডমিন", admin: "অ্যাডমিন", editor: "সম্পাদক" };

if (!configured) {
  root.replaceChildren(h("h1", { text: "অ্যাডমিন" }), setupBanner());
} else {
  const auth = getAuth(app);

  onAuthStateChanged(auth, async (user) => {
    if (!user) return showLogin();
    const email = String(user.email || "").toLowerCase();
    if (email === OWNER) return showPanel(user, "owner");
    try {
      const s = await getDoc(doc(db, "admins", email));
      if (s.exists() && ["admin", "editor"].includes(s.data().role)) return showPanel(user, s.data().role);
    } catch (e) {}
    showDenied(user);
  });

  function showLogin(msg) {
    root.replaceChildren(h("div", { class: "login panel" },
      h("img", { src: "logo.png", alt: "" }),
      h("h1", { text: "অ্যাডমিন লগইন" }),
      h("p", { class: "sub", text: "শুধু অনুমোদিত Gmail দিয়ে ঢোকা যাবে।" }),
      msg ? h("div", { class: "notice err", text: msg }) : null,
      h("button", {
        class: "btn", type: "button", text: "Google দিয়ে লগইন",
        onclick: async () => {
          try { await signInWithPopup(auth, new GoogleAuthProvider()); }
          catch (e) { showLogin("লগইন হয়নি। পপআপ অনুমতি দিন ও আবার চেষ্টা করুন। (" + (e.code || "error") + ")"); }
        }
      })));
  }
  function showDenied(user) {
    root.replaceChildren(h("div", { class: "login panel" },
      h("h1", { text: "অনুমতি নেই" }),
      h("p", { class: "sub", text: user.email + " এই সাইটের অ্যাডমিন নয়। মূল অ্যাডমিনকে বলুন আপনার Gmail যোগ করতে।" }),
      h("button", { class: "btn ghost", type: "button", text: "লগআউট", onclick: () => signOut(auth) })));
  }

  // ---------- সহায়ক ----------
  async function shrink(file, maxSide, startQ, maxLen) {
    maxLen = maxLen || 900000;
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const s = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * s), ht = Math.round(img.height * s);
      const c = document.createElement("canvas");
      c.width = w; c.height = ht;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, ht); ctx.drawImage(img, 0, 0, w, ht);
      let q = startQ, out = c.toDataURL("image/jpeg", q);
      while (out.length > maxLen && q > 0.4) { q -= 0.08; out = c.toDataURL("image/jpeg", q); }
      if (out.length > maxLen) throw new Error("ছবিটি অনেক বড়, ছোট ছবি দিন।");
      return out;
    } finally { URL.revokeObjectURL(url); }
  }
  function notice() {
    const box = h("div");
    return { box, set(text, kind) { box.replaceChildren(text ? h("div", { class: "notice " + (kind || "ok"), text }) : ""); } };
  }
  const field = (label, input, hint) => h("div", { class: "field" }, h("label", { for: input.id, text: label }), input, hint ? h("small", { text: hint }) : null);
  const sel = (id, opts) => h("select", { id }, opts.map(([v, t]) => h("option", { value: v, text: t })));
  async function readSettings() {
    const s = await getDoc(doc(db, "settings", "site"));
    return mergeSettings(s.exists() ? s.data() : null);
  }
  async function afterSettingsSave() {
    setCachedSettings(await readSettings());
  }

  // ---------- প্যানেল ----------
  function showPanel(user, role) {
    const canSite = role === "owner" || role === "admin";
    const tabs = [["posts", "খবর"]];
    if (canSite) tabs.push(["design", "সাইট ও রং"], ["ads", "বিজ্ঞাপন"], ["pages", "পেজ"]);
    if (role === "owner") tabs.push(["admins", "অ্যাডমিন"]);
    const builders = { posts: postsTab, design: designTab, ads: adsTab, pages: pagesTab, admins: adminsTab };
    const content = h("div");
    const tabBar = h("div", { class: "tabs" });
    let active = "posts";
    async function show(key) {
      active = key;
      Array.from(tabBar.children).forEach((b) => b.setAttribute("aria-pressed", b.dataset.k === key ? "true" : "false"));
      content.replaceChildren(h("p", { class: "empty", text: "লোড হচ্ছে…" }));
      try { content.replaceChildren(await builders[key](user, role)); }
      catch (e) { content.replaceChildren(h("div", { class: "notice err", text: "লোড করা যায়নি: " + (e.code || e.message) })); }
    }
    tabs.forEach(([k, t]) => tabBar.append(h("button", { type: "button", "data-k": k, "aria-pressed": k === active ? "true" : "false", text: t, onclick: () => show(k) })));

    root.replaceChildren(
      h("div", { class: "actions", style: "justify-content:space-between" },
        h("div", {}, h("h1", { text: "অ্যাডমিন প্যানেল" }), h("p", { class: "sub", text: user.email + " · " + ROLE_LABEL[role] })),
        h("div", { class: "actions" },
          h("a", { class: "btn ghost small", href: "index.html", text: "সাইট দেখুন" }),
          h("button", { class: "btn ghost small", type: "button", text: "লগআউট", onclick: () => signOut(auth) }))),
      tabBar, content);
    show(active);
  }

  // ================= খবর =================
  async function postsTab() {
    const S = await loadSettings();
    const note = notice();
    let editing = null;
    const f = {
      title: h("input", { type: "text", id: "f-title", maxlength: 200 }),
      category: sel("f-cat", S.categories.map((c) => [c, c])),
      byline: h("input", { type: "text", id: "f-byline", maxlength: 80, placeholder: "যেমন: নিজস্ব প্রতিবেদক" }),
      summary: h("textarea", { id: "f-summary", maxlength: 300, placeholder: "২-৩ লাইনের সারসংক্ষেপ" }),
      body: h("textarea", { id: "f-body", class: "big" }),
      image: h("input", { type: "file", id: "f-image", accept: "image/*" }),
      video: h("input", { type: "url", id: "f-video", placeholder: "https://www.facebook.com/..." })
    };
    const preview = h("img", { class: "preview", alt: "", hidden: true });
    f.image.addEventListener("change", () => {
      const file = f.image.files[0];
      if (file) { preview.src = URL.createObjectURL(file); preview.hidden = false; }
    });
    const submitBtn = h("button", { class: "btn", type: "submit", text: "পাবলিশ করুন" });
    const cancelBtn = h("button", { class: "btn ghost", type: "button", text: "সম্পাদনা বাতিল", hidden: true, onclick: resetForm });
    const formTitle = h("h2", { text: "নতুন খবর" });

    function resetForm() {
      editing = null; form.reset();
      preview.hidden = true; preview.removeAttribute("src");
      submitBtn.textContent = "পাবলিশ করুন"; cancelBtn.hidden = true; formTitle.textContent = "নতুন খবর";
    }
    const form = h("form", { class: "panel", novalidate: true },
      formTitle,
      field("শিরোনাম", f.title),
      h("div", { class: "row" }, field("বিভাগ", f.category), field("প্রতিবেদক (ঐচ্ছিক)", f.byline)),
      field("সারসংক্ষেপ", f.summary, "হোম পেজে শিরোনামের নিচে দেখায়।"),
      field("খবর", f.body, "প্রতিটি অনুচ্ছেদের মাঝে একটি ফাঁকা লাইন দিন।"),
      h("div", { class: "field" }, h("label", { for: "f-image", text: "ছবি (ঐচ্ছিক)" }), f.image, preview,
        h("small", { text: "ছবি নিজে থেকে ছোট হয়ে সংরক্ষিত হবে। সম্পাদনার সময় নতুন ছবি না দিলে আগেরটি থাকবে।" })),
      field("ফেসবুক ভিডিওর লিংক (ঐচ্ছিক)", f.video, "দিলে খবরের পেজে ভিডিও চলবে এবং হোম পেজের ভিডিও রিপোর্টে আসবে।"),
      h("div", { class: "actions" }, submitBtn, cancelBtn));

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const title = f.title.value.trim(), body = f.body.value.trim();
      if (!title || !body) { note.set("শিরোনাম ও খবর লিখুন।", "err"); return; }
      const video = f.video.value.trim();
      if (video && !/^https?:\/\//i.test(video)) { note.set("ভিডিওর লিংক https:// দিয়ে শুরু হতে হবে।", "err"); return; }
      submitBtn.disabled = true; note.set("সংরক্ষণ হচ্ছে…", "ok");
      try {
        const file = f.image.files[0];
        let thumb = null, full = null;
        if (file) { thumb = await shrink(file, 520, 0.72); full = await shrink(file, 1200, 0.78); }
        const fields = { title, category: f.category.value, byline: f.byline.value.trim(), summary: f.summary.value.trim(), body, videoUrl: video, updatedAt: serverTimestamp() };
        const batch = writeBatch(db);
        let pid;
        if (editing) {
          pid = editing.id;
          if (thumb) fields.thumb = thumb;
          batch.update(doc(db, "posts", pid), fields);
        } else {
          const ref = doc(collection(db, "posts"));
          pid = ref.id;
          batch.set(ref, { ...fields, thumb: thumb || "", createdAt: serverTimestamp() });
        }
        if (full) batch.set(doc(db, "images", pid), { data: full });
        await batch.commit();
        clearCache();
        const wasEdit = !!editing;
        resetForm();
        note.set(wasEdit ? "খবর আপডেট হয়েছে।" : "খবর পাবলিশ হয়েছে।", "ok");
        loadList();
      } catch (e) {
        note.set("সংরক্ষণ হয়নি: " + (e.message || e.code || "অজানা ত্রুটি"), "err");
      } finally { submitBtn.disabled = false; }
    });

    const listBox = h("ul", { class: "plist" });
    async function loadList() {
      listBox.replaceChildren(h("li", {}, h("span", { class: "empty", text: "লোড হচ্ছে…" })));
      try {
        const snap = await getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(50)));
        if (snap.empty) { listBox.replaceChildren(h("li", {}, h("span", { class: "empty", text: "এখনো কোনো খবর নেই।" }))); return; }
        listBox.replaceChildren(...snap.docs.map((d) => {
          const p = d.data();
          const ms = p.createdAt && p.createdAt.toMillis ? p.createdAt.toMillis() : Date.now();
          return h("li", {},
            thumbEl({ category: p.category, thumb: p.thumb }),
            h("div", {}, h("div", { class: "t", text: p.title }), h("div", { class: "meta" }, h("span", { class: "c", text: p.category }), h("span", { text: ago(ms) }))),
            h("div", { class: "ops" },
              h("a", { class: "btn ghost small", href: "article.html?id=" + d.id, target: "_blank", rel: "noopener", text: "দেখুন" }),
              h("button", { class: "btn ghost small", type: "button", text: "সম্পাদনা", onclick: () => startEdit(d.id, p) }),
              h("button", { class: "btn danger small", type: "button", text: "মুছুন", onclick: () => remove(d.id, p.title) })));
        }));
      } catch (e) {
        listBox.replaceChildren(h("li", {}, h("span", { class: "empty", text: "তালিকা আনা যায়নি: " + (e.code || e.message) })));
      }
    }
    function startEdit(pid, p) {
      editing = { id: pid };
      f.title.value = p.title || "";
      if (!S.categories.includes(p.category) && p.category) f.category.append(h("option", { value: p.category, text: p.category }));
      f.category.value = p.category || S.categories[0];
      f.byline.value = p.byline || ""; f.summary.value = p.summary || ""; f.body.value = p.body || ""; f.video.value = p.videoUrl || ""; f.image.value = "";
      if (p.thumb) { preview.src = p.thumb; preview.hidden = false; } else preview.hidden = true;
      submitBtn.textContent = "আপডেট করুন"; cancelBtn.hidden = false; formTitle.textContent = "খবর সম্পাদনা";
      note.set(""); form.scrollIntoView({ behavior: "smooth" });
    }
    async function remove(pid, title) {
      if (!confirm("এই খবরটি মুছে ফেলবেন?\n\n" + title)) return;
      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, "posts", pid)); batch.delete(doc(db, "images", pid));
        await batch.commit();
        clearCache();
        if (editing && editing.id === pid) resetForm();
        note.set("খবর মোছা হয়েছে।", "ok"); loadList();
      } catch (e) { note.set("মোছা যায়নি: " + (e.message || e.code), "err"); }
    }
    loadList();
    return h("div", {}, note.box, form, h("div", { class: "panel" }, h("h2", { text: "প্রকাশিত খবর" }), listBox));
  }

  // ================= সাইট ও রং =================
  const PRESETS = [
    ["নীল-কমলা (ডিফল্ট)", { accent: "#D63B07", main: "#1B1F8F", navy: "#10136B", gold: "#FFC81E" }],
    ["লাল-কালো", { accent: "#C8102E", main: "#1A1A1A", navy: "#0D0D0D", gold: "#F5B800" }],
    ["সবুজ", { accent: "#0B7A52", main: "#0B5D3F", navy: "#063D2A", gold: "#F2C230" }],
    ["নীল", { accent: "#1565C0", main: "#0D47A1", navy: "#08306B", gold: "#FFC107" }],
    ["বেগুনি", { accent: "#7B1FA2", main: "#4A148C", navy: "#2E0A5C", gold: "#FFD54F" }]
  ];
  async function designTab() {
    const S = await readSettings();
    const note = notice();
    let logo = S.logo;
    const colors = { ...S.colors };
    const i = {
      siteName: h("input", { type: "text", id: "d-name", value: S.siteName, maxlength: 60 }),
      tagline1: h("input", { type: "text", id: "d-t1", value: S.tagline1, maxlength: 80 }),
      tagline2: h("input", { type: "text", id: "d-t2", value: S.tagline2, maxlength: 80 }),
      footer: h("input", { type: "text", id: "d-footer", value: S.footer, maxlength: 120 }),
      logo: h("input", { type: "file", id: "d-logo", accept: "image/*" }),
      cats: h("textarea", { id: "d-cats" })
    };
    i.cats.value = S.categories.join("\n");
    const logoPrev = h("img", { class: "preview", alt: "লোগো", src: logo || "logo.png" });
    i.logo.addEventListener("change", async () => {
      const file = i.logo.files[0];
      if (!file) return;
      try { logo = await shrink(file, 500, 0.9, 200000); logoPrev.src = logo; note.set(""); }
      catch (e) { note.set(e.message, "err"); }
    });

    const colorInputs = {};
    const colorLabels = { accent: "বাটন ও হাইলাইট", main: "মূল রং", navy: "গাঢ় রং", gold: "শিরোনামের রং" };
    function applyColors() { applyTheme({ ...S, colors }); }
    const colorBox = h("div", { class: "colors" }, Object.keys(colorLabels).map((k) => {
      const inp = h("input", { type: "color", id: "c-" + k, value: colors[k] });
      inp.addEventListener("input", () => { colors[k] = inp.value; applyColors(); });
      colorInputs[k] = inp;
      return field(colorLabels[k], inp);
    }));
    const presetBox = h("div", { class: "presets" }, PRESETS.map(([name, c]) =>
      h("button", {
        class: "btn ghost small", type: "button", text: name,
        onclick: () => { Object.assign(colors, c); Object.keys(c).forEach((k) => { colorInputs[k].value = c[k]; }); applyColors(); }
      })));
    const prev = h("div", { class: "theme-prev" }, h("span", { class: "pa", text: "বাটন" }), h("span", { class: "pm", text: "মূল রং" }), h("span", { class: "pn", text: "গাঢ় রং" }), h("span", { class: "pg", text: "শিরোনাম" }));

    const social = {};
    const socialFields = Object.keys(SOCIAL_LABELS).map((k) => {
      social[k] = h("input", { type: "url", id: "s-" + k, value: S.social[k] || "", placeholder: "https://..." });
      return field(SOCIAL_LABELS[k], social[k]);
    });

    const saveBtn = h("button", { class: "btn", type: "submit", text: "সংরক্ষণ করুন" });
    const form = h("form", { novalidate: true },
      h("div", { class: "panel" }, h("h2", { text: "সাইটের পরিচয়" }),
        field("সাইটের নাম", i.siteName), field("স্লোগান (বড়)", i.tagline1), field("স্লোগান (ছোট)", i.tagline2),
        h("div", { class: "field" }, h("label", { for: "d-logo", text: "লোগো" }), i.logo, logoPrev,
          h("small", { text: "ছবি নিজে থেকে ছোট হবে। সাদা জমিনের ওপর বসবে।" }),
          h("div", { class: "actions" }, h("button", { class: "btn ghost small", type: "button", text: "ডিফল্ট লোগো", onclick: () => { logo = ""; logoPrev.src = "logo.png"; i.logo.value = ""; } }))),
        field("নিচের লেখা", i.footer, "© সাইটের নামের পরে বসে।")),
      h("div", { class: "panel" }, h("h2", { text: "রং" }),
        h("p", { class: "hint", text: "রং বদলালে এই পেজেই সঙ্গে সঙ্গে দেখতে পাবেন। পছন্দ হলে সংরক্ষণ করুন।" }),
        presetBox, colorBox, prev),
      h("div", { class: "panel" }, h("h2", { text: "বিভাগ" }),
        field("বিভাগের নাম", i.cats, "প্রতি লাইনে একটি। সর্বোচ্চ ১২টি। নাম বদলালে আগের খবর ওই নামের বিভাগে আর আলাদা দেখাবে না, তবে \"সব\" এ থাকবে।")),
      h("div", { class: "panel" }, h("h2", { text: "সোশ্যাল লিংক" }),
        h("p", { class: "hint", text: "ফাঁকা রাখলে সাইটে দেখাবে না।" }), socialFields),
      h("div", { class: "actions" }, saveBtn));

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const cats = [...new Set(i.cats.value.split("\n").map((t) => t.trim()).filter(Boolean))].slice(0, 12);
      if (!cats.length) { note.set("অন্তত একটি বিভাগ রাখুন।", "err"); return; }
      if (!i.siteName.value.trim()) { note.set("সাইটের নাম লিখুন।", "err"); return; }
      for (const k of Object.keys(social)) {
        const v = social[k].value.trim();
        if (v && !/^https?:\/\//i.test(v)) { note.set(SOCIAL_LABELS[k] + " লিংক https:// দিয়ে শুরু হতে হবে।", "err"); return; }
      }
      saveBtn.disabled = true; note.set("সংরক্ষণ হচ্ছে…");
      try {
        const sc = {};
        Object.keys(social).forEach((k) => { sc[k] = social[k].value.trim(); });
        await setDoc(doc(db, "settings", "site"), {
          siteName: i.siteName.value.trim(), tagline1: i.tagline1.value.trim(), tagline2: i.tagline2.value.trim(), footer: i.footer.value.trim(),
          logo, colors: { ...colors }, categories: cats, social: sc
        }, { merge: true });
        await afterSettingsSave();
        note.set("সংরক্ষিত হয়েছে। সাইটে পরিবর্তন দেখতে এক-দুইবার রিফ্রেশ করুন।");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (e) { note.set("সংরক্ষণ হয়নি: " + (e.message || e.code), "err"); }
      finally { saveBtn.disabled = false; }
    });
    return h("div", {}, note.box, form);
  }

  // ================= বিজ্ঞাপন =================
  async function adsTab() {
    const S = await readSettings();
    const note = notice();
    const a = S.ads;
    const enabled = h("input", { type: "checkbox", id: "a-en" }); enabled.checked = a.enabled;
    const auto = h("input", { type: "checkbox", id: "a-auto" }); auto.checked = a.auto;
    const client = h("input", { type: "text", id: "a-client", value: a.client, placeholder: "ca-pub-1234567890123456" });
    const have = {};
    await Promise.all(Object.keys(PLACEMENTS).map(async (k) => {
      try { have[k] = (await getDoc(doc(db, "assets", "ad-" + k))).exists(); } catch (e) { have[k] = false; }
    }));
    const slots = {};
    const slotBoxes = Object.keys(PLACEMENTS).map((k) => {
      const p = a.placements[k];
      const s = {
        type: sel("p-type-" + k, [["none", "বন্ধ"], ["adsense", "Google AdSense স্লট"], ["banner", "নিজস্ব ব্যানার (ছবি + লিংক)"]]),
        slot: h("input", { type: "text", id: "p-slot-" + k, value: p.slot, placeholder: "বিজ্ঞাপন স্লট নম্বর (শুধু সংখ্যা)" }),
        file: h("input", { type: "file", id: "p-file-" + k, accept: "image/*" }),
        link: h("input", { type: "url", id: "p-link-" + k, value: p.link, placeholder: "https://... (ক্লিক করলে যেখানে যাবে)" })
      };
      s.type.value = p.type;
      slots[k] = s;
      return h("div", { class: "slot" }, h("h3", { text: PLACEMENTS[k] }),
        field("ধরন", s.type), field("AdSense স্লট নম্বর", s.slot), field("ব্যানার ছবি", s.file, have[k] ? "ছবি আপলোড করা আছে। নতুন ছবি দিলে বদলে যাবে।" : "এখনো ছবি নেই।"), field("ব্যানারের লিংক", s.link));
    });
    const saveBtn = h("button", { class: "btn", type: "submit", text: "সংরক্ষণ করুন" });
    const form = h("form", { novalidate: true },
      h("div", { class: "panel" }, h("h2", { text: "বিজ্ঞাপনের সেটিংস" }),
        h("p", { class: "hint", text: "এখন আয় করতে না চাইলে বন্ধ রাখুন। যখন Google AdSense অনুমোদন পাবেন, তখন এখানে আপনার পাবলিশার আইডি বসিয়ে চালু করুন। ads.txt ফাইলও লাগবে (গাইড দেখুন)।" }),
        h("label", { class: "check", for: "a-en" }, enabled, h("span", { text: "বিজ্ঞাপন চালু করুন" })),
        field("AdSense পাবলিশার আইডি", client, "AdSense অ্যাকাউন্টে পাওয়া যায়, ca-pub- দিয়ে শুরু।"),
        h("label", { class: "check", for: "a-auto" }, auto, h("span", { text: "অটো অ্যাড: Google নিজে জায়গা বেছে নেবে (সবচেয়ে সহজ)" }))),
      h("div", { class: "panel" }, h("h2", { text: "নির্দিষ্ট জায়গায় বিজ্ঞাপন" }),
        h("p", { class: "hint", text: "AdSense স্লট নম্বর AdSense থেকে \"বিজ্ঞাপন ইউনিট\" বানালে পাবেন। নিজস্ব ব্যানারে স্পনসরের ছবি ও লিংক বসান। সাইটে \"বিজ্ঞাপন\" লেখা দেখাবে।" }),
        slotBoxes),
      h("div", { class: "actions" }, saveBtn));

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const cl = client.value.trim();
      const usesAds = enabled.checked && (auto.checked || Object.values(slots).some((s) => s.type.value === "adsense"));
      if (usesAds && !/^ca-pub-\d{6,}$/.test(cl)) { note.set("AdSense পাবলিশার আইডি ঠিকভাবে দিন (ca-pub-সংখ্যা)।", "err"); return; }
      const placements = {};
      for (const k of Object.keys(PLACEMENTS)) {
        const s = slots[k], type = s.type.value, slot = s.slot.value.trim(), link = s.link.value.trim();
        if (type === "adsense" && !/^\d{5,}$/.test(slot)) { note.set(PLACEMENTS[k] + ": স্লট নম্বর শুধু সংখ্যা হতে হবে।", "err"); return; }
        if (link && !/^https?:\/\//i.test(link)) { note.set(PLACEMENTS[k] + ": লিংক https:// দিয়ে শুরু হতে হবে।", "err"); return; }
        placements[k] = { type, slot, link };
      }
      saveBtn.disabled = true; note.set("সংরক্ষণ হচ্ছে…");
      try {
        const batch = writeBatch(db);
        for (const k of Object.keys(PLACEMENTS)) {
          const file = slots[k].file.files[0];
          if (file) batch.set(doc(db, "assets", "ad-" + k), { data: await shrink(file, 1200, 0.8, 450000) });
        }
        batch.set(doc(db, "settings", "site"), { ads: { enabled: enabled.checked, client: cl, auto: auto.checked, placements } }, { merge: true });
        await batch.commit();
        await afterSettingsSave();
        note.set("সংরক্ষিত হয়েছে।");
      } catch (e) { note.set("সংরক্ষণ হয়নি: " + (e.message || e.code), "err"); }
      finally { saveBtn.disabled = false; }
    });
    return h("div", {}, note.box, form);
  }

  // ================= পেজ =================
  async function pagesTab() {
    const S = await readSettings();
    const note = notice();
    const pick = sel("pg-pick", Object.keys(PAGES).map((k) => [k, PAGES[k]]));
    const title = h("input", { type: "text", id: "pg-title", maxlength: 120 });
    const body = h("textarea", { id: "pg-body", class: "big" });
    const saveBtn = h("button", { class: "btn", type: "submit", text: "সংরক্ষণ করুন" });
    async function load() {
      note.set("");
      const slug = pick.value;
      let d = null;
      try { const s = await getDoc(doc(db, "pages", slug)); d = s.exists() ? s.data() : null; } catch (e) {}
      const def = defaultPage(slug, S.siteName);
      title.value = (d && d.title) || def.title;
      body.value = (d && d.body) || def.body;
    }
    pick.addEventListener("change", load);
    const form = h("form", { class: "panel", novalidate: true },
      h("h2", { text: "স্থায়ী পেজ" }),
      h("p", { class: "hint", text: "সাইটের নিচে এই পেজগুলোর লিংক থাকে। AdSense-এর জন্য এগুলো ঠিকঠাক লেখা দরকার।" }),
      field("পেজ বাছুন", pick), field("শিরোনাম", title), field("লেখা", body, "প্রতিটি অনুচ্ছেদের মাঝে একটি ফাঁকা লাইন দিন।"),
      h("div", { class: "actions" }, saveBtn, h("a", { class: "btn ghost small", href: "page.html?p=about", target: "_blank", rel: "noopener", id: "pg-view", text: "পেজ দেখুন" })));
    pick.addEventListener("change", () => { form.querySelector("#pg-view").href = "page.html?p=" + pick.value; });
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!title.value.trim() || !body.value.trim()) { note.set("শিরোনাম ও লেখা দিন।", "err"); return; }
      saveBtn.disabled = true;
      try {
        await setDoc(doc(db, "pages", pick.value), { title: title.value.trim(), body: body.value.trim(), updatedAt: serverTimestamp() });
        note.set("পেজ সংরক্ষিত হয়েছে।");
      } catch (e) { note.set("সংরক্ষণ হয়নি: " + (e.message || e.code), "err"); }
      finally { saveBtn.disabled = false; }
    });
    await load();
    return h("div", {}, note.box, form);
  }

  // ================= অ্যাডমিন (শুধু মূল অ্যাডমিন) =================
  async function adminsTab(user) {
    const note = notice();
    const email = h("input", { type: "email", id: "ad-email", placeholder: "example@gmail.com" });
    const roleSel = sel("ad-role", [["editor", "সম্পাদক (শুধু খবর লিখতে পারবে)"], ["admin", "অ্যাডমিন (খবর, রং, বিজ্ঞাপন, পেজ)"]]);
    const addBtn = h("button", { class: "btn", type: "submit", text: "যোগ করুন" });
    const listBox = h("ul", { class: "ulist" });

    async function loadList() {
      const snap = await getDocs(collection(db, "admins"));
      if (snap.empty) { listBox.replaceChildren(h("li", {}, h("span", { class: "empty", text: "এখনো কেউ যোগ হয়নি।" }))); return; }
      listBox.replaceChildren(...snap.docs.map((d) => {
        const role = h("select", { "aria-label": "ভূমিকা" }, [["editor", "সম্পাদক"], ["admin", "অ্যাডমিন"]].map(([v, t]) => h("option", { value: v, text: t })));
        role.value = d.data().role;
        role.addEventListener("change", async () => {
          try { await setDoc(doc(db, "admins", d.id), { role: role.value }, { merge: true }); note.set(d.id + " এর ভূমিকা বদলানো হয়েছে।"); }
          catch (e) { note.set("বদলানো যায়নি: " + (e.code || e.message), "err"); }
        });
        return h("li", {}, h("span", { class: "who", text: d.id }), h("div", { class: "actions" }, role,
          h("button", {
            class: "btn danger small", type: "button", text: "সরান",
            onclick: async () => {
              if (!confirm(d.id + " কে সরিয়ে দেবেন?")) return;
              try { await deleteDoc(doc(db, "admins", d.id)); note.set("সরানো হয়েছে।"); loadList(); }
              catch (e) { note.set("সরানো যায়নি: " + (e.code || e.message), "err"); }
            }
          })));
      }));
    }
    const form = h("form", { class: "panel", novalidate: true },
      h("h2", { text: "নতুন অ্যাডমিন বা সম্পাদক যোগ" }),
      h("p", { class: "hint", text: "যে Gmail যোগ করবেন, ওই Gmail দিয়ে Google লগইন করলেই সে প্রবেশ করতে পারবে। সঠিক Gmail ঠিকানা দিন।" }),
      field("Gmail ঠিকানা", email), field("ভূমিকা", roleSel), h("div", { class: "actions" }, addBtn));
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const em = email.value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { note.set("সঠিক ইমেইল ঠিকানা দিন।", "err"); return; }
      if (em === OWNER) { note.set("এটি মূল অ্যাডমিনের ঠিকানা।", "err"); return; }
      addBtn.disabled = true;
      try {
        await setDoc(doc(db, "admins", em), { role: roleSel.value, addedBy: String(user.email).toLowerCase(), addedAt: serverTimestamp() });
        email.value = ""; note.set(em + " যোগ হয়েছে।"); loadList();
      } catch (e) { note.set("যোগ করা যায়নি: " + (e.code || e.message), "err"); }
      finally { addBtn.disabled = false; }
    });
    await loadList();
    return h("div", {}, note.box, form, h("div", { class: "panel" }, h("h2", { text: "বর্তমান তালিকা" }),
      h("p", { class: "hint", text: "মূল অ্যাডমিন (" + OWNER + ") সবসময় সব কিছু করতে পারবেন।" }), listBox));
  }
}
