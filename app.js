"use strict";
/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = c => "R$ " + (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const reais = v => brl(Math.round(v * 100));
const numBR = (v, d = 2) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: d });
/* "1.234,56", "1234.5" e "1.200" viram número */
function num(s) {
  s = String(s ?? "").replace(/[^\d.,-]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const hoje = () => iso(new Date());
const maisDias = (s, n) => { const d = new Date(s + "T12:00"); d.setDate(d.getDate() + n); return iso(d); };
const fData = s => s ? s.split("-").reverse().join("/") : "";
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const sem = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

function extenso(cent) {
  const U = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const D = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const C = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  const ate999 = n => {
    if (n === 100) return "cem";
    const p = [];
    if (n >= 100) p.push(C[Math.floor(n / 100)]);
    n %= 100;
    if (n >= 20) { p.push(D[Math.floor(n / 10)]); if (n % 10) p.push(U[n % 10]); }
    else if (n) p.push(U[n]);
    return p.join(" e ");
  };
  const inteiro = n => {
    const mi = Math.floor(n / 1e6), mil = Math.floor(n / 1e3) % 1e3, r = n % 1e3, p = [];
    if (mi) p.push(ate999(mi) + (mi > 1 ? " milhões" : " milhão"));
    if (mil) p.push(mil === 1 ? "mil" : ate999(mil) + " mil");
    let s = p.join(" ");
    if (r) s += (s ? (r <= 100 || r % 100 === 0 ? " e " : " ") : "") + ate999(r);
    return s;
  };
  const r = Math.floor(cent / 100), c = cent % 100;
  let s = r ? inteiro(r) + (r % 1e6 === 0 ? " de" : "") + (r === 1 ? " real" : " reais") : "";
  if (c) s += (s ? " e " : "") + inteiro(c) + (c === 1 ? " centavo" : " centavos");
  s = s || "zero real";
  return s[0].toUpperCase() + s.slice(1);
}

/* ---------- estado e armazenamento ---------- */
const S = { orcamentos: [], clientes: [], agenda: [], recibos: [], config: {}, precos: { over: {}, custom: [], reajuste: 0 }, ok: {}, db: null, erro: "", draft: ls.get("jds-rascunho"), f: {} };
const COLS = ["orcamentos", "clientes", "agenda", "recibos"];
const pronto = () => S.db && [...COLS, "config", "precos"].every(k => S.ok[k]);
const filas = {};
function gravar(path, data) {
  if (!S.db) { aviso("Sem acesso aos seus dados agora. Nada foi salvo."); return Promise.reject(new Error("sem db")); }
  const ref = S.db.doc(path), p = (filas[path] || Promise.resolve()).catch(() => {}).then(() => data === null ? ref.delete() : ref.set(data));
  filas[path] = p;
  return p.catch(e => {
    aviso(e && e.code === "quota_exceeded" ? "O armazenamento está cheio. Apague registros antigos." : "Não foi possível salvar. Tente de novo.");
    throw e;
  });
}
/* fora do Claude (GitHub Pages), os dados ficam no IndexedDB deste aparelho, com a mesma interface do banco do Claude */
const LOCAL = "local" in document.documentElement.dataset;
async function bancoLocal() {
  const req = r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const ab = indexedDB.open("jds-energy", 1);
  ab.onupgradeneeded = () => ab.result.createObjectStore("docs");
  const idb = await req(ab), st = {}, subs = [];
  idb.onversionchange = () => idb.close();
  const ler = async () => {
    const o = idb.transaction("docs").objectStore("docs"), [k, v] = await Promise.all([req(o.getAllKeys()), req(o.getAll())]);
    for (const p in st) delete st[p];
    k.forEach((p, i) => st[p] = v[i]);
  };
  await ler();
  const canal = window.BroadcastChannel ? new BroadcastChannel("jds-energy") : null;
  if (canal) canal.onmessage = async () => { await ler(); subs.forEach(f => f()); };
  const por = (path, data) => new Promise((ok, no) => {
    const t = idb.transaction("docs", "readwrite"), o = t.objectStore("docs");
    data === undefined ? o.delete(path) : o.put(data, path);
    t.oncomplete = () => { data === undefined ? delete st[path] : st[path] = data; subs.forEach(f => f()); canal?.postMessage(1); ok(); };
    t.onerror = t.onabort = () => no({ code: t.error?.name === "QuotaExceededError" ? "quota_exceeded" : "falhou" });
  });
  const copia = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const doc = p => ({ id: p.split("/").pop(), data: () => copia(st[p]), metadata: { fromCache: false } });
  const ouvir = (faz, f) => { const g = () => f(faz()); subs.push(g); setTimeout(g); };
  return {
    doc: p => ({ set: d => por(p, copia(d)), delete: () => por(p), onSnapshot: f => ouvir(() => doc(p), f) }),
    collection: c => ({ onSnapshot: f => ouvir(() => ({ docs: Object.keys(st).filter(p => p.startsWith(c + "/")).map(doc), metadata: { fromCache: false } }), f) })
  };
}
async function iniciar() {
  const db = LOCAL ? await bancoLocal().catch(() => null) : await window.claude.use("db").catch(() => null);
  if (!db) { S.erro = LOCAL ? "Este navegador bloqueou o armazenamento. Saia da janela anônima ou use outro navegador. A tabela e os cálculos funcionam mesmo assim." : "Seus dados não abriram. Entre na sua conta do Claude e recarregue. A tabela e os cálculos funcionam mesmo assim."; render(); return; }
  if (LOCAL) navigator.storage?.persist?.().catch(() => {});
  S.db = db;
  const t = setTimeout(() => { S.erro = "Os dados estão demorando para chegar. O que aparece aqui pode estar desatualizado."; render(); }, 10000);
  const chegou = (k, snap) => {
    if (snap.metadata && !snap.metadata.fromCache) S.ok[k] = true;
    if (pronto()) { clearTimeout(t); S.erro = ""; }
    atualizar();
  };
  const falhou = () => { clearTimeout(t); S.erro = "A conexão com seus dados caiu. Recarregue a página."; render(); };
  for (const c of COLS) db.collection(c).onSnapshot(s => { S[c] = s.docs.map(d => ({ ...d.data(), id: d.id })); chegou(c, s); }, falhou);
  db.doc("config/empresa").onSnapshot(s => { S.config = s.data() || {}; chegou("config", s); }, falhou);
  db.doc("config/precos").onSnapshot(s => { const d = s.data() || {}; S.precos = { over: d.over || {}, custom: d.custom || [], reajuste: d.reajuste || 0 }; chegou("precos", s); }, falhou);
}
/* não redesenha por cima de quem está digitando */
function atualizar() {
  const a = document.activeElement;
  if (rota() === "novo" && S.draft) return;
  if (a && $("#main").contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
  render(true);
}
const salvarRascunho = () => ls.set("jds-rascunho", S.draft);

/* ---------- preços ---------- */
function servicos() {
  const k = 1 + (S.precos.reajuste || 0) / 100, r2 = v => Math.round(v * k * 100) / 100;
  return [...BASE.map(b => {
    const o = S.precos.over[b.id];
    return o ? { ...b, ...o, meu: true } : { ...b, min: r2(b.min), med: r2(b.med), max: r2(b.max) };
  }), ...S.precos.custom.map(c => ({ un: "un", nota: "", ...c, cat: "meu", proprio: true }))];
}
const cats = () => [...CATS, ...(S.precos.custom.length ? [{ id: "meu", nome: "Meus serviços" }] : [])];
const regua = s => {
  const pos = s.max > s.min ? Math.max(0, Math.min(100, (s.med - s.min) / (s.max - s.min) * 100)) : 50;
  return `<div class="regua"><div class="tr"><i style="left:${pos}%"></i></div><div class="esc"><span>mín. ${reais(s.min)}</span><b>médio ${reais(s.med)}</b><span>máx. ${reais(s.max)}</span></div></div>`;
};

/* ---------- orçamento ---------- */
const STATUS = { rascunho: ["Rascunho", ""], enviado: ["Enviado", "info"], aprovado: ["Aprovado", "ok"], concluido: ["Concluído", "ok"], recusado: ["Recusado", "bad"] };
const chipSt = o => (o.exemplo ? '<span class="chip warn">Exemplo</span> ' : "") + `<span class="chip ${STATUS[o.status]?.[1] || ""}">${STATUS[o.status]?.[0] || "Rascunho"}</span>`;
function novoOrc() {
  const c = S.config;
  return { id: novoId(), numero: "", status: "rascunho", data: hoje(), cliente: { nome: "", tel: "", end: "" }, itens: [], desloc: 0, acresc: 0, desc: 0,
    materialCliente: true, validade: c.validade || 15, prazo: "", pagamento: c.pagamento || "50% na aprovação e 50% na conclusão", garantia: c.garantia || "90 dias sobre a mão de obra", obs: "" };
}
const itemDe = s => ({ k: novoId(), sid: s.id, tipo: "servico", nome: s.nome, un: s.un, qtd: 1, preco: s[S.config.faixa || "med"], min: s.min, med: s.med, max: s.max });
/* o acréscimo é diluído no preço unitário dos serviços, então o cliente não vê uma linha separada */
function unit(i, o) { return Math.round(i.preco * 100 * (i.tipo === "servico" ? 1 + (o.acresc || 0) / 100 : 1)); }
const linha = (i, o) => Math.round(unit(i, o) * (i.qtd || 0));
function totais(o) {
  let serv = 0, mat = 0;
  for (const i of o.itens) i.tipo === "servico" ? serv += linha(i, o) : mat += linha(i, o);
  const desloc = Math.round((o.desloc || 0) * 100), sub = serv + mat + desloc, desc = Math.round(sub * (o.desc || 0) / 100);
  return { serv, mat, desloc, sub, desc, total: Math.max(0, sub - desc) };
}
const reais_ = o => S.orcamentos.filter(x => !x.exemplo);
const recebido = id => S.recibos.filter(r => r.orcId === id).reduce((a, r) => a + r.valor, 0);
function proxNumero() {
  const ano = hoje().slice(0, 4), n = S.orcamentos.map(o => /^(\d{4})-(\d+)$/.exec(o.numero || "")).filter(m => m && m[1] === ano).map(m => +m[2]);
  return ano + "-" + String(Math.max(0, ...n) + 1).padStart(3, "0");
}
const proxRecibo = () => Math.max((S.config.reciboInicial || 1) - 1, ...S.recibos.map(r => +r.numero || 0)) + 1;

/* ---------- navegação ---------- */
const ic = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICO = {
  inicio: ic('<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/>'), orcamentos: ic('<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/>'),
  precos: ic('<path d="M3 12V4h8l10 10-8 8z"/><path d="M7.5 8.5h.01"/>'), agenda: ic('<path d="M4 6h16v15H4zM4 11h16M8 3v4M16 3v4"/>'),
  clientes: ic('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 4-7 8-7s7 2 8 7"/>'), recibos: ic('<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
  calculos: ic('<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>'), ajustes: ic('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'), mais: ic('<path d="M4 7h16M4 12h16M4 17h16"/>')
};
const NAV = [["inicio", "Início", ""], ["orcamentos", "Orçamentos", ""], ["precos", "Preços", ""], ["agenda", "Agenda", ""], ["clientes", "Clientes", "so-pc"], ["recibos", "Recibos", "so-pc"], ["calculos", "Cálculos", "so-pc"], ["ajustes", "Ajustes", "so-pc"], ["mais", "Mais", "so-cel"]];
const rota = () => location.hash.slice(1) || "inicio";
const ir = h => { if (rota() === h) render(); else location.hash = h; };
function render(manter) {
  const r = rota(), base = r === "novo" || r.startsWith("orc-") ? "orcamentos" : r, y = scrollY;
  const pai = ["clientes", "recibos", "calculos", "ajustes"].includes(base);
  $("#nav").innerHTML = NAV.map(([id, n, c]) => `<a href="#${id}" class="${c}" ${base === id || (id === "mais" && pai) ? 'aria-current="page"' : ""}>${ICO[id]}<span>${n}</span></a>`).join("");
  const v = r.startsWith("orc-") ? () => vOrc(r.slice(4)) : (VIEWS[r] || vInicio);
  $("#main").innerHTML = (S.erro ? `<p class="aviso" role="alert">${esc(S.erro)}</p>` : "") + v();
  scrollTo(0, manter ? y : 0);
}
let tT;
function aviso(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(tT); tT = setTimeout(() => t.hidden = true, 3200); }

/* ---------- janelas ---------- */
let dlgOk = null;
function abrir(titulo, corpo, ok, rotOk = "Salvar", extra = "") {
  const d = $("#dlg");
  d.innerHTML = `<form method="dialog" id="dlgf"><div class="cb"><h2>${esc(titulo)}</h2><button type="button" class="x" data-a="fechar" aria-label="Fechar">×</button></div>${corpo}${ok ? `<div class="acoes"><button class="btn pri">${esc(rotOk)}</button>${extra}</div>` : ""}</form>`;
  dlgOk = ok;
  if (!d.open) d.showModal();
}
const fechar = () => { const d = $("#dlg"); if (d.open) d.close(); };
function confirmar(t, txt, rot, fn) { abrir(t, `<p>${esc(txt)}</p>`, async () => { fechar(); await fn(); }, rot, `<button type="button" class="btn" data-a="fechar">Cancelar</button>`); }
$("#dlg").addEventListener("submit", async e => {
  e.preventDefault();
  if (!dlgOk) return;
  const b = $("#dlgf .btn.pri"); if (b) b.disabled = true;
  try { await dlgOk(Object.fromEntries(new FormData(e.target))); } catch {} finally { if (b) b.disabled = false; }
});
const campo = (rot, nome, val = "", at = "") => `<label class="campo"><span>${rot}</span><input id="f-${nome}" name="${nome}" value="${esc(val)}" ${at}></label>`;
const area = (rot, nome, val = "") => `<label class="campo"><span>${rot}</span><textarea id="f-${nome}" name="${nome}">${esc(val)}</textarea></label>`;
const sel = (rot, nome, val, ops) => `<label class="campo"><span>${rot}</span><select id="f-${nome}" name="${nome}">${ops.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(val) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
const DEC = 'inputmode="decimal" autocomplete="off"';
const vazio = (t, b = "") => `<div class="lista"><div class="vazio"><p>${t}</p>${b}</div></div>`;

/* ---------- telas ---------- */
const linOrc = o => `<a class="lin" href="#orc-${esc(o.id)}"><div><b>${esc(o.cliente?.nome || "Sem cliente")}</b><small>${esc(o.numero || "")} · ${fData(o.data)} · ${o.itens?.length || 0} ${o.itens?.length === 1 ? "item" : "itens"}</small></div><div class="dir"><span class="val">${brl(totais(o).total)}</span><span>${chipSt(o)}</span></div></a>`;
const linAg = a => `<button class="lin" data-a="ag" data-id="${esc(a.id)}"><div><b style="${a.feito ? "text-decoration:line-through" : ""}">${esc(a.titulo)}</b><small>${[a.cliente, a.end].filter(Boolean).map(esc).join(" · ")}</small></div><div class="dir"><span class="val">${esc(a.hora || "")}</span><small>${fData(a.data).slice(0, 5)}</small></div></button>`;

S.backup = ls.get("jds-backup");
const lembrarBackup = () => LOCAL && pronto() && reais_().length + S.recibos.length > 0 && (!S.backup || S.backup <= maisDias(hoje(), -7));
function vInicio() {
  const os = reais_(), mes = hoje().slice(0, 7);
  const fechados = os.filter(o => o.status === "aprovado" || o.status === "concluido");
  const receber = fechados.reduce((a, o) => a + Math.max(0, totais(o).total - recebido(o.id)), 0);
  const recMes = S.recibos.filter(r => (r.data || "").startsWith(mes)).reduce((a, r) => a + r.valor, 0);
  const env = os.filter(o => o.status === "enviado");
  const cobrar = env.filter(o => o.data <= maisDias(hoje(), -3));
  const prox = S.agenda.filter(a => !a.feito && a.data >= hoje()).sort((a, b) => (a.data + (a.hora || "")).localeCompare(b.data + (b.hora || ""))).slice(0, 4);
  const rec = [...S.orcamentos].sort((a, b) => (b.data + b.id).localeCompare(a.data + a.id)).slice(0, 5);
  return `<div class="cab"><h1>Início</h1><div class="acoes"><a class="btn" href="#precos">Consultar preço</a><a class="btn pri pc" href="#novo">Novo orçamento</a></div></div>
  <div class="nums"><div><span>A receber</span><b>${brl(receber)}</b></div><div><span>Recebido no mês</span><b>${brl(recMes)}</b></div><div><span>Aguardando resposta</span><b>${env.length}</b></div></div>
  ${S.draft?.itens?.length ? `<div class="lista"><a class="lin" href="#novo"><div><b>Orçamento em edição</b><small>${esc(S.draft.cliente.nome || "Sem cliente")}, ainda não salvo</small></div><span class="val">${brl(totais(S.draft).total)}</span></a></div>` : ""}
  ${S.ok.config && !S.config.tel ? `<div class="lista"><a class="lin" href="#ajustes"><div><b>Complete os dados da empresa</b><small>CPF/CNPJ, telefone e Pix aparecem no orçamento e no recibo.</small></div><span class="chip info">Preencher</span></a></div>` : ""}
  ${lembrarBackup() ? `<div class="lista"><button class="lin" data-a="backup"><div><b>Faça um backup</b><small>Os dados ficam só neste aparelho. ${S.backup ? "Último em " + fData(S.backup) : "Nenhum backup feito ainda"}.</small></div><span class="chip warn">Baixar</span></button></div>` : ""}
  ${cobrar.length ? `<section class="bloco"><h2>Sem resposta há 3 dias ou mais</h2><div class="lista">${cobrar.map(linOrc).join("")}</div></section>` : ""}
  <section class="bloco"><div class="cab"><h2>Próximos serviços</h2><button class="btn min" data-a="ag-novo">Agendar</button></div>${prox.length ? `<div class="lista">${prox.map(linAg).join("")}</div>` : '<p class="mut">Nada agendado.</p>'}</section>
  <section class="bloco"><div class="cab"><h2>Últimos orçamentos</h2><a class="btn min" href="#orcamentos">Ver todos</a></div>${rec.length ? `<div class="lista">${rec.map(linOrc).join("")}</div>` : `<p class="mut">${S.db && !S.ok.orcamentos ? "Carregando…" : "Seus orçamentos aparecem aqui. Comece por Novo orçamento."}</p>`}</section>`;
}
function vOrcamentos() {
  const f = S.f.st || "todos", q = sem(S.f.q || "");
  const l = S.orcamentos.filter(o => (f === "todos" || o.status === f) && (!q || sem(o.numero + " " + (o.cliente?.nome || "")).includes(q))).sort((a, b) => (b.data + b.id).localeCompare(a.data + a.id));
  return `<div class="cab"><h1>Orçamentos</h1><a class="btn pri" href="#novo">Novo orçamento</a></div>
  <div class="filtros">${[["todos", "Todos"], ...Object.entries(STATUS).map(([k, v]) => [k, v[0]])].map(([k, t]) => `<button data-a="f-st" data-v="${k}" aria-pressed="${f === k}">${t}</button>`).join("")}</div>
  <input id="q-orc" data-i="q-orc" type="search" placeholder="Buscar por cliente ou número" value="${esc(S.f.q || "")}" aria-label="Buscar orçamento">
  <div id="l-orc">${l.length ? `<div class="lista">${l.map(linOrc).join("")}</div>` : vazio(S.db && !S.ok.orcamentos ? "Carregando…" : "Nenhum orçamento aqui.")}</div>`;
}
function vNovo() {
  if (!S.draft) { S.draft = novoOrc(); }
  const d = S.draft;
  return `<div class="cab"><div><h1>${d.numero ? "Editar " + esc(d.numero) : "Novo orçamento"}</h1><p>O rascunho fica guardado neste aparelho até você salvar.</p></div><button class="btn min per" data-a="descartar">Descartar</button></div>
  <section class="bloco"><h2>Cliente</h2><div class="g2">
    ${campo("Nome", "cnome", d.cliente.nome, 'list="dl-cli" data-d="cliente.nome" autocomplete="off"')}${campo("WhatsApp", "ctel", d.cliente.tel, 'data-d="cliente.tel" inputmode="tel" placeholder="(00) 9 0000-0000"')}${campo("Endereço", "cend", d.cliente.end, 'data-d="cliente.end"')}</div>
    <datalist id="dl-cli">${S.clientes.map(c => `<option value="${esc(c.nome)}">`).join("")}</datalist></section>
  <section class="bloco"><div class="cab"><h2>Serviços e materiais</h2></div><div id="itens" style="display:grid;gap:14px">${hItens(d)}</div>
    <div class="acoes"><button class="btn pri" data-a="add-sv">Adicionar serviço</button><button class="btn" data-a="add-mat">Adicionar material</button><button class="btn" data-a="add-av">Serviço fora da tabela</button></div></section>
  <section class="bloco"><h2>Ajustes de valor</h2><div class="g3">
    ${campo("Deslocamento (R$)", "desloc", d.desloc ? numBR(d.desloc) : "", DEC + ' data-n="desloc" placeholder="0,00"')}${campo("Dificuldade ou urgência (%)", "acresc", d.acresc || "", DEC + ' data-n="acresc" placeholder="0"')}${campo("Desconto (%)", "desc", d.desc || "", DEC + ' data-n="desc" placeholder="0"')}</div>
    <p class="mut">O percentual de dificuldade entra no preço de cada serviço; o cliente não vê uma linha separada.</p></section>
  <section class="bloco"><h2>Condições</h2><div class="g2">${campo("Data", "data", d.data, 'type="date" data-d="data"')}${campo("Validade (dias)", "validade", d.validade, 'inputmode="numeric" data-n="validade"')}${campo("Prazo de execução", "prazo", d.prazo, 'data-d="prazo" placeholder="Ex.: 2 dias"')}${campo("Pagamento", "pag", d.pagamento, 'data-d="pagamento"')}${campo("Garantia", "gar", d.garantia, 'data-d="garantia"')}</div>
    <label class="check"><input id="f-matc" type="checkbox" data-c="materialCliente" ${d.materialCliente ? "checked" : ""}><span>Material por conta do cliente</span></label>${`<label class="campo"><span>Observações</span><textarea id="f-obs" data-d="obs">${esc(d.obs)}</textarea></label>`}</section>
  <section class="bloco"><h2>Resumo</h2><div class="tot" id="tot">${hTot(d)}</div></section>
  <div class="rodape"><div><small>Total</small><b id="totfix">${brl(totais(d).total)}</b></div><button class="btn pri" data-a="salvar-orc">Salvar orçamento</button></div>`;
}
function estadoPreco(i) {
  if (i.tipo !== "servico" || i.min == null) return "";
  if (i.preco < i.min) return '<span class="chip bad">abaixo do mínimo</span>';
  if (i.preco > i.max) return '<span class="chip warn">acima do máximo</span>';
  return '<span class="chip ok">dentro da faixa</span>';
}
function hItens(d) {
  if (!d.itens.length) return '<p class="mut">Nenhum item ainda. Adicione um serviço da tabela para começar.</p>';
  return d.itens.map(i => `<div class="item" data-k="${i.k}"><div class="cb"><div><b>${esc(i.nome)}</b> ${i.tipo === "material" ? '<span class="chip">Material</span>' : ""}</div><button class="x" data-a="rm" aria-label="Remover ${esc(i.nome)}">×</button></div>
    <div class="ctl"><label class="campo"><span>Qtd. (${esc(i.un)})</span><input id="q-${i.k}" data-q ${DEC} value="${numBR(i.qtd, 3)}"></label><label class="campo"><span>Preço (R$)</span><input id="p-${i.k}" data-p ${DEC} value="${i.preco.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })}"></label><span class="val" data-t>${brl(linha(i, d))}</span></div>
    ${i.min != null && i.max > i.min ? `<div class="regua"><input type="range" id="r-${i.k}" data-r aria-label="Preço dentro da faixa" min="${i.min}" max="${i.max}" step="1" value="${i.preco}"><div class="esc"><span>${reais(i.min)}</span><button class="btn min" data-a="pmed">usar médio, ${reais(i.med)}</button><span>${reais(i.max)}</span></div></div><div data-e>${estadoPreco(i)}</div>` : ""}</div>`).join("");
}
function hTot(d) {
  const t = totais(d), l = (r, v) => `<div><span>${r}</span><span>${v}</span></div>`;
  return l("Mão de obra", brl(t.serv)) + (t.mat ? l("Materiais", brl(t.mat)) : "") + (t.desloc ? l("Deslocamento", brl(t.desloc)) : "") + (t.desc ? l(`Desconto (${numBR(d.desc)}%)`, "− " + brl(t.desc)) : "") + `<div class="fim"><span>Total</span><span>${brl(t.total)}</span></div>`;
}
function refTot() { const d = S.draft; if ($("#tot")) { $("#tot").innerHTML = hTot(d); $("#totfix").textContent = brl(totais(d).total); for (const i of d.itens) { const e = $(`.item[data-k="${i.k}"] [data-t]`); if (e) e.textContent = brl(linha(i, d)); } } salvarRascunho(); }

const zap = t => { const n = String(t || "").replace(/\D/g, "").replace(/^0+/, ""); return n ? (n.length <= 11 ? "55" + n : n) : ""; };
function textoOrc(o) {
  const t = totais(o), c = S.config, L = [`*${c.nome || "JDS Energy"}*`, `Orçamento ${o.numero} · ${fData(o.data)}`, "", `Olá${o.cliente.nome ? ", " + o.cliente.nome : ""}! Segue o orçamento:`, ""];
  for (const i of o.itens) L.push(`• ${numBR(i.qtd, 3)}${i.un === "un" ? "x" : " " + i.un} ${i.nome}: ${brl(linha(i, o))}`);
  if (t.desloc) L.push(`• Deslocamento: ${brl(t.desloc)}`);
  if (t.desc) L.push(`Desconto: − ${brl(t.desc)}`);
  L.push("", `*Total: ${brl(t.total)}*`, "");
  if (o.materialCliente) L.push("Material por conta do cliente.");
  if (o.prazo) L.push("Prazo: " + o.prazo);
  if (o.pagamento) L.push("Pagamento: " + o.pagamento);
  if (c.pix) L.push("Pix: " + c.pix);
  if (o.garantia) L.push("Garantia: " + o.garantia);
  if (o.validade) L.push("Válido até " + fData(maisDias(o.data, o.validade)));
  if (o.obs) L.push("", o.obs);
  return L.join("\n");
}
function vOrc(id) {
  const o = S.orcamentos.find(x => x.id === id);
  if (!o) return `<div class="cab"><h1>Orçamento</h1></div>${vazio(S.db && !S.ok.orcamentos ? "Carregando…" : "Este orçamento não existe mais.", '<a class="btn" href="#orcamentos">Ver orçamentos</a>')}`;
  const t = totais(o), rec = recebido(o.id), rs = S.recibos.filter(r => r.orcId === id);
  return `<div class="cab"><div><h1>${esc(o.cliente.nome || "Sem cliente")}</h1><p>Orçamento ${esc(o.numero)} ${chipSt(o)}</p></div><button class="btn" data-a="editar" data-id="${esc(id)}">Editar</button></div>
  <section class="bloco"><h2>Enviar ao cliente</h2><div class="acoes"><button class="btn pri" data-a="pdf-orc" data-id="${esc(id)}">Baixar PDF</button>${podeEnviar ? `<button class="btn pri" data-a="pdf-orc" data-env data-id="${esc(id)}">Compartilhar PDF</button>` : ""}<a class="btn" target="_blank" rel="noopener" href="https://wa.me/${zap(o.cliente.tel)}?text=${encodeURIComponent(textoOrc(o))}">Abrir no WhatsApp</a><button class="btn" data-a="copiar" data-id="${esc(id)}">Copiar texto</button></div></section>
  <section class="bloco"><h2>Situação</h2><div class="filtros">${Object.entries(STATUS).map(([k, v]) => `<button data-a="st" data-id="${esc(id)}" data-v="${k}" aria-pressed="${o.status === k}">${v[0]}</button>`).join("")}</div>
    <div class="kv"><div><span>Total</span><b>${brl(t.total)}</b></div><div><span>Recebido</span><b>${brl(rec)}</b></div><div><span>Falta receber</span><b>${brl(Math.max(0, t.total - rec))}</b></div></div>
    <div class="acoes"><button class="btn" data-a="rec-orc" data-id="${esc(id)}">Registrar pagamento e recibo</button><button class="btn" data-a="ag-orc" data-id="${esc(id)}">Agendar serviço</button></div>
    ${rs.length ? `<div class="lista">${rs.map(linRec).join("")}</div>` : ""}</section>
  <section class="bloco"><h2>Itens</h2><div class="rolar"><table><thead><tr><th>Descrição</th><th class="n">Qtd.</th><th class="n">Unitário</th><th class="n">Total</th></tr></thead><tbody>${o.itens.map(i => `<tr><td>${esc(i.nome)}${i.tipo === "material" ? ' <span class="chip">Material</span>' : ""}</td><td class="n">${numBR(i.qtd, 3)} ${esc(i.un)}</td><td class="n">${brl(unit(i, o))}</td><td class="n">${brl(linha(i, o))}</td></tr>`).join("")}</tbody></table></div><div class="tot">${hTot(o)}</div></section>
  <section class="bloco"><h2>Condições</h2><div class="kv">${[["Telefone", o.cliente.tel], ["Endereço", o.cliente.end], ["Data", fData(o.data)], ["Válido até", o.validade ? fData(maisDias(o.data, o.validade)) : ""], ["Prazo", o.prazo], ["Pagamento", o.pagamento], ["Garantia", o.garantia], ["Material", o.materialCliente ? "Por conta do cliente" : "Incluso conforme itens"], ["Observações", o.obs]].filter(x => x[1]).map(([a, b]) => `<div><span>${a}</span><b>${esc(b)}</b></div>`).join("")}</div></section>
  <div class="acoes"><button class="btn" data-a="duplicar" data-id="${esc(id)}">Duplicar</button><button class="btn per" data-a="del-orc" data-id="${esc(id)}">Excluir orçamento</button></div>`;
}

const listaPrecos = () => {
  const q = sem(S.f.qp || "").split(/\s+/).filter(Boolean), c = S.f.cat || "todas";
  const l = servicos().filter(s => (c === "todas" || s.cat === c) && q.every(w => sem(s.nome).includes(w)));
  if (!l.length) return vazio("Nenhum serviço com esse nome. Você pode cadastrar um serviço próprio.");
  return cats().map(k => { const x = l.filter(s => s.cat === k.id); return x.length ? `<div class="lista"><div class="cat">${esc(k.nome)}</div>${x.map(s => `<div class="sv"><div class="cb"><div><b>${esc(s.nome)}</b>${s.meu ? ' <span class="chip info">meu preço</span>' : ""}</div><div class="acoes"><button class="btn min" data-a="ed-sv" data-id="${esc(s.id)}">Ajustar</button><button class="btn min" data-a="orcar" data-id="${esc(s.id)}">Orçar</button></div></div>${regua(s)}${s.nota ? `<p class="mut">${esc(s.nota)}</p>` : ""}</div>`).join("")}</div>` : ""; }).join("");
};
function vPrecos() {
  const c = S.f.cat || "todas";
  return `<div class="cab"><div><h1>Preços</h1><p>${BASE.length} serviços da tabela 2026, só mão de obra${S.precos.reajuste ? `, com reajuste de ${numBR(S.precos.reajuste)}%` : ""}.</p></div><div class="acoes"><button class="btn" data-a="reaj">Reajustar tabela</button><button class="btn" data-a="novo-sv">Novo serviço</button></div></div>
  <input id="q-pre" data-i="q-pre" type="search" placeholder="Buscar serviço, ex.: tomada" value="${esc(S.f.qp || "")}" aria-label="Buscar serviço">
  <div class="filtros">${[{ id: "todas", nome: "Todas" }, ...cats()].map(k => `<button data-a="f-cat" data-v="${k.id}" aria-pressed="${c === k.id}">${esc(k.nome)}</button>`).join("")}</div>
  <div id="l-pre" style="display:grid;gap:16px">${listaPrecos()}</div>`;
}
function vAgenda() {
  const h = hoje(), am = maisDias(h, 1), l = [...S.agenda].sort((a, b) => (a.data + (a.hora || "")).localeCompare(b.data + (b.hora || "")));
  const g = [["Atrasados", l.filter(a => a.data < h && !a.feito)], ["Hoje", l.filter(a => a.data === h)], ["Amanhã", l.filter(a => a.data === am)], ["Próximos dias", l.filter(a => a.data > am)], ["Concluídos", l.filter(a => a.data < h && a.feito).reverse().slice(0, 30)]].filter(x => x[1].length);
  return `<div class="cab"><h1>Agenda</h1><button class="btn pri" data-a="ag-novo">Agendar serviço</button></div>` + (g.length ? g.map(([t, x]) => `<section style="display:grid;gap:8px"><h2>${t}</h2><div class="lista">${x.map(linAg).join("")}</div></section>`).join("") : vazio(S.db && !S.ok.agenda ? "Carregando…" : "Nenhum serviço agendado."));
}
function vClientes() {
  const l = [...S.clientes].sort((a, b) => a.nome.localeCompare(b.nome));
  return `<div class="cab"><h1>Clientes</h1><button class="btn pri" data-a="cli-novo">Novo cliente</button></div>` + (l.length ? `<div class="lista">${l.map(c => { const os = reais_().filter(o => sem(o.cliente?.nome || "") === sem(c.nome)); return `<button class="lin" data-a="cli" data-id="${esc(c.id)}"><div><b>${esc(c.nome)}</b><small>${[c.tel, c.end].filter(Boolean).map(esc).join(" · ")}</small></div><div class="dir"><small>${os.length} ${os.length === 1 ? "orçamento" : "orçamentos"}</small></div></button>`; }).join("")}</div>` : vazio("Clientes entram aqui quando você salva um orçamento."));
}
const linRec = r => `<button class="lin" data-a="rec" data-id="${esc(r.id)}"><div><b>${esc(r.cliente)}</b><small>Recibo nº ${esc(r.numero)} · ${fData(r.data)} · ${esc(r.forma)}</small></div><span class="val">${brl(r.valor)}</span></button>`;
function vRecibos() {
  const l = [...S.recibos].sort((a, b) => (b.numero || 0) - (a.numero || 0));
  return `<div class="cab"><h1>Recibos</h1><button class="btn pri" data-a="rec-novo">Novo recibo</button></div>` + (l.length ? `<div class="lista">${l.map(linRec).join("")}</div>` : vazio("Nenhum recibo emitido."));
}
function vMais() {
  return `<h1>Mais</h1><div class="lista">${[["clientes", "Clientes", "Contatos e histórico"], ["recibos", "Recibos", "Pagamentos recebidos"], ["calculos", "Cálculos", "Cabo, disjuntor e lei de Ohm"], ["ajustes", "Ajustes", "Empresa, Pix, assinatura e backup"]].map(([a, b, c]) => `<a class="lin" href="#${a}"><div><b>${b}</b><small>${c}</small></div><span aria-hidden="true">›</span></a>`).join("")}</div>`;
}
function vAjustes() {
  const c = S.config, off = S.db && S.ok.config ? "" : "disabled";
  return `<div class="cab"><h1>Ajustes</h1></div>
  <form class="bloco" id="fcfg"><h2>Empresa</h2><div class="g2">${campo("Nome", "nome", c.nome ?? "JDS Energy")}${campo("CPF ou CNPJ", "doc", c.doc)}${campo("Telefone", "tel", c.tel, 'inputmode="tel"')}${campo("E-mail", "email", c.email, 'type="email"')}${campo("Cidade", "cidade", c.cidade, 'placeholder="Cidade - UF"')}${campo("Chave Pix", "pix", c.pix)}</div>
  <h2>Padrões do orçamento</h2><div class="g2">${sel("Preço sugerido", "faixa", c.faixa || "med", [["min", "Mínimo da tabela"], ["med", "Médio da tabela"], ["max", "Máximo da tabela"]])}${campo("Validade (dias)", "validade", c.validade || 15, 'inputmode="numeric"')}${campo("Pagamento", "pagamento", c.pagamento ?? "50% na aprovação e 50% na conclusão")}${campo("Garantia", "garantia", c.garantia ?? "90 dias sobre a mão de obra")}${campo("Primeiro número de recibo", "reciboInicial", c.reciboInicial || 1, 'inputmode="numeric"')}</div>
  <div class="acoes"><button class="btn pri" ${off}>Salvar ajustes</button></div></form>
  <section class="bloco"><h2>Assinatura no recibo</h2>${c.assinatura ? `<div style="background:#fff;border-radius:8px;padding:10px;justify-self:start"><img src="${esc(c.assinatura)}" alt="Sua assinatura" style="max-height:80px;display:block"></div><div><button class="btn per" data-a="rm-ass">Remover assinatura</button></div>` : `<label class="campo"><span>Imagem PNG ou JPG</span><input type="file" id="f-ass" accept="image/png,image/jpeg" ${off}></label>`}</section>
  <section class="bloco"><h2>Backup</h2><p class="mut">${LOCAL ? "Os dados ficam só neste aparelho e não passam para outro sozinhos. O backup guarda" : "Guarda"} clientes, orçamentos, agenda, recibos, preços e ajustes em um arquivo. Ele contém dados dos clientes: não publique.</p><div class="acoes"><button class="btn" data-a="backup">Baixar backup</button></div><label class="campo"><span>Restaurar de um arquivo de backup</span><input type="file" id="f-rest" accept=".json,application/json" ${off}></label></section>
  <p class="mut">Base: tabela de preços médios de serviços elétricos 2026 (Engehall). Valores de mão de obra, sem material, para orientação. Ajuste à sua região.</p>`;
}

/* ---------- cálculos ---------- */
/* NBR 5410, tabela 36: cobre, PVC 70 °C, método B1, 30 °C; [seção, 2 condutores carregados, 3 condutores carregados] */
const CABOS = [[1.5, 17.5, 15.5], [2.5, 24, 21], [4, 32, 28], [6, 41, 36], [10, 57, 50], [16, 76, 68], [25, 101, 89], [35, 125, 110], [50, 151, 134], [70, 192, 171], [95, 232, 207], [120, 269, 239]];
const DISJ = [6, 10, 16, 20, 25, 32, 40, 50, 63, 70, 80, 100, 125, 150, 175, 200, 225];
function dimensionar({ P, V, fp, tri, L, agr, temp, uso, lim }) {
  const I = P / ((tri ? Math.sqrt(3) : 1) * V * fp);
  for (const [s, i2, i3] of CABOS) {
    if (s < (uso === "ilu" ? 1.5 : 2.5)) continue;
    const Iz = (tri ? i3 : i2) * agr * temp, In = DISJ.find(d => d >= I - 1e-9 && d <= Iz + 1e-9);
    const dV = (tri ? Math.sqrt(3) : 2) * 0.0225 * L * I / s, q = dV / V * 100;
    if (In && q <= lim) return { I, s, Iz, In, dV, q };
  }
  return { I, s: 0 };
}
function hDim() {
  const c = S.f.dim, [V, tri] = c.sis.split("-"), r = dimensionar({ P: num(c.P), V: +V, tri: tri === "3", fp: num(c.fp) || 1, L: num(c.L), agr: +c.agr, temp: +c.temp, uso: c.uso, lim: num(c.lim) || 4 });
  if (!(num(c.P) > 0)) return '<p class="mut">Informe a potência.</p>';
  if (!r.s) return `<p class="aviso">Corrente de ${numBR(r.I, 1)} A. Nenhum cabo até 120 mm² atende com esses dados; divida a carga ou faça um projeto específico.</p>`;
  return `<div class="res"><div class="g"><span>Cabo</span><b>${numBR(r.s)} mm²</b></div><div class="g"><span>Disjuntor</span><b>${r.In} A</b></div><div><span>Corrente</span><b>${numBR(r.I, 1)} A</b></div><div><span>Capacidade do cabo</span><b>${numBR(r.Iz, 1)} A</b></div><div><span>Queda de tensão</span><b>${numBR(r.q, 2)}%</b></div></div>`;
}
function hOhm() {
  const c = S.f.ohm, v = { V: num(c.V), I: num(c.I), R: num(c.R), P: num(c.P) }, k = Object.keys(v).filter(x => v[x] > 0);
  if (k.length !== 2) return '<p class="mut">Preencha exatamente dois campos.</p>';
  let { V, I, R, P } = v;
  if (V && I) { R = V / I; P = V * I; } else if (V && R) { I = V / R; P = V * I; } else if (V && P) { I = P / V; R = V / I; } else if (I && R) { V = I * R; P = V * I; } else if (I && P) { V = P / I; R = V / I; } else { I = Math.sqrt(P / R); V = I * R; }
  return `<div class="res"><div><span>Tensão</span><b>${numBR(V)} V</b></div><div><span>Corrente</span><b>${numBR(I)} A</b></div><div><span>Resistência</span><b>${numBR(R)} Ω</b></div><div><span>Potência</span><b>${numBR(P)} W</b></div></div>`;
}
function vCalculos() {
  const c = S.f.dim ||= { P: "5500", sis: "220-1", fp: "1", L: "15", agr: "1", temp: "1", uso: "for", lim: "4" }, o = S.f.ohm ||= { V: "220", I: "", R: "", P: "5500" };
  const at = (g, k, v) => `${DEC} data-calc="${g}.${k}"`;
  const s = (rot, k, ops) => sel(rot, "dim" + k, c[k], ops).replace("<select ", `<select data-calc="dim.${k}" `);
  return `<h1>Cálculos</h1><section class="bloco"><h2>Dimensionar circuito</h2><div class="g3">${campo("Potência (W)", "dP", c.P, at("dim", "P"))}${s("Tensão", "sis", [["127-1", "127 V, fase e neutro"], ["220-1", "220 V, fase e neutro ou bifásico"], ["220-3", "220 V trifásico"], ["380-3", "380 V trifásico"]])}${campo("Distância (m)", "dL", c.L, at("dim", "L"))}${campo("Fator de potência", "dfp", c.fp, at("dim", "fp"))}${s("Uso", "uso", [["for", "Tomada ou força"], ["ilu", "Iluminação"]])}${s("Circuitos no eletroduto", "agr", [["1", "1"], ["0.8", "2"], ["0.7", "3"], ["0.65", "4"], ["0.6", "5"], ["0.57", "6"]])}${s("Temperatura", "temp", [["1", "30 °C"], ["0.94", "35 °C"], ["0.87", "40 °C"]])}${campo("Queda máxima (%)", "dlim", c.lim, at("dim", "lim"))}</div><div id="o-dim">${hDim()}</div>
  <p class="mut">Cabo de cobre com PVC 70 °C, eletroduto embutido (método B1 da NBR 5410). Não verifica curto-circuito, seletividade nem DR. Confira com a norma antes de executar.</p></section>
  <section class="bloco"><h2>Lei de Ohm</h2><div class="g3">${campo("Tensão (V)", "oV", o.V, at("ohm", "V"))}${campo("Corrente (A)", "oI", o.I, at("ohm", "I"))}${campo("Resistência (Ω)", "oR", o.R, at("ohm", "R"))}${campo("Potência (W)", "oP", o.P, at("ohm", "P"))}</div><div id="o-ohm">${hOhm()}</div></section>`;
}
const VIEWS = { inicio: vInicio, orcamentos: vOrcamentos, novo: vNovo, precos: vPrecos, agenda: vAgenda, clientes: vClientes, recibos: vRecibos, mais: vMais, ajustes: vAjustes, calculos: vCalculos };

/* ---------- formulários em janela ---------- */
function dlgServicos() {
  const lista = () => { const q = sem($("#q-dlg")?.value || "").split(/\s+/).filter(Boolean); return servicos().filter(s => q.every(w => sem(s.nome).includes(w))).map(s => `<button type="button" class="lin" data-a="pick" data-id="${esc(s.id)}"><div><b>${esc(s.nome)}</b><small>${reais(s.min)} a ${reais(s.max)}</small></div><span class="val">${reais(s[S.config.faixa || "med"])}</span></button>`).join("") || '<div class="vazio">Nada encontrado.</div>'; };
  abrir("Adicionar serviço", `<input id="q-dlg" type="search" placeholder="Buscar, ex.: chuveiro" aria-label="Buscar serviço"><div class="lista" id="l-dlg">${lista()}</div><div class="acoes"><button type="button" class="btn pri" data-a="fechar">Concluir</button></div>`, null);
  $("#q-dlg").oninput = () => { $("#l-dlg").innerHTML = lista(); };
}
function dlgItem(tipo) {
  const m = tipo === "material";
  abrir(m ? "Adicionar material" : "Serviço fora da tabela", campo("Descrição", "nome", "", "required") + `<div class="g3">${campo("Quantidade", "qtd", "1", DEC)}${campo("Unidade", "un", "un")}${campo("Preço unitário (R$)", "preco", "", DEC + " required")}</div>`, f => {
    S.draft.itens.push({ k: novoId(), tipo: m ? "material" : "servico", nome: f.nome.trim(), un: f.un.trim() || "un", qtd: num(f.qtd) || 1, preco: num(f.preco) });
    if (m) S.draft.materialCliente = false;
    salvarRascunho(); fechar(); render(true);
  }, "Adicionar");
}
function dlgAgenda(a) {
  const novo = !a.id;
  abrir(novo ? "Agendar serviço" : "Compromisso", campo("Serviço", "titulo", a.titulo, "required") + `<div class="g3">${campo("Data", "data", a.data || hoje(), 'type="date" required')}${campo("Hora", "hora", a.hora, 'type="time"')}</div>` + campo("Cliente", "cliente", a.cliente) + campo("Endereço", "end", a.end) + area("Anotações", "nota", a.nota) + `<label class="check"><input type="checkbox" name="feito" ${a.feito ? "checked" : ""}><span>Concluído</span></label>`, async f => {
    const id = a.id || novoId();
    await gravar("agenda/" + id, { ...limpo(a), titulo: f.titulo, data: f.data, hora: f.hora, cliente: f.cliente, end: f.end, nota: f.nota, feito: !!f.feito });
    fechar(); aviso(novo ? "Serviço agendado" : "Compromisso salvo");
  }, "Salvar", novo ? "" : `<button type="button" class="btn per" data-a="del" data-c="agenda" data-id="${esc(a.id)}">Excluir</button>`);
}
const limpo = o => { const x = JSON.parse(JSON.stringify(o)); delete x.id; return x; };
function dlgCliente(c) {
  abrir(c.id ? "Cliente" : "Novo cliente", campo("Nome", "nome", c.nome, "required") + campo("WhatsApp", "tel", c.tel, 'inputmode="tel"') + campo("Endereço", "end", c.end) + area("Anotações", "nota", c.nota), async f => {
    await gravar("clientes/" + (c.id || novoId()), { nome: f.nome.trim(), tel: f.tel, end: f.end, nota: f.nota });
    fechar(); aviso("Cliente salvo");
  }, "Salvar", c.id ? `<button type="button" class="btn" data-a="orc-cli" data-id="${esc(c.id)}">Fazer orçamento</button><button type="button" class="btn per" data-a="del" data-c="clientes" data-id="${esc(c.id)}">Excluir</button>` : "");
}
function dlgRecibo(r) {
  const novo = !r.id;
  abrir(novo ? "Novo recibo" : "Recibo nº " + r.numero, `<div class="g3">${campo("Número", "numero", r.numero || proxRecibo(), 'inputmode="numeric" required')}${campo("Data", "data", r.data || hoje(), 'type="date" required')}${campo("Valor (R$)", "valor", r.valor ? (r.valor / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, useGrouping: false }) : "", DEC + " required")}</div>` +
    campo("Contratante", "cliente", r.cliente, "required") + campo("Endereço", "end", r.end) + area("Serviço prestado", "desc", r.desc ?? "Prestação de serviços elétricos, conforme combinado entre as partes.") +
    `<div class="g3">${campo("Executado de", "ini", r.ini || hoje(), 'type="date"')}${campo("até", "fim", r.fim || hoje(), 'type="date"')}${sel("Forma", "forma", r.forma || "PIX", [["Dinheiro", "Dinheiro"], ["PIX", "PIX"], ["Cartão", "Cartão"]])}</div>`, async f => {
    const v = Math.round(num(f.valor) * 100);
    if (v <= 0) { aviso("Informe o valor do recibo."); return; }
    await gravar("recibos/" + (r.id || novoId()), { ...limpo(r), numero: Math.round(num(f.numero)), data: f.data, valor: v, cliente: f.cliente.trim(), end: f.end, desc: f.desc, ini: f.ini, fim: f.fim, forma: f.forma });
    fechar(); aviso("Recibo salvo");
  }, "Salvar", novo ? "" : `<button type="button" class="btn" data-a="pdf-rec" data-id="${esc(r.id)}">Baixar PDF</button>${podeEnviar ? `<button type="button" class="btn" data-a="pdf-rec" data-env data-id="${esc(r.id)}">Compartilhar PDF</button>` : ""}<button type="button" class="btn per" data-a="del" data-c="recibos" data-id="${esc(r.id)}">Excluir</button>`);
}
const gravarPrecos = p => { S.precos = p; return gravar("config/precos", p); };
function dlgPreco(s) {
  abrir(s ? s.nome : "Novo serviço", (s && !s.proprio ? "" : campo("Nome", "nome", s?.nome, "required") + campo("Unidade", "un", s?.un || "un")) + `<div class="g3">${["min", "med", "max"].map((k, n) => campo(["Mínimo", "Médio", "Máximo"][n] + " (R$)", k, s ? numBR(s[k]) : "", DEC + " required")).join("")}</div>`, async f => {
    const v = { min: num(f.min), med: num(f.med), max: num(f.max) };
    if (!(v.min > 0 && v.min <= v.med && v.med <= v.max)) { aviso("O médio precisa ficar entre o mínimo e o máximo."); return; }
    const p = JSON.parse(JSON.stringify(S.precos));
    if (s && !s.proprio) p.over[s.id] = v;
    else if (s) p.custom = p.custom.map(c => c.id === s.id ? { id: s.id, nome: f.nome.trim(), un: f.un.trim() || "un", ...v } : c);
    else p.custom.push({ id: "meu" + novoId(), nome: f.nome.trim(), un: f.un.trim() || "un", ...v });
    await gravarPrecos(p); fechar(); render(true); aviso("Preço salvo");
  }, "Salvar", s?.meu ? `<button type="button" class="btn" data-a="rest" data-id="${esc(s.id)}">Voltar ao da tabela</button>` : s?.proprio ? `<button type="button" class="btn per" data-a="del-sv" data-id="${esc(s.id)}">Excluir</button>` : "");
}

/* ---------- PDF ---------- */
let LOGO; { const i = new Image(); i.onload = () => LOGO = i; i.src = "logo.png"; }
function novoPDF(titulo, sub) {
  const { jsPDF } = window.jspdf, p = new jsPDF({ unit: "mm", format: "a4" }), c = S.config;
  p.setFillColor(14, 29, 44); p.rect(0, 0, 210, 40, "F");
  if (LOGO) { try { p.addImage(LOGO, "PNG", 12, 4.5, 51, 31); } catch {} }
  p.setTextColor(255, 203, 13); p.setFont("helvetica", "bold"); p.setFontSize(16); p.text(titulo, 196, 17, { align: "right" });
  p.setTextColor(255); p.setFontSize(10); p.setFont("helvetica", "normal"); p.text(sub, 196, 24, { align: "right" });
  p.setFontSize(9); p.text([c.tel, c.email].filter(Boolean).join("  |  "), 196, 33, { align: "right" });
  p.setTextColor(14, 29, 44);
  return p;
}
const pdfTxt = s => String(s ?? "").replace(/[‐-―−]/g, "-").replace(/[^\x20-\xFF\n]/g, "");
function secao(p, y, t) { p.setFont("helvetica", "bold"); p.setFontSize(10.5); p.text(pdfTxt(t), 14, y); p.setDrawColor(255, 203, 13); p.setLineWidth(.7); p.line(14, y + 1.8, 196, y + 1.8); p.setFont("helvetica", "normal"); p.setFontSize(10); return y + 8; }
function campoPDF(p, y, rot, v) {
  if (!v) return y;
  p.setFont("helvetica", "bold"); p.text(rot + ":", 14, y); const w = p.getTextWidth(rot + ": ") + 1;
  p.setFont("helvetica", "normal"); const l = p.splitTextToSize(pdfTxt(v), 182 - w); p.text(l, 14 + w, y); return y + l.length * 5 + .6;
}
const quebra = (p, y, n = 30) => { if (y + n > 285) { p.addPage(); return 20; } return y; };
async function baixar(nome, data) {
  if (LOCAL) {
    const u = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: "application/json" })), a = document.createElement("a");
    a.href = u; a.download = nome; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60000); aviso("Arquivo pronto"); return true;
  }
  const d = await window.claude.use("downloads").catch(() => null);
  if (!d) { aviso("Baixar arquivo não está disponível aqui. Abra no navegador."); return; }
  try { await d.save({ filename: nome, data }); aviso("Arquivo pronto"); return true; }
  catch (e) { if (e.code !== "declined") aviso(e.code === "host_unavailable" ? "Este app não salva arquivos. Abra no navegador do celular." : "Não foi possível baixar. Tente de novo."); }
}
const nomeArq = s => sem(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function montarOrc(o) {
  const c = S.config, t = totais(o), p = novoPDF("ORÇAMENTO", `Nº ${o.numero}  |  ${fData(o.data)}`);
  let y = secao(p, 50, "Cliente");
  y = campoPDF(p, y, "Nome", o.cliente.nome); y = campoPDF(p, y, "Telefone", o.cliente.tel); y = campoPDF(p, y, "Endereço", o.cliente.end);
  y = secao(p, y + 5, "Serviços");
  const cab = () => { p.setFillColor(237, 241, 244); p.rect(14, y - 4.5, 182, 7, "F"); p.setFont("helvetica", "bold"); p.setFontSize(9); p.text("Descrição", 16, y); p.text("Qtd.", 132, y, { align: "right" }); p.text("Unitário", 163, y, { align: "right" }); p.text("Total", 194, y, { align: "right" }); p.setFont("helvetica", "normal"); p.setFontSize(10); y += 8; };
  cab();
  for (const i of o.itens) {
    const l = p.splitTextToSize(pdfTxt(i.nome), 98), h = l.length * 4.6 + 3;
    if (y + h > 280) { p.addPage(); y = 20; cab(); }
    p.text(l, 16, y); p.text(pdfTxt(numBR(i.qtd, 3) + " " + i.un), 132, y, { align: "right" }); p.text(brl(unit(i, o)), 163, y, { align: "right" }); p.text(brl(linha(i, o)), 194, y, { align: "right" });
    y += h; p.setDrawColor(213, 222, 230); p.setLineWidth(.2); p.line(14, y - 4.2, 196, y - 4.2);
  }
  y = quebra(p, y + 3, 34);
  const li = (r, v) => { p.text(r, 163, y, { align: "right" }); p.text(v, 194, y, { align: "right" }); y += 5.5; };
  if (t.desloc || t.desc || t.mat) { li("Mão de obra", brl(t.serv)); if (t.mat) li("Materiais", brl(t.mat)); if (t.desloc) li("Deslocamento", brl(t.desloc)); if (t.desc) li(`Desconto (${numBR(o.desc)}%)`, "- " + brl(t.desc)); }
  p.setFillColor(14, 29, 44); p.rect(110, y - 2, 86, 11, "F"); p.setTextColor(255, 203, 13); p.setFont("helvetica", "bold"); p.setFontSize(13); p.text("TOTAL", 114, y + 5.4); p.text(brl(t.total), 193, y + 5.4, { align: "right" });
  p.setTextColor(14, 29, 44);
  y = quebra(p, y + 20, 50); y = secao(p, y, "Condições");
  for (const [a, b] of [["Material", o.materialCliente ? "por conta do cliente" : t.mat ? "incluso conforme itens" : ""], ["Prazo", o.prazo], ["Pagamento", o.pagamento], ["Pix", c.pix], ["Garantia", o.garantia], ["Validade", o.validade ? "até " + fData(maisDias(o.data, o.validade)) : ""], ["Observações", o.obs]]) { y = quebra(p, y, 12); y = campoPDF(p, y, a, b); }
  y = quebra(p, y + 22, 14); p.setDrawColor(82, 99, 115); p.setLineWidth(.3); p.line(14, y, 94, y); p.line(116, y, 196, y); p.setFontSize(9);
  p.text(pdfTxt(c.nome || "JDS Energy"), 54, y + 5, { align: "center" }); p.text("Cliente, de acordo", 156, y + 5, { align: "center" });
  return p;
}
function montarRec(r) {
  const c = S.config, p = novoPDF("RECIBO", `Nº ${r.numero}  |  ${fData(r.data)}`);
  let y = secao(p, 50, "Prestador de serviços");
  y = campoPDF(p, y, "Nome / Razão Social", c.nome || "JDS Energy"); y = campoPDF(p, y, "CPF / CNPJ", c.doc); y = campoPDF(p, y, "Telefone", c.tel); y = campoPDF(p, y, "E-mail", c.email);
  y = secao(p, y + 5, "Contratante"); y = campoPDF(p, y, "Nome / Razão Social", r.cliente); y = campoPDF(p, y, "Endereço", r.end);
  y = secao(p, y + 5, "Descrição do serviço"); y = campoPDF(p, y, "Serviço prestado", r.desc); y = campoPDF(p, y, "Período de execução", r.ini ? `de ${fData(r.ini)} até ${fData(r.fim || r.ini)}` : "");
  y = secao(p, y + 5, "Pagamento"); y = campoPDF(p, y, "Valor", brl(r.valor)); y = campoPDF(p, y, "Valor por extenso", extenso(r.valor) + "."); y = campoPDF(p, y, "Forma de pagamento", ["Dinheiro", "PIX", "Cartão"].map(f => `(${r.forma === f ? "X" : "  "}) ${f}`).join("   "));
  y = quebra(p, y + 6, 70);
  const orc = por("orcamentos", r.orcId), parcial = orc && totais(orc).total > recebido(orc.id);
  p.text(p.splitTextToSize("Declaro que recebi o valor acima " + (parcial ? `como pagamento parcial do orçamento ${orc.numero}, dando quitação do valor recebido.` : "em pagamento pelos serviços descritos, dando plena quitação."), 182), 14, y);
  y += 10; p.text(pdfTxt([c.cidade, fData(r.data)].filter(Boolean).join(", ")), 14, y); y += 34;
  if (c.assinatura) { try { const q = p.getImageProperties(c.assinatura), k = Math.min(70 / q.width, 24 / q.height); p.addImage(c.assinatura, "PNG", 54 - q.width * k / 2, y - 1 - q.height * k, q.width * k, q.height * k); } catch {} }
  p.setDrawColor(82, 99, 115); p.setLineWidth(.3); p.line(14, y, 94, y); p.line(116, y, 196, y); p.setFontSize(9); p.text("Assinatura do prestador", 54, y + 5, { align: "center" }); p.text("Assinatura do contratante", 156, y + 5, { align: "center" });
  return p;
}
const podeEnviar = (() => { try { return LOCAL && !!navigator.canShare?.({ files: [new File(["x"], "x.pdf", { type: "application/pdf" })] }); } catch { return false; } })();
async function enviarPDF(b, nome) {
  try { await navigator.share({ files: [new File([b], nome, { type: "application/pdf" })] }); }
  catch (e) { if (e.name !== "AbortError") aviso("Não foi possível compartilhar. Use Baixar PDF."); }
}
function pdf(monta, nome, enviar) {
  if (!window.jspdf) { aviso("O gerador de PDF não carregou. Verifique a internet e recarregue."); return; }
  let b; try { b = monta().output("blob"); } catch (e) { console.error(e); aviso("Não foi possível montar o PDF."); return; }
  return enviar ? enviarPDF(b, nome) : baixar(nome, b);
}

/* ---------- ações ---------- */
const por = (c, id) => S[c].find(x => x.id === id);
function comRascunho(fn) {
  if (S.draft && S.draft.itens.length) abrir("Há um orçamento em edição", `<p>${esc(S.draft.cliente.nome || "Sem cliente")}, ${brl(totais(S.draft).total)}. Se continuar, ele será descartado.</p>`, () => { fechar(); fn(); }, "Descartar e continuar", '<a class="btn" href="#novo" data-a="fechar">Voltar ao que estava</a>');
  else fn();
}
const A = {
  fechar: () => fechar(),
  "f-st": e => { S.f.st = e.dataset.v; render(true); }, "f-cat": e => { S.f.cat = e.dataset.v; render(true); },
  "add-sv": dlgServicos, "add-mat": () => dlgItem("material"), "add-av": () => dlgItem("servico"),
  pick: e => { const s = servicos().find(x => x.id === e.dataset.id), ja = S.draft.itens.find(i => i.sid === s.id); if (ja) ja.qtd += 1; else S.draft.itens.push(itemDe(s)); $("#itens").innerHTML = hItens(S.draft); refTot(); aviso(ja ? `Quantidade: ${numBR(ja.qtd, 3)}` : "Serviço adicionado"); },
  rm: e => { const k = e.closest(".item").dataset.k; S.draft.itens = S.draft.itens.filter(i => i.k !== k); $("#itens").innerHTML = hItens(S.draft); refTot(); },
  pmed: e => { const el = e.closest(".item"), i = S.draft.itens.find(x => x.k === el.dataset.k); i.preco = i.med; $("#itens").innerHTML = hItens(S.draft); refTot(); },
  descartar: () => confirmar("Descartar edição?", S.draft.numero ? "As mudanças não salvas serão perdidas. O orçamento salvo continua como está." : "Este orçamento ainda não foi salvo.", "Descartar", () => { S.draft = null; salvarRascunho(); ir("orcamentos"); }),
  "salvar-orc": async e => {
    const d = S.draft;
    if (!d.cliente.nome.trim()) { aviso("Informe o nome do cliente."); $("#f-cnome").focus(); return; }
    if (!d.itens.length) { aviso("Adicione pelo menos um item."); return; }
    if (!pronto()) { aviso("Os dados ainda não carregaram. O rascunho está guardado."); return; }
    e.disabled = true;
    try {
      if (!d.numero) d.numero = proxNumero();
      d.cliente.nome = d.cliente.nome.trim();
      await gravar("orcamentos/" + d.id, limpo(d));
      if (!d.exemplo) { const c = S.clientes.find(x => sem(x.nome) === sem(d.cliente.nome)), n = { nome: d.cliente.nome, tel: d.cliente.tel || c?.tel || "", end: d.cliente.end || c?.end || "", nota: c?.nota || "" }; if (!c || c.tel !== n.tel || c.end !== n.end) await gravar("clientes/" + (c?.id || novoId()), n).catch(() => {}); }
      S.draft = null; salvarRascunho(); aviso("Orçamento " + d.numero + " salvo"); ir("orc-" + d.id);
    } catch { e.disabled = false; }
  },
  editar: e => comRascunho(() => { S.draft = JSON.parse(JSON.stringify(por("orcamentos", e.dataset.id))); salvarRascunho(); ir("novo"); }),
  duplicar: e => comRascunho(() => { S.draft = { ...JSON.parse(JSON.stringify(por("orcamentos", e.dataset.id))), id: novoId(), numero: "", status: "rascunho", data: hoje() }; delete S.draft.exemplo; salvarRascunho(); ir("novo"); }),
  "orc-cli": e => { const c = por("clientes", e.dataset.id); fechar(); comRascunho(() => { S.draft = novoOrc(); S.draft.cliente = { nome: c.nome, tel: c.tel || "", end: c.end || "" }; salvarRascunho(); ir("novo"); }); },
  orcar: e => { const s = servicos().find(x => x.id === e.dataset.id); S.draft ||= novoOrc(); const ja = S.draft.itens.find(i => i.sid === s.id); if (ja) ja.qtd += 1; else S.draft.itens.push(itemDe(s)); salvarRascunho(); aviso(`No orçamento em edição: ${S.draft.itens.length} ${S.draft.itens.length === 1 ? "item" : "itens"}`); },
  st: async e => { const o = por("orcamentos", e.dataset.id); await gravar("orcamentos/" + o.id, { ...limpo(o), status: e.dataset.v }); aviso("Situação: " + STATUS[e.dataset.v][0]); },
  "pdf-orc": e => { const o = por("orcamentos", e.dataset.id); return pdf(() => montarOrc(o), `orcamento-${nomeArq(o.numero)}-${nomeArq(o.cliente.nome)}.pdf`, "env" in e.dataset); },
  "pdf-rec": e => { const r = por("recibos", e.dataset.id); return pdf(() => montarRec(r), `recibo-${r.numero}-${nomeArq(r.cliente)}.pdf`, "env" in e.dataset); },
  copiar: async e => { const t = textoOrc(por("orcamentos", e.dataset.id)); try { await navigator.clipboard.writeText(t); aviso("Texto copiado"); } catch { abrir("Copie o texto", `<textarea readonly rows="12" id="f-cop">${esc(t)}</textarea>`, null); $("#f-cop").select(); } },
  "del-orc": e => confirmar("Excluir orçamento?", "Os recibos ligados a ele continuam salvos.", "Excluir", async () => { await gravar("orcamentos/" + e.dataset.id, null); aviso("Orçamento excluído"); ir("orcamentos"); }),
  del: e => { const { c, id } = e.dataset; confirmar("Excluir?", "Não dá para desfazer.", "Excluir", async () => { await gravar(c + "/" + id, null); aviso("Excluído"); }); },
  "rec-orc": e => { const o = por("orcamentos", e.dataset.id); dlgRecibo({ orcId: o.id, cliente: o.cliente.nome, end: o.cliente.end, valor: Math.max(0, totais(o).total - recebido(o.id)), desc: "Prestação de serviços elétricos: " + o.itens.filter(i => i.tipo === "servico").map(i => numBR(i.qtd, 3) + (i.un === "un" ? "x " : " " + i.un + " ") + i.nome.replace(/^Instalação/, "instalação")).join("; ") + "." }); },
  "rec-novo": () => dlgRecibo({}), rec: e => dlgRecibo(por("recibos", e.dataset.id)),
  "ag-novo": () => dlgAgenda({}), ag: e => dlgAgenda(por("agenda", e.dataset.id)),
  "ag-orc": e => { const o = por("orcamentos", e.dataset.id); dlgAgenda({ titulo: "Serviço " + o.numero, cliente: o.cliente.nome, end: o.cliente.end, orcId: o.id }); },
  "cli-novo": () => dlgCliente({}), cli: e => dlgCliente(por("clientes", e.dataset.id)),
  "ed-sv": e => dlgPreco(servicos().find(s => s.id === e.dataset.id)), "novo-sv": () => dlgPreco(null),
  rest: async e => { const p = JSON.parse(JSON.stringify(S.precos)); delete p.over[e.dataset.id]; await gravarPrecos(p); fechar(); render(true); aviso("Voltou ao preço da tabela"); },
  "del-sv": async e => { const p = JSON.parse(JSON.stringify(S.precos)); p.custom = p.custom.filter(c => c.id !== e.dataset.id); await gravarPrecos(p); fechar(); render(true); aviso("Serviço excluído"); },
  reaj: () => abrir("Reajustar tabela", `<p class="mut">Aplica um percentual sobre todos os preços da tabela, para adequar à sua região. Use valor negativo para reduzir. Preços que você já ajustou não mudam.</p>` + campo("Reajuste (%)", "p", S.precos.reajuste || 0, DEC), async f => { const n = num(f.p); if (n <= -90 || n > 300) { aviso("Use um percentual entre -90 e 300."); return; } await gravarPrecos({ ...JSON.parse(JSON.stringify(S.precos)), reajuste: n }); fechar(); render(true); aviso("Tabela reajustada"); }, "Aplicar"),
  "rm-ass": async () => { const c = { ...S.config }; delete c.assinatura; await gravar("config/empresa", c); aviso("Assinatura removida"); },
  backup: async () => { const okb = await baixar(`backup-jds-${hoje()}.json`, JSON.stringify({ data: hoje(), orcamentos: S.orcamentos, clientes: S.clientes, agenda: S.agenda, recibos: S.recibos, config: S.config, precos: S.precos }, null, 1)); if (okb) { S.backup = hoje(); ls.set("jds-backup", S.backup); if (rota() === "inicio") render(true); } }
};
/* o arquivo pode ter sido editado: só entram registros com a forma esperada */
async function restaurar(arq) {
  let b; try { b = JSON.parse(await arq.text()); } catch {}
  if (!b || !COLS.every(c => Array.isArray(b[c]))) { aviso("Este arquivo não é um backup do app."); return; }
  const okId = x => x && typeof x === "object" && /^[\w-]{1,60}$/.test(x.id);
  const n = v => v == null ? v : Number(v) || 0;
  const orcs = b.orcamentos.filter(o => okId(o) && Array.isArray(o.itens)).map(o => ({ ...novoOrc(), ...o, cliente: { nome: "", tel: "", end: "", ...o.cliente }, desloc: n(o.desloc), acresc: n(o.acresc), desc: n(o.desc), itens: o.itens.map(i => ({ ...i, k: novoId(), qtd: n(i.qtd), preco: n(i.preco) || 0, ...(i.min == null ? {} : { min: n(i.min), med: n(i.med), max: n(i.max) }) })) }));
  const cli = b.clientes.filter(c => okId(c) && typeof c.nome === "string"), ag = b.agenda.filter(a => okId(a) && typeof a.data === "string"), rec = b.recibos.filter(r => okId(r) && typeof r.data === "string").map(r => ({ ...r, valor: n(r.valor) || 0 }));
  const faixa = o => ({ min: n(o?.min) || 0, med: n(o?.med) || 0, max: n(o?.max) || 0 }), p = b.precos || {};
  const precos = { reajuste: n(p.reajuste) || 0, over: Object.fromEntries(Object.entries(p.over || {}).filter(([k]) => BASE.some(x => x.id === k)).map(([k, o]) => [k, faixa(o)])), custom: (Array.isArray(p.custom) ? p.custom : []).filter(okId).map(c => ({ id: c.id, nome: String(c.nome), un: String(c.un || "un"), ...faixa(c) })) };
  confirmar("Restaurar backup?", `${orcs.length} orçamentos, ${cli.length} clientes, ${ag.length} compromissos e ${rec.length} recibos. Registros iguais, preços e ajustes serão substituídos pelos do arquivo; o resto continua.`, "Restaurar", async () => {
    for (const [c, l] of [["orcamentos", orcs], ["clientes", cli], ["agenda", ag], ["recibos", rec]]) for (const x of l) await gravar(c + "/" + x.id, limpo(x));
    if (b.config && typeof b.config === "object") await gravar("config/empresa", b.config);
    await gravarPrecos(precos); aviso("Backup restaurado"); ir("inicio");
  });
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-a]");
  if (b && A[b.dataset.a]) { if (b.tagName === "BUTTON") e.preventDefault(); Promise.resolve(A[b.dataset.a](b)).catch(() => {}); }
});
document.addEventListener("input", e => {
  const t = e.target, d = S.draft;
  if (t.dataset.i === "q-orc") { S.f.q = t.value; const x = document.createElement("div"); x.innerHTML = vOrcamentos(); $("#l-orc").innerHTML = $("#l-orc", x).innerHTML; }
  else if (t.dataset.i === "q-pre") { S.f.qp = t.value; $("#l-pre").innerHTML = listaPrecos(); }
  else if (t.dataset.calc) { const [g, k] = t.dataset.calc.split("."); S.f[g][k] = t.value; $("#o-" + g).innerHTML = g === "dim" ? hDim() : hOhm(); }
  else if (d && t.dataset.d) {
    const [a, b] = t.dataset.d.split("."); if (b) d[a][b] = t.value; else d[a] = t.value;
    if (t.dataset.d === "cliente.nome") { const c = S.clientes.find(x => x.nome === t.value); if (c) { d.cliente.tel = c.tel || ""; d.cliente.end = c.end || ""; $("#f-ctel").value = d.cliente.tel; $("#f-cend").value = d.cliente.end; } }
    salvarRascunho();
  }
  else if (d && t.dataset.n) { d[t.dataset.n] = Math.max(0, num(t.value)); if (t.dataset.n === "desc") d.desc = Math.min(100, d.desc); refTot(); }
  else if (d && t.dataset.c && t.type === "checkbox") { d[t.dataset.c] = t.checked; salvarRascunho(); }
  else if (d && t.closest(".item")) {
    const el = t.closest(".item"), i = d.itens.find(x => x.k === el.dataset.k);
    if ("q" in t.dataset) i.qtd = Math.max(0, num(t.value));
    if ("p" in t.dataset) { i.preco = Math.max(0, num(t.value)); const r = $("[data-r]", el); if (r) r.value = i.preco; }
    if ("r" in t.dataset) { i.preco = +t.value; $("[data-p]", el).value = i.preco.toFixed(2).replace(".", ","); }
    const s = $("[data-e]", el); if (s) s.innerHTML = estadoPreco(i);
    refTot();
  }
});
document.addEventListener("submit", async e => {
  if (e.target.id !== "fcfg") return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  f.validade = Math.max(1, Math.round(num(f.validade)) || 15); f.reciboInicial = Math.max(1, Math.round(num(f.reciboInicial)) || 1);
  try { await gravar("config/empresa", { ...S.config, ...f }); aviso("Ajustes salvos"); } catch {}
});
document.addEventListener("change", e => {
  if (e.target.id === "f-rest" && e.target.files[0]) { restaurar(e.target.files[0]); e.target.value = ""; return; }
  if (e.target.id !== "f-ass" || !e.target.files[0]) return;
  const i = new Image(), u = URL.createObjectURL(e.target.files[0]);
  i.onload = async () => { const k = Math.min(1, 500 / i.width, 240 / i.height), c = document.createElement("canvas"); c.width = Math.round(i.width * k); c.height = Math.round(i.height * k); c.getContext("2d").drawImage(i, 0, 0, c.width, c.height); URL.revokeObjectURL(u); try { await gravar("config/empresa", { ...S.config, assinatura: c.toDataURL("image/png") }); document.activeElement?.blur(); aviso("Assinatura salva"); render(true); } catch {} };
  i.onerror = () => aviso("Não foi possível ler a imagem. Use PNG ou JPG.");
  i.src = u;
});
if (LOCAL && "serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
addEventListener("hashchange", () => { fechar(); render(); });
render();
iniciar();
