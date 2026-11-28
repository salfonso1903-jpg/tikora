/* TIKORA - app.js replacement

- Existing www/index.html, www/style.css and www/config.js ile uyumludur.
- Supabase tabloları: profiles, posts, likes, comments, saved_posts, follows,
- messages, stories, user_settings. İsteğe bağlı: notifications, friend_requests,
- blocked_users, story_views.
  */
  (() => {
  "use strict";

const cfg = window.TIKORA_CONFIG || {};
const byId = (id) => document.getElementById(id);
const required = ["auth", "app", "nav", "toast"];
if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
document.addEventListener("DOMContentLoaded", () => {
const msg = byId("authMsg");
if (msg) msg.textContent = "Supabase ayarı bulunamadı. www/config.js dosyasını kontrol et.";
});
console.error("TIKORA: Supabase yapılandırması bulunamadı.");
return;
}
const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
const $ = byId;
let user = null;
let profile = null;
let activePeer = null;
let posts = [];
let chatChannel = null;
let searchTimer = null;
let toastTimer = null;
let authBusy = false;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
"&": "&", "<": "<", ">": ">", '"': """, "'": "'"
})[c]);
const setText = (id, value) => { const el = $(id); if (el) el.textContent = value; };
const setHtml = (id, value) => { const el = $(id); if (el) el.innerHTML = value; };
const on = (id, event, handler) => { const el = $(id); if (el) el.addEventListener(event, handler); };
const showError = (error, prefix = "") => {
console.error("TIKORA:", error);
const message = error?.message || String(error || "Bilinmeyen hata");
toast((prefix ? prefix + ": " : "") + message);
};
function toast(message) {
const el = $("toast");
if (!el) return;
el.textContent = message;
el.style.display = "block";
clearTimeout(toastTimer);
toastTimer = setTimeout(() => { el.style.display = "none"; }, 3200);
}
function authView(isLoggedIn) {
if ($("auth")) $("auth").hidden = !!isLoggedIn;
if ($("app")) $("app").hidden = !isLoggedIn;
if ($("nav")) $("nav").hidden = !isLoggedIn;
}
function showScreen(name, options = {}) {
document.querySelectorAll(".screen").forEach((el) => { el.hidden = el.id !== name; });
document.querySelectorAll("nav button[data-screen]").forEach((button) => {
button.style.color = button.dataset.screen === name ? "#55dba4" : "#fff";
});
if (!user) return;
if (name === "home") loadFeed();
if (name === "reels") loadVideos();
if (name === "explore") { setHtml("searchResults", ""); if ($("search")) $("search").value = ""; }
if (name === "messages" && !options.skipInbox) loadInbox();
if (name === "notifications") loadNotifications();
if (name === "profile") loadProfile();
if (name === "settings") loadSettings();
}
async function ensureProfile(authUser) {
const meta = authUser.user_metadata || {};
const fallbackName = (authUser.email || authUser.phone || "tikora").split("@")[0];
const username = String(meta.username || fallbackName || "tikora").replace(/[^a-zA-Z0-9_.]/g, "").slice(0, 30) || "tikora";
const { data, error } = await client.from("profiles").upsert({
id: authUser.id,
username,
display_name: meta.display_name || meta.username || username
}, { onConflict: "id" }).select().single();
if (error) throw error;
profile = data;
}
async function afterAuth(authUser) {
if (!authUser || authBusy) return;
authBusy = true;
try {
user = authUser;
await ensureProfile(authUser);
authView(true);
showScreen("home");
loadStories();
refreshNotificationCount();
} catch (error) {
showError(error, "Profil açılamadı");
authView(false);
} finally { authBusy = false; }
}

async function signInWithIdentifier() {
const identifier = $("email")?.value.trim() || "";
const password = $("password")?.value || "";
if (!identifier || !password) { setText("authMsg", "E-posta ve şifreni gir."); return; }
if (!identifier.includes("@")) { setText("authMsg", "Şimdilik e-posta adresinle giriş yap. Kullanıcı adıyla giriş için sunucu tarafı doğrulama gerekir."); return; }
const { data, error } = await client.auth.signInWithPassword({ email: identifier, password });
if (error) { setText("authMsg", error.message); return; }
if (data.user) await afterAuth(data.user);
}
async function signUp() {
const email = $("email")?.value.trim() || "";
const password = $("password")?.value || "";
const username = $("username")?.value.trim() || "";
if (!email || !email.includes("@")) { setText("authMsg", "Geçerli bir e-posta adresi yaz."); return; }
if (password.length < 6) { setText("authMsg", "Şifre en az 6 karakter olmalı."); return; }
if (username.length < 3) { setText("authMsg", "Kullanıcı adı en az 3 karakter olmalı."); return; }
const { data, error } = await client.auth.signUp({ email, password, options: { data: { username, display_name: username } } });
if (error) { setText("authMsg", error.message); return; }
if (data.session && data.user) await afterAuth(data.user);
else setText("authMsg", "Kayıt oluşturuldu. E-posta adresine gelen doğrulama bağlantısına tıkla, sonra giriş yap.");
}
async function sendOtp() {
const phone = $("phone")?.value.trim() || "";
if (!phone.startsWith("+")) { setText("authMsg", "Telefon numarasını ülke koduyla yaz. Örnek: +905xxxxxxxxx"); return; }
const { error } = await client.auth.signInWithOtp({ phone });
if (error) setText("authMsg", error.message);
else setText("authMsg", "SMS kodu gönderildi. Gelen kodu aşağıya yaz.");
}
async function verifyOtp() {
const phone = $("phone")?.value.trim() || "";
const token = $("otp")?.value.trim() || "";
if (!phone || !token) { setText("authMsg", "Telefon numarası ve SMS kodunu gir."); return; }
const { data, error } = await client.auth.verifyOtp({ phone, token, type: "sms" });
if (error) setText("authMsg", error.message);
else if (data.user) await afterAuth(data.user);
}

function mediaMarkup(post) {
if (!post.media_url) return "";
const url = escapeHtml(post.media_url);
if (post.media_type === "video") return <video class="postMedia" controls playsinline preload="metadata" src="${url}"></video>;
return <img class="postMedia" loading="lazy" src="${url}" alt="Gönderi görseli">;
}
function postCard(post) {
const name = post.profiles?.username || "kullanici";
const avatar = post.profiles?.avatar_url
? <img class="avatarImg" src="${escapeHtml(post.profiles.avatar_url)}" alt="">
: <div class="avatar">${escapeHtml(name.charAt(0).toUpperCase())}</div>;
return <article class="post"><div class="postTop">${avatar}<b class="userLink" data-user="${escapeHtml(post.user_id)}">@${escapeHtml(name)}</b></div>${mediaMarkup(post)}<div class="postText">${escapeHtml(post.caption || "")}</div><div class="postActions"><button type="button" data-like="${escapeHtml(post.id)}" aria-pressed="false">♡ Beğen</button><button type="button" data-comments="${escapeHtml(post.id)}">◯ Yorumlar</button><button type="button" data-share="${escapeHtml(post.id)}">↗ Paylaş</button><button type="button" data-save="${escapeHtml(post.id)}">☆ Kaydet</button></div></article>;
}
async function loadFeed() {
if (!$("feed")) return;
setHtml("feed", '<p class="empty">Akış yükleniyor…</p>');
const { data, error } = await client.from("posts")
.select("id,user_id,caption,media_url,media_type,created_at,profiles(username,avatar_url)")
.order("created_at", { ascending: false }).limit(40);
if (error) { setHtml("feed", <p class="empty">Akış yüklenemedi: ${escapeHtml(error.message)}</p>); return; }
posts = data || [];
setHtml("feed", posts.length ? posts.map(postCard).join("") : '<p class="empty">Henüz gönderi yok. İlk paylaşımı sen yap!</p>');
bindPostActions();
await hydrateLikeStates();
}
async function hydrateLikeStates() {
if (!user) return;
const buttons = [...document.querySelectorAll("[data-like]")];
if (!buttons.length) return;
const ids = [...new Set(buttons.map((button) => button.dataset.like))];
const { data, error } = await client.from("likes").select("post_id").eq("user_id", user.id).in("post_id", ids);
if (error) return;
const liked = new Set((data || []).map((row) => String(row.post_id)));
buttons.forEach((button) => {
const active = liked.has(String(button.dataset.like));
button.setAttribute("aria-pressed", String(active));
button.classList.toggle("liked", active);
button.textContent = active ? "♥ Beğenildi" : "♡ Beğen";
});
}
function bindPostActions() {
document.querySelectorAll("[data-like]").forEach((b) => { b.onclick = () => toggleLike(b.dataset.like); });
document.querySelectorAll("[data-comments]").forEach((b) => { b.onclick = () => showComments(b.dataset.comments); });
document.querySelectorAll("[data-share]").forEach((b) => { b.onclick = () => sharePost(b.dataset.share); });
document.querySelectorAll("[data-save]").forEach((b) => { b.onclick = () => savePost(b.dataset.save); });
document.querySelectorAll("[data-user]").forEach((b) => { b.onclick = () => openUser(b.dataset.user); });
}
async function toggleLike(id) {
if (!user) return;
const buttons = [...document.querySelectorAll([data-like="${CSS.escape(String(id))}"])];
buttons.forEach((b) => { b.disabled = true; });
try {
const { data, error } = await client.from("likes").select("id").eq("post_id", id).eq("user_id", user.id).maybeSingle();
if (error) throw error;
const result = data
? await client.from("likes").delete().eq("id", data.id).eq("user_id", user.id)
: await client.from("likes").insert({ post_id: id, user_id: user.id });
if (result.error) throw result.error;
const active = !data;
buttons.forEach((b) => { b.setAttribute("aria-pressed", String(active)); b.classList.toggle("liked", active); b.textContent = active ? "♥ Beğenildi" : "♡ Beğen"; });
} catch (error) { showError(error, "Beğeni kaydedilemedi"); }
finally { buttons.forEach((b) => { b.disabled = false; }); }
}
async function savePost(id) {
const { error } = await client.from("saved_posts").upsert({ user_id: user.id, post_id: id }, { onConflict: "user_id,post_id" });
if (error) showError(error, "Gönderi kaydedilemedi"); else toast("Gönderi kaydedildi.");
}
async function showComments(id) {
const { data, error } = await client.from("comments").select("id,user_id,body,created_at,profiles(username,avatar_url)").eq("post_id", id).order("created_at", { ascending: true });
if (error) { showError(error, "Yorumlar yüklenemedi"); return; }
const dialog = document.createElement("dialog");
dialog.className = "commentsDialog";
dialog.innerHTML = <form method="dialog"><h2>Yorumlar</h2><div>${(data || []).map((c) => <p><b>@${escapeHtml(c.profiles?.username || "kullanici")}</b> ${escapeHtml(c.body)}</p>).join("") || "<p>Henüz yorum yok.</p>"}</div><textarea id="newComment" placeholder="Yorum yaz…"></textarea><div class="actions"><button value="cancel" class="secondary">Kapat</button><button type="button" id="sendComment">Gönder</button></div></form>;
document.body.appendChild(dialog); dialog.showModal();
dialog.querySelector("#sendComment").onclick = async () => {
const body = dialog.querySelector("#newComment").value.trim();
if (!body) return;
const result = await client.from("comments").insert({ post_id: id, user_id: user.id, body });
if (result.error) showError(result.error, "Yorum eklenemedi");
else { dialog.close(); toast("Yorum eklendi."); }
};
dialog.addEventListener("close", () => dialog.remove(), { once: true });
}
async function sharePost(id) {
const post = posts.find((p) => String(p.id) === String(id));
const text = ${post?.caption || "TIKORA gönderisi"} ${post?.media_url || ""}.trim();
try {
if (navigator.share) await navigator.share({ title: "TIKORA", text });
else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); toast("Gönderi bilgisi kopyalandı."); }
else toast(text);
} catch (error) { if (error?.name !== "AbortError") showError(error, "Paylaşım yapılamadı"); }
}
async function publish() {
const file = $("media")?.files?.[0] || null;
const caption = $("caption")?.value.trim() || "";
if (!file && !caption) { toast("Metin veya fotoğraf/video ekle."); return; }
if (file && file.size > 100 * 1024 * 1024) { toast("Dosya en fazla 100 MB olabilir."); return; }
let mediaUrl = null, mediaType = null;
if (file) {
const ext = (file.name.split(".").pop() || "bin").toLowerCase();
const path = ${user.id}/${Date.now()}.${ext};
const upload = await client.storage.from("media").upload(path, file, { upsert: false });
if (upload.error) { showError(upload.error, "Medya yüklenemedi"); return; }
mediaUrl = client.storage.from("media").getPublicUrl(path).data.publicUrl;
mediaType = file.type.startsWith("video/") ? "video" : "image";
}
const { error } = await client.from("posts").insert({ user_id: user.id, caption, media_url: mediaUrl, media_type: mediaType });
if (error) { showError(error, "Gönderi paylaşılmadı"); return; }
$("postDialog")?.close();
if ($("caption")) $("caption").value = "";
if ($("media")) $("media").value = "";
toast("Gönderin paylaşıldı.");
loadFeed(); loadVideos();
}
async function loadVideos() {
if (!$("videoFeed")) return;
setHtml("videoFeed", '<p class="empty">Videolar yükleniyor…</p>');
const { data, error } = await client.from("posts")
.select("id,user_id,caption,media_url,media_type,created_at,profiles(username,avatar_url)")
.eq("media_type", "video").order("created_at", { ascending: false }).limit(50);
if (error) { setHtml("videoFeed", <p class="empty">Videolar yüklenemedi: ${escapeHtml(error.message)}</p>); return; }
const rows = data || [];
setHtml("videoFeed", rows.map((p) => <article class="reel"><video controls playsinline loop preload="metadata" src="${escapeHtml(p.media_url)}"></video><p><b>@${escapeHtml(p.profiles?.username || "kullanici")}</b><br>${escapeHtml(p.caption || "")}<br><button data-like="${escapeHtml(p.id)}" aria-pressed="false">♡ Beğen</button> <button data-comments="${escapeHtml(p.id)}">Yorumlar</button></p></article>).join("") || '<p class="empty">Henüz video yok. + tuşuyla video paylaş.</p>');
bindPostActions(); await hydrateLikeStates();
}

async function searchUsers() {
const query = $("search")?.value.trim() || "";
if (query.length < 2) { setHtml("searchResults", ""); return; }
const { data, error } = await client.from("profiles").select("id,username,display_name,bio").ilike("username", %${query}%).neq("id", user.id).limit(25);
if (error) { setHtml("searchResults", <p class="empty">${escapeHtml(error.message)}</p>); return; }
const people = data || [];
setHtml("searchResults", people.map((p) => <div class="card userResult"><b>@${escapeHtml(p.username || "kullanici")}</b><span>${escapeHtml(p.display_name || "")}</span><button data-profile="${escapeHtml(p.id)}">Profil</button><button data-follow="${escapeHtml(p.id)}">Takip et</button><button data-message="${escapeHtml(p.id)}">Mesaj</button></div>).join("") || '<p class="empty">Kullanıcı bulunamadı.</p>');
const followButtons = [...document.querySelectorAll("[data-follow]")];
if (followButtons.length) {
const ids = followButtons.map((b) => b.dataset.follow);
const follows = await client.from("follows").select("following_id").eq("follower_id", user.id).in("following_id", ids);
if (!follows.error) {
const followed = new Set((follows.data || []).map((x) => String(x.following_id)));
followButtons.forEach((b) => { const active = followed.has(String(b.dataset.follow)); b.textContent = active ? "Takip ediliyor" : "Takip et"; b.dataset.following = String(active); });
}
}
document.querySelectorAll("[data-profile]").forEach((b) => { b.onclick = () => openUser(b.dataset.profile); });
document.querySelectorAll("[data-follow]").forEach((b) => { b.onclick = () => toggleFollow(b.dataset.follow); });
document.querySelectorAll("[data-message]").forEach((b) => { b.onclick = () => openChat(b.dataset.message); });
}
async function toggleFollow(id) {
if (!user || !id || id === user.id) return;
const buttons = [...document.querySelectorAll([data-follow="${CSS.escape(String(id))}"],#followThis)];
buttons.forEach((b) => { b.disabled = true; });
try {
const { data, error } = await client.from("follows").select("follower_id").eq("follower_id", user.id).eq("following_id", id).maybeSingle();
if (error) throw error;
const result = data
? await client.from("follows").delete().eq("follower_id", user.id).eq("following_id", id)
: await client.from("follows").insert({ follower_id: user.id, following_id: id });
if (result.error) throw result.error;
const label = data ? "Takip et" : "Takip ediliyor";
buttons.forEach((b) => { b.textContent = label; b.dataset.following = String(!data); });
toast(data ? "Takipten çıkıldı." : "Takip edildi.");
} catch (error) { showError(error, "Takip işlemi başarısız"); }
finally { buttons.forEach((b) => { b.disabled = false; }); }
}
async function openUser(id) {
const { data: person, error } = await client.from("profiles").select("id,username,display_name,bio,avatar_url").eq("id", id).maybeSingle();
if (error || !person) { showError(error || { message: "Profil bulunamadı." }); return; }
const { data: theirPosts } = await client.from("posts").select("id,user_id,caption,media_url,media_type,created_at,profiles(username,avatar_url)").eq("user_id", id).order("created_at", { ascending: false });
setHtml("searchResults", <div class="card"><h2>@${escapeHtml(person.username || "kullanici")}</h2><p>${escapeHtml(person.display_name || "")}</p><p>${escapeHtml(person.bio || "")}</p><button id="followThis" type="button">Takip et / bırak</button><button id="messageThis" type="button">Mesaj gönder</button></div>${(theirPosts || []).map(postCard).join("")});
on("followThis", "click", () => toggleFollow(id));
on("messageThis", "click", () => openChat(id));
bindPostActions(); await hydrateLikeStates();
}

async function loadProfile() {
const { data, error } = await client.from("profiles").select("*").eq("id", user.id).maybeSingle();
if (error) { showError(error, "Profil yüklenemedi"); return; }
profile = data || profile;
const username = profile?.username || user.email || "TIKORA kullanıcısı";
const avatar = profile?.avatar_url
? <img class="profileAvatar" src="${escapeHtml(profile.avatar_url)}" alt="Profil fotoğrafı">
: <div class="profileAvatar avatar">${escapeHtml(username.charAt(0).toUpperCase())}</div>;
setHtml("myProfile", <div class="card profileCard">${avatar}<h2>${escapeHtml(username)}</h2><p>${escapeHtml(profile?.display_name || "TIKORA kullanıcısı")}</p><p>${escapeHtml(profile?.bio || "")}</p><button id="editProfile" type="button">Profili düzenle</button><button id="logout" type="button">Çıkış yap</button></div><div id="ownPosts"></div>);
on("logout", "click", signOut);
on("editProfile", "click", editProfile);
const { data: mine, error: postError } = await client.from("posts").select("id,user_id,caption,media_url,media_type,created_at,profiles(username,avatar_url)").eq("user_id", user.id).order("created_at", { ascending: false });
if (postError) setHtml("ownPosts", `<p class="empty">${escapeHt
