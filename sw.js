const V = "jds-89e0830a64";
const APP = ["./", "app.js", "dados.js", "logo.png", "icon-192.png", "icon-512.png", "manifest.webmanifest", "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"];
self.addEventListener("install", e => e.waitUntil(caches.open(V).then(c => c.addAll(APP.map(u => new Request(u, { cache: "reload" })))).then(() => skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x.startsWith("jds-") && x !== V).map(x => caches.delete(x)))).then(() => clients.claim())));
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || !u.protocol.startsWith("http")) return;
  const salvo = () => caches.match(r, { ignoreSearch: u.origin === location.origin, ignoreVary: true });
  const rede = () => fetch(r).then(x => { if (x.ok || x.type === "opaque") { const y = x.clone(); e.waitUntil(caches.open(V).then(c => c.put(r, y))); } return x; });
  // arquivos do app: rede primeiro, para receber atualizações; fontes e biblioteca: cópia salva primeiro
  e.respondWith(u.origin === location.origin ? rede().catch(() => salvo().then(x => x || (r.mode === "navigate" ? caches.match("./") : Response.error()))) : salvo().then(x => x || rede()));
});
