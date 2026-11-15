// Cofre - telas e comportamento.
import * as L from './lib.js';
import * as V from './visuais.js';
import { Repositorio, REPO_PADRAO, guardarChave, abrirChave, temChaveGuardada, esquecerChave, tituloDoVideo } from './net.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');

let repo = null;          // conexão com o GitHub (só depois de destrancar)
let notas = [];           // anotações já lidas
let arvore = [];          // [{path, sha}]
let textos = {};          // sha -> texto
let ultimaAtualizacao = null;
let escopoMapa = '7';     // mapa da Semana: últimos 7 dias ou tudo
let filtro = { termo: '', tipo: '', tag: '', arquivadas: false };

// ---------- guardados neste aparelho (só para acelerar; a verdade está no GitHub) ----------
function lerLocal() {
  try {
    arvore = JSON.parse(localStorage.getItem('cofre.arvore') || '[]');
    textos = JSON.parse(localStorage.getItem('cofre.textos') || '{}');
  } catch { arvore = []; textos = {}; }
}
function gravarLocal() {
  try {
    const vivos = new Set(arvore.map((a) => a.sha));
    for (const k of Object.keys(textos)) if (!vivos.has(k)) delete textos[k];
    localStorage.setItem('cofre.arvore', JSON.stringify(arvore));
    localStorage.setItem('cofre.textos', JSON.stringify(textos));
  } catch { /* se não couber, o app só recarrega mais devagar */ }
}
function reconstruir() {
  notas = arvore.filter((a) => textos[a.sha] !== undefined).map((a) => ({ ...L.lerNota(textos[a.sha], a.path), sha: a.sha }));
}

function aviso(msg, ms = 2500) {
  const el = $('#aviso'); el.textContent = msg; el.hidden = false;
  clearTimeout(aviso.t); aviso.t = setTimeout(() => { el.hidden = true; }, ms);
}
function estado(msg) { $('#estado').textContent = msg || ''; }

// ---------- sincronização ----------
let sincronizando = false;
async function atualizar({ silencioso = false } = {}) {
  if (!repo || sincronizando) return;
  sincronizando = true;
  if (!silencioso) estado('Atualizando…');
  try {
    const nova = await repo.listar();
    const faltam = nova.filter((a) => textos[a.sha] === undefined);
    for (let i = 0; i < faltam.length; i += 6) {
      await Promise.all(faltam.slice(i, i + 6).map(async (a) => { textos[a.sha] = await repo.ler(a.sha); }));
    }
    const mudou = faltam.length > 0 || nova.length !== arvore.length || nova.some((a, i) => arvore[i]?.sha !== a.sha);
    arvore = nova; gravarLocal(); reconstruir();
    ultimaAtualizacao = new Date();
    estado('Atualizado ' + ultimaAtualizacao.toTimeString().slice(0, 5));
    if (mudou && !emEdicao()) rotear();
  } catch (e) {
    estado(e.status === 0 ? 'Sem internet' : 'Erro ao atualizar');
    if (!silencioso) aviso(e.message, 4000);
  } finally { sincronizando = false; }
}
const emEdicao = () => /^#\/(nova|editar)/.test(location.hash);

async function salvarNota(n, mensagem) {
  const texto = L.escreverNota(n);
  const sha = await repo.gravar(n.caminho || L.caminhoDaNota(n.id), texto, mensagem, n.sha);
  const caminho = n.caminho || L.caminhoDaNota(n.id);
  arvore = arvore.filter((a) => a.path !== caminho).concat({ path: caminho, sha });
  textos[sha] = texto; gravarLocal(); reconstruir();
}

// ---------- trancar / destrancar ----------
function telaPrimeiroAcesso() {
  $('#abas').hidden = true;
  app.innerHTML = `
    <div class="cx cartao">
      <h1>Primeiro acesso</h1>
      <p class="suave">Cole a chave de acesso do Cofre (a mesma que você criou no GitHub para este aparelho) e escolha um PIN. A chave fica trancada pelo PIN, só neste aparelho.</p>
      <form id="f">
        <label for="chave">Chave de acesso</label>
        <input id="chave" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" required>
        <label for="pin">Escolha um PIN (4 a 8 números)</label>
        <input id="pin" class="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" autocomplete="off" required>
        <p class="erro" id="erro" hidden></p>
        <div class="acoes"><button class="b" id="ok">Guardar e entrar</button></div>
      </form>
    </div>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const chave = $('#chave').value.trim(), pin = $('#pin').value.trim();
    const erro = $('#erro'); erro.hidden = true; $('#ok').disabled = true; $('#ok').textContent = 'Conferindo…';
    try {
      const r = new Repositorio(chave); await r.testar();
      await guardarChave(chave, pin);
      sessionStorage.setItem('cofre.sessao', chave);
      iniciar(chave);
    } catch (err) {
      erro.textContent = err.message || 'Não consegui conferir a chave.'; erro.hidden = false;
      $('#ok').disabled = false; $('#ok').textContent = 'Guardar e entrar';
    }
  };
}
function telaPin() {
  $('#abas').hidden = true;
  app.innerHTML = `
    <div class="cx cartao">
      <h1>Cofre</h1>
      <p class="suave">Digite seu PIN para abrir.</p>
      <form id="f">
        <label for="pin">PIN</label>
        <input id="pin" class="pin" type="password" inputmode="numeric" maxlength="8" autocomplete="off" autofocus required>
        <p class="erro" id="erro" hidden></p>
        <div class="acoes"><button class="b">Abrir</button></div>
      </form>
      <p class="suave" style="margin-top:18px"><a href="#" id="esqueci">Esqueci o PIN / trocar a chave</a></p>
    </div>`;
  $('#pin').focus();
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const chave = await abrirChave($('#pin').value.trim());
      sessionStorage.setItem('cofre.sessao', chave);
      iniciar(chave);
    } catch { const er = $('#erro'); er.textContent = 'PIN incorreto.'; er.hidden = false; $('#pin').value = ''; }
  };
  $('#esqueci').onclick = (e) => {
    e.preventDefault();
    if (confirm('Isso só apaga a chave guardada NESTE aparelho. Suas anotações continuam seguras no GitHub. Continuar?')) { esquecerChave(); telaPrimeiroAcesso(); }
  };
}
function iniciar(chave) {
  repo = new Repositorio(chave, REPO_PADRAO);
  lerLocal(); reconstruir();
  $('#abas').hidden = false;
  if (!location.hash || location.hash === '#') location.hash = '#/';
  rotear();
  atualizar();
}

// ---------- roteador ----------
function rotear() {
  if (!repo) return;
  const [, rota = '', arg = '', arg2 = ''] = location.hash.split('/');
  const nome = rota.split('?')[0];
  document.querySelectorAll('#abas a').forEach((a) => a.classList.toggle('ativa',
    (a.dataset.aba === 'painel' && nome === '') || a.dataset.aba === nome || (a.dataset.aba === 'lista' && nome === 'nota')));
  window.scrollTo(0, 0);
  if (nome === '') telaPainel();
  else if (nome === 'lista') telaLista();
  else if (nome === 'nova') {
    // #/nova/trecho/<id do livro, vídeo ou curso> já abre com a fonte preenchida
    const f = arg === 'trecho' && arg2 ? notas.find((x) => x.id === arg2) : null;
    telaForm(arg || 'pensamento', null, f ? { fonte: f.titulo, fonte_id: f.id } : null);
  }
  else if (nome === 'editar') { const n = notas.find((x) => x.id === arg); n ? telaForm(n.tipo, n) : (location.hash = '#/lista'); }
  else if (nome === 'nota') telaNota(arg);
  else if (nome === 'semana') telaSemana();
  else if (nome === 'ajustes') telaAjustes();
  else location.hash = '#/';
}
window.addEventListener('hashchange', rotear);

// ---------- pedaços de tela ----------
const dataCurta = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');
function linhaNota(n, extra = '') {
  const tags = [n.tipo === 'trecho' ? n.local : '', ...n.tags.map((t) => '#' + t)].filter(Boolean).join(' ');
  return `<a class="linha ${extra}" href="#/nota/${esc(n.id)}"><span class="ic">${L.TIPOS[n.tipo].icone}</span><span class="tx">${esc(L.tituloExibido(n))}</span>${tags ? `<span class="tg">${esc(tags)}</span>` : ''}<span class="dt">${dataCurta(n.tipo === 'evento' ? (L.proximaOcorrencia(n) || n.data) : n.rever_em && extra ? n.rever_em : n.criada)}</span></a>`;
}
function linhaEvento({ nota: n, quando }) {
  const hoje = L.hojeISO();
  const partes = [L.quandoTexto(quando, hoje), n.hora, n.repete !== 'nao' ? L.REPETE[n.repete] : ''].filter(Boolean).join(' · ');
  return `<a class="linha ev ${quando === hoje ? 'agora' : ''}" href="#/nota/${esc(n.id)}"><span class="ic">${L.TIPOS.evento.icone}</span><span class="tx">${esc(L.tituloExibido(n))}</span>${partes ? `<span class="tg">${esc(partes)}</span>` : ''}<span class="dt">${dataCurta(quando)}</span></a>`;
}

// Entrega o evento ao iPhone/PC como arquivo de calendário (.ics): o Calendário é quem toca o alarme.
async function entregarCalendario(n) {
  const arq = new File([L.eventoParaICS(n)], 'evento.ics', { type: 'text/calendar' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [arq] })) { await navigator.share({ files: [arq], title: L.tituloExibido(n) }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const url = URL.createObjectURL(arq), a = document.createElement('a');
  a.href = url; a.download = 'evento.ics'; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  aviso('Arquivo do evento baixado: abra-o para adicionar ao Calendário.', 4500);
}

// Copia um texto para colar no Claude (se o aparelho não deixar, mostra o texto para copiar à mão).
async function copiarTexto(texto, msg) {
  try { await navigator.clipboard.writeText(texto); aviso(msg, 3500); return; } catch { /* tenta o plano B */ }
  const t = document.createElement('textarea'); t.value = texto; t.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.append(t); t.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { /* sem permissão */ }
  t.remove();
  aviso(ok ? msg : 'Este aparelho não deixou copiar automaticamente.', ok ? 3500 : 5000);
}

function telaPainel() {
  const hoje = L.hojeISO();
  const lembretes = L.lembretesDeHoje(notas, hoje);
  const est = L.estante(notas);
  const proximos = L.proximosEventos(notas, hoje);
  const cursos = L.cursosEmAndamento(notas);
  const cons = L.constancia(notas, hoje);
  const ultimas = [...notas].filter((n) => !n.arquivada).sort(L.maisRecentesPrimeiro).slice(0, 5);
  const t = L.totais(notas);
  app.innerHTML = `
    <h1>Painel</h1>
    <div class="totais">
      <div class="cartao"><b>${t.pensamento}</b><span>💭 pensamentos</span></div>
      <div class="cartao"><b>${t.livro}</b><span>📖 livros</span></div>
      <div class="cartao"><b>${t.video}</b><span>▶️ vídeos</span></div>
    </div>
    <h2>Constância</h2>
    <div class="cartao">${V.calendario(cons)}</div>
    <h2>Rever hoje</h2>
    <div class="cartao">${lembretes.length ? lembretes.map((n) => linhaNota(n, 'aviso-data')).join('') : '<div class="vazio">Nada para rever hoje.</div>'}</div>
    <h2>Próximos eventos</h2>
    <div class="cartao">${proximos.length ? proximos.map(linhaEvento).join('') : '<div class="vazio">Nenhum evento marcado. Toque em “Anotar” e escolha Evento.</div>'}</div>
    <h2>Cursos</h2>
    <div class="cartao">${cursos.length ? V.cursosAgora(cursos) : '<div class="vazio">Nenhum curso em andamento.</div>'}</div>
    <h2>Lendo agora</h2>
    <div class="cartao">${est.lendo.length ? V.lendoAgora(est.lendo) : '<div class="vazio">Nenhum livro marcado como “lendo”.</div>'}</div>
    ${est.lidos.length ? `<h2>Estante</h2><div class="cartao">${V.estanteLidos(est)}</div>` : ''}
    <h2>Últimas anotações</h2>
    <div class="cartao">${ultimas.length ? ultimas.map((n) => linhaNota(n)).join('') : '<div class="vazio">Ainda não há anotações. Toque em “Anotar”.</div>'}</div>
    ${t.arquivadas ? `<p class="suave">${t.arquivadas} arquivada(s) — veja na Lista, opção “Arquivadas”.</p>` : ''}`;
  V.ligarCalendario(app, cons);
}

function telaLista() {
  const tags = L.contarTags(notas).slice(0, 14);
  const achadas = L.buscar(notas, filtro);
  app.innerHTML = `
    <h1>Lista</h1>
    <input id="busca" type="search" placeholder="Buscar (ex.: dinheiro)" value="${esc(filtro.termo)}" autocomplete="off">
    <div class="chips" id="tipos">
      ${[['', 'Tudo'], ['pensamento', '💭'], ['livro', '📖'], ['video', '▶️'], ['curso', '🎓'], ['evento', '🗓️'], ['trecho', '✍️']].map(([v, r]) => `<button class="chip ${filtro.tipo === v ? 'on' : ''}" data-tipo="${v}">${r}</button>`).join('')}
      <button class="chip ${filtro.arquivadas ? 'on' : ''}" id="arq">Arquivadas</button>
    </div>
    ${tags.length ? `<div class="chips" id="tags">${tags.map(([t, q]) => `<button class="chip ${filtro.tag === t ? 'on' : ''}" data-tag="${esc(t)}">#${esc(t)} ${q}</button>`).join('')}</div>` : ''}
    <p class="suave">${achadas.length} resultado(s)</p>
    <div class="cartao" id="resultado">${achadas.length ? achadas.map((n) => linhaNota(n)).join('') : '<div class="vazio">Nada encontrado.</div>'}</div>`;
  const redesenhar = () => {
    const a = L.buscar(notas, filtro);
    $('#resultado').innerHTML = a.length ? a.map((n) => linhaNota(n)).join('') : '<div class="vazio">Nada encontrado.</div>';
    $('#resultado').previousElementSibling.textContent = `${a.length} resultado(s)`;
  };
  $('#busca').oninput = (e) => { filtro.termo = e.target.value; redesenhar(); };
  $('#tipos').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'arq') filtro.arquivadas = !filtro.arquivadas; else filtro.tipo = b.dataset.tipo;
    telaLista();
  };
  const tg = $('#tags'); if (tg) tg.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; filtro.tag = filtro.tag === b.dataset.tag ? '' : b.dataset.tag; telaLista(); };
}

function telaNota(id) {
  const n = notas.find((x) => x.id === id);
  if (!n) { app.innerHTML = '<p class="vazio">Anotação não encontrada. <a href="#/lista">Voltar à lista</a></p>'; return; }
  const rel = L.relacionadas(n, notas);
  const linkOk = /^https?:\/\//i.test(n.link);
  const fonteNota = n.tipo === 'trecho' ? L.fonteDoTrecho(n, notas) : null;
  const ehFonte = L.TIPOS_DE_FONTE.includes(n.tipo);
  const trechos = ehFonte ? L.trechosDaFonte(n, notas) : [];
  app.innerHTML = `
    <p><a href="#/lista">← Lista</a></p>
    <div class="folha ${n.arquivada ? 'arquivada' : ''}">
      <div class="suave">${L.TIPOS[n.tipo].icone} ${L.TIPOS[n.tipo].nome} · ${esc(n.criada.slice(0, 10).split('-').reverse().join('/'))}${n.arquivada ? ' · <b>ARQUIVADA</b>' : ''}</div>
      ${n.tipo === 'video' ? `<div class="previa">${linkOk ? `<a class="mini-link" href="${esc(n.link)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir o vídeo">${V.miniaturaVideo(n.link)}</a>` : V.miniaturaVideo(n.link)}</div>` : ''}
      ${n.tipo === 'livro' ? `<div class="cabeca">${V.capaLivro(n.titulo)}<div>` : ''}
      <h1 style="margin-top:8px">${esc(n.titulo || (n.tipo === 'pensamento' || n.tipo === 'trecho' ? '' : '(sem título)'))}</h1>
      ${n.tipo === 'trecho' && (n.fonte || n.local) ? `<p class="suave fonte-trecho">${fonteNota ? `<a href="#/nota/${esc(fonteNota.id)}">${esc(fonteNota.titulo)}</a>` : esc(n.fonte)}${n.local ? `${n.fonte ? ' · ' : ''}${esc(n.local)}` : ''}</p>` : ''}
      ${n.tipo === 'livro' ? `<p class="suave">Status: ${esc(n.status || '-')} · Nota: ${n.nota ?? '-'}</p></div></div>` : ''}
      ${n.tipo === 'curso' ? V.detalheCurso(n) : ''}
      ${n.tipo === 'evento' ? V.detalheEvento(n) : ''}
      ${linkOk ? `<p><a href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">${esc(n.link)}</a></p>` : n.link ? `<p class="suave">${esc(n.link)}</p>` : ''}
      <div class="corpo ${n.tipo === 'trecho' ? 'citacao' : ''}">${esc(n.corpo)}</div>
      ${n.tags.length ? `<div class="chips">${n.tags.map((t) => `<a class="chip" href="#/lista" data-tag="${esc(t)}">#${esc(t)}</a>`).join('')}</div>` : ''}
      ${n.rever_em ? `<p class="suave">🔔 Rever em ${esc(n.rever_em.split('-').reverse().join('/'))}</p>` : n.revisada_em ? `<p class="suave">✅ Revisada em ${esc(n.revisada_em.split('-').reverse().join('/'))}</p>` : ''}
    </div>
    <div class="acoes">
      <a class="b" href="#/editar/${esc(n.id)}" style="text-align:center">Editar</a>
      ${n.tipo === 'evento' ? '' : '<button class="b sec" id="r7">Rever em 7 dias</button><button class="b sec" id="r30">Rever em 30 dias</button>'}
      ${n.tipo === 'curso' && n.status === 'assistindo' ? '<button class="b sec" id="aula">Assisti mais 1 aula</button>' : ''}
      ${n.tipo === 'evento' ? '<button class="b sec" id="cal">Adicionar ao Calendário</button>' : ''}
      ${ehFonte ? `<a class="b sec" id="novoTrecho" href="#/nova/trecho/${esc(n.id)}">✍️ Anotar trecho</a>` : ''}
      ${n.tipo === 'trecho' ? '<button class="b sec" id="claude">Pedir ao Claude para aprofundar</button>' : ''}
      ${trechos.length ? '<button class="b sec" id="claudeTrechos">Copiar trechos para o Claude</button>' : ''}
      ${n.rever_em ? '<button class="b sec" id="visto">Marcar como revisada</button>' : ''}
      <button class="b ${n.arquivada ? 'sec' : 'perigo'}" id="arq">${n.arquivada ? 'Desfazer arquivamento' : 'Arquivar'}</button>
    </div>
    <p class="erro" id="erro" hidden></p>
    ${ehFonte ? `<h2>Trechos e insights${trechos.length ? ` (${trechos.length})` : ''}</h2>
    <div class="cartao" id="trechos">${trechos.length ? trechos.map((t) => linhaNota(t)).join('') : '<div class="vazio">Nada registrado ainda. Toque em “Anotar trecho” para guardar uma passagem.</div>'}</div>` : ''}
    <h2>Relacionadas</h2>
    <div class="cartao">${rel.length ? rel.map((r) => linhaNota(r.nota)).join('') : '<div class="vazio">Nada parecido por enquanto.</div>'}</div>`;
  V.armarImagens(app);
  document.querySelectorAll('.chip[data-tag]').forEach((c) => { c.onclick = () => { filtro = { termo: '', tipo: '', tag: c.dataset.tag, arquivadas: false }; }; });
  const mudar = async (campos, msg, ok) => {
    try { await salvarNota({ ...n, ...campos, editada: L.agoraISO() }, msg); aviso(ok); telaNota(id); }
    catch (e) { const er = $('#erro'); er.textContent = e.message; er.hidden = false; }
  };
  if ($('#r7')) $('#r7').onclick = () => mudar({ rever_em: L.addDias(L.hojeISO(), 7), revisada_em: '' }, 'Rever em 7 dias', 'Lembrete marcado para 7 dias');
  if ($('#r30')) $('#r30').onclick = () => mudar({ rever_em: L.addDias(L.hojeISO(), 30), revisada_em: '' }, 'Rever em 30 dias', 'Lembrete marcado para 30 dias');
  const aula = $('#aula');
  if (aula) aula.onclick = () => {
    const feitas = (n.aulas_feitas || 0) + 1, fim = n.aulas_total && feitas >= n.aulas_total;
    mudar({ aulas_feitas: n.aulas_total ? Math.min(feitas, n.aulas_total) : feitas, status: fim ? 'concluído' : n.status }, 'Aula assistida', fim ? 'Curso concluído! 🎉' : 'Aula registrada');
  };
  const cal = $('#cal'); if (cal) cal.onclick = () => entregarCalendario(n);
  const cl = $('#claude'); if (cl) cl.onclick = () => copiarTexto(L.promptAprofundar(n, notas), 'Copiado! Cole no Claude para aprofundar.');
  const clt = $('#claudeTrechos'); if (clt) clt.onclick = () => copiarTexto(L.promptTrechos(n, trechos), 'Copiado! Cole no Claude.');
  const v = $('#visto'); if (v) v.onclick = () => mudar({ rever_em: '', revisada_em: L.hojeISO() }, 'Revisada', 'Marcada como revisada');
  $('#arq').onclick = () => {
    if (!n.arquivada && !confirm('Arquivar esta anotação? Ela some da lista, mas não é apagada e dá para desfazer.')) return;
    if (n.arquivada) filtro.arquivadas = false; // ao restaurar, a Lista volta a mostrar as anotações normais
    mudar({ arquivada: !n.arquivada }, n.arquivada ? 'Desarquivar' : 'Arquivar', n.arquivada ? 'Anotação restaurada' : 'Arquivada (dá para desfazer)');
  };
}

function telaForm(tipo, existente, pre = null) {
  const n = existente || null;
  if (!L.TIPOS[tipo]) tipo = 'pensamento';
  const ed = !!n;
  const campoRever = `
    <label for="rever">Lembrar de rever</label>
    <select id="rever"><option value="">Não</option><option value="7">Daqui a 7 dias</option><option value="30">Daqui a 30 dias</option><option value="data">Numa data…</option></select>
    <input id="reverData" type="date" hidden>`;
  const tagsExistentes = n ? n.tags.map((t) => '#' + t).join(' ') : '';
  app.innerHTML = `
    <h1>${ed ? 'Editar' : 'Anotar'}</h1>
    ${ed ? '' : `<div class="seg" id="seg">${Object.entries(L.TIPOS).map(([k, v]) => `<button type="button" class="chip ${k === tipo ? 'on' : ''}" data-t="${k}">${v.icone} ${v.nome}</button>`).join('')}</div>`}
    <form id="f" autocomplete="off">
      ${tipo === 'pensamento' ? `
        <label for="corpo">O que você pensou?</label>
        <textarea id="corpo" required autofocus>${esc(n?.corpo)}</textarea>` : ''}
      ${tipo === 'livro' ? `
        <label for="titulo">Título do livro</label>
        <input id="titulo" required value="${esc(n?.titulo)}">
        <label for="status">Status</label>
        <select id="status">${L.STATUS.map((s) => `<option ${((n?.status) || 'lendo') === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <label for="nota">Nota (0 a 10)</label>
        <input id="nota" type="number" min="0" max="10" step="0.5" inputmode="decimal" value="${n?.nota ?? ''}">
        <label for="corpo">O que levo dele</label>
        <textarea id="corpo">${esc(n?.corpo)}</textarea>` : ''}
      ${tipo === 'curso' ? `
        <label for="titulo">Nome do curso</label>
        <input id="titulo" required value="${esc(n?.titulo)}">
        <label for="plataforma">Onde assiste</label>
        <input id="plataforma" placeholder="Udemy, Alura, YouTube…" value="${esc(n?.plataforma)}">
        <label for="status">Situação</label>
        <select id="status">${L.STATUS_CURSO.map((s) => `<option ${((n?.status) || 'assistindo') === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <label for="feitas">Aulas assistidas</label>
        <input id="feitas" type="number" min="0" step="1" inputmode="numeric" value="${n?.aulas_feitas ?? ''}">
        <label for="total">Total de aulas</label>
        <input id="total" type="number" min="0" step="1" inputmode="numeric" value="${n?.aulas_total ?? ''}">
        <label for="link">Link do curso (opcional)</label>
        <input id="link" type="url" inputmode="url" value="${esc(n?.link)}">
        <label for="corpo">Anotações</label>
        <textarea id="corpo">${esc(n?.corpo)}</textarea>` : ''}
      ${tipo === 'evento' ? `
        <label for="titulo">O que vai acontecer?</label>
        <input id="titulo" required value="${esc(n?.titulo)}">
        <label for="data">Data</label>
        <input id="data" type="date" required value="${esc(n?.data)}">
        <label for="hora">Hora (opcional)</label>
        <input id="hora" type="time" value="${esc(n?.hora)}">
        <label for="repete">Repete?</label>
        <select id="repete">${Object.entries(L.REPETE).map(([k, v]) => `<option value="${k}" ${(n?.repete || 'nao') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <label for="corpo">Detalhes (opcional)</label>
        <textarea id="corpo">${esc(n?.corpo)}</textarea>` : ''}
      ${tipo === 'trecho' ? `
        <label for="fonte">De onde veio? <span class="suave">(livro, vídeo ou curso)</span></label>
        <input id="fonte" list="fontes" value="${esc(n?.fonte ?? pre?.fonte)}" placeholder="Comece a digitar o título" ${(n?.fonte ?? pre?.fonte) ? '' : 'autofocus'}>
        <datalist id="fontes">${L.fontesDisponiveis(notas).map((f) => `<option value="${esc(f.titulo)}">`).join('')}</datalist>
        <label for="local">Onde? <span class="suave">(capítulo, página, minuto)</span></label>
        <input id="local" value="${esc(n?.local)}" placeholder="cap. 3, p. 45" ${(n?.fonte ?? pre?.fonte) ? 'autofocus' : ''}>
        <label for="corpo">O trecho ou insight</label>
        <textarea id="corpo" required>${esc(n?.corpo)}</textarea>` : ''}
      ${tipo === 'video' ? `
        <label for="link">Link do vídeo</label>
        <input id="link" type="url" inputmode="url" required placeholder="Cole o link aqui" value="${esc(n?.link)}">
        <label for="titulo">Título <span class="suave" id="dica"></span></label>
        <input id="titulo" value="${esc(n?.titulo)}">
        <label for="corpo">O que aprendi</label>
        <textarea id="corpo">${esc(n?.corpo)}</textarea>` : ''}
      <div class="previa" id="previa"></div>
      <label for="tags">Tags</label>
      <input id="tags" value="${esc(tagsExistentes)}" placeholder="#dinheiro #habitos" autocapitalize="off">
      <div class="chips" id="sug"></div>
      ${tipo === 'evento' ? '' : campoRever}
      <p class="erro" id="erro" hidden></p>
      <div class="acoes"><button class="b" id="ok">Salvar</button>${tipo === 'trecho' && !ed ? '<button class="b sec" id="ok2">Salvar e anotar outro</button>' : ''}<a class="b sec" href="${ed ? '#/nota/' + esc(n.id) : '#/'}" style="text-align:center">Cancelar</a></div>
    </form>`;
  if (!ed) $('#seg').onclick = (e) => { const b = e.target.closest('button'); if (b) location.hash = '#/nova/' + b.dataset.t; };

  // sugestões de tags enquanto digita
  const campoTags = $('#tags'), corpoEl = $('#corpo');
  const sugerir = (campo, soComHash) => {
    const palavras = campo.value.split(/\s+/); const ultima = palavras[palavras.length - 1] || '';
    if (soComHash && !ultima.startsWith('#')) { $('#sug').innerHTML = ''; return; }
    const usadas = L.extrairTags(campoTags.value.replace(/(^|\s)(?!#)/g, '$1#'));
    const lista = L.sugerirTags(notas, ultima, usadas);
    $('#sug').innerHTML = lista.map((t) => `<button type="button" class="chip" data-s="${esc(t)}">#${esc(t)}</button>`).join('');
    $('#sug').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      palavras[palavras.length - 1] = '#' + b.dataset.s; campo.value = palavras.join(' ') + ' '; campo.focus(); sugerir(campo, soComHash);
    };
  };
  campoTags.oninput = () => sugerir(campoTags, false);
  campoTags.onfocus = () => sugerir(campoTags, false);
  if (corpoEl && (tipo === 'pensamento' || tipo === 'trecho')) corpoEl.oninput = () => sugerir(corpoEl, true);

  // título automático do vídeo
  if (tipo === 'video') {
    const buscarTitulo = async () => {
      const url = $('#link').value.trim();
      if (!/^https?:\/\//i.test(url) || $('#titulo').value) return;
      $('#dica').textContent = '(buscando…)';
      const t = await tituloDoVideo(url);
      if (t && !$('#titulo').value) $('#titulo').value = t;
      $('#dica').textContent = t ? '' : '(não achei — digite se quiser)';
    };
    $('#link').onchange = buscarTitulo; $('#link').onpaste = () => setTimeout(buscarTitulo, 50);
  }

  // prévia: capa do livro / miniatura do vídeo, atualizadas enquanto digita
  const previa = $('#previa');
  if (tipo === 'livro') {
    const capa = () => { const t = $('#titulo').value.trim(); previa.innerHTML = t ? V.capaLivro(t) : ''; };
    $('#titulo').addEventListener('input', capa); capa();
  } else if (tipo === 'video') {
    const mini = () => { const l = $('#link').value.trim(); previa.innerHTML = /^https?:\/\//i.test(l) ? V.miniaturaVideo(l) : ''; V.armarImagens(previa); };
    $('#link').addEventListener('input', mini); $('#link').addEventListener('change', mini); mini();
  }

  if ($('#rever')) $('#rever').onchange = (e) => { $('#reverData').hidden = e.target.value !== 'data'; };
  if (n?.rever_em && $('#rever')) { $('#rever').value = 'data'; $('#reverData').hidden = false; $('#reverData').value = n.rever_em; }

  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const val = (id) => ($('#' + id)?.value || '').trim();
    const corpo = val('corpo');
    const tags = L.unicos([...L.extrairTags(corpo), ...val('tags').split(/[\s,]+/).map(L.normTag)].filter(Boolean));
    const r = val('rever');
    const rever = r === '7' || r === '30' ? L.addDias(L.hojeISO(), Number(r)) : r === 'data' ? val('reverData') : '';
    const agora = L.agoraISO();
    const base = n ? { ...n } : { id: L.novoId(), tipo, criada: agora, arquivada: false, status: '', nota: null, link: '', titulo: '', revisada_em: '', plataforma: '', aulas_feitas: null, aulas_total: null, data: '', hora: '', repete: 'nao', fonte: '', fonte_id: '', local: '' };
    const nova = { ...base, corpo, tags, rever_em: rever, editada: n ? agora : '' };
    if (tipo === 'livro') { nova.titulo = val('titulo'); nova.status = val('status'); nova.nota = val('nota') === '' ? null : Number(val('nota')); }
    const num = (id) => (val(id) === '' ? null : Number(val(id)));
    if (tipo === 'curso') { nova.titulo = val('titulo'); nova.plataforma = val('plataforma'); nova.status = val('status'); nova.aulas_feitas = num('feitas'); nova.aulas_total = num('total'); nova.link = val('link'); }
    if (tipo === 'evento') { nova.titulo = val('titulo'); nova.data = val('data'); nova.hora = val('hora'); nova.repete = val('repete') || 'nao'; }
    if (tipo === 'video') { nova.link = val('link'); nova.titulo = val('titulo') || nova.link; }
    if (tipo === 'trecho') {
      nova.local = val('local');
      const achada = L.fontesDisponiveis(notas).find((x) => L.semAcento(x.titulo) === L.semAcento(val('fonte')));
      nova.fonte = achada ? achada.titulo : val('fonte'); // grava o nome certo do livro, mesmo se digitado em minúsculas
      nova.fonte_id = achada ? achada.id : '';
    }
    if ((tipo === 'pensamento' || tipo === 'trecho') && !corpo) return;
    const outro = e.submitter?.id === 'ok2';
    $('#ok').disabled = true; if ($('#ok2')) $('#ok2').disabled = true; (outro ? $('#ok2') : $('#ok')).textContent = 'Salvando…';
    try {
      await salvarNota(nova, (n ? 'Editar' : 'Nova') + ' ' + tipo);
      if (outro) { aviso('Salvo ✓ — pode anotar o próximo'); window.scrollTo(0, 0); telaForm('trecho', null, { fonte: nova.fonte, fonte_id: nova.fonte_id }); return; }
      aviso('Salvo ✓');
      location.hash = n ? '#/nota/' + nova.id : '#/';
    } catch (err) {
      const er = $('#erro'); er.textContent = err.message + ' O que você escreveu continua na tela.'; er.hidden = false;
      $('#ok').disabled = false; $('#ok').textContent = 'Salvar';
      if ($('#ok2')) { $('#ok2').disabled = false; $('#ok2').textContent = 'Salvar e anotar outro'; }
    }
  };
}

function telaSemana() {
  const r = L.resumoSemana(notas);
  const prompt = L.promptParaClaude(r);
  app.innerHTML = `
    <h1>Semana</h1>
    <p class="suave">De ${esc(r.desde.split('-').reverse().join('/'))} até hoje · ${r.daSemana.length} anotação(ões)</p>
    <h2>Dia a dia</h2>
    <div class="cartao">${V.barrasDaSemana(L.semanaPorDia(notas))}</div>
    <h2>Temas mais frequentes</h2>
    <div class="cartao">${r.temas.length ? `<div class="chips">${r.temas.slice(0, 12).map(([t, q]) => `<span class="chip">#${esc(t)} ×${q}</span>`).join('')}</div>` : '<div class="vazio">Sem tags nesta semana.</div>'}</div>
    <h2>Ideias que se conectam</h2>
    <div class="escopo" id="escopo">${[['7', '7 dias'], ['tudo', 'Tudo']].map(([v, r]) => `<button class="chip ${escopoMapa === v ? 'on' : ''}" data-e="${v}">${r}</button>`).join('')}</div>
    <div class="cartao" id="mapa"></div>
    <h2>O que anotei</h2>
    <div class="cartao">${r.daSemana.length ? r.daSemana.map((n) => linhaNota(n)).join('') : '<div class="vazio">Nenhuma anotação nesta semana.</div>'}</div>
    <h2>Análise do Claude</h2>
    <div class="cartao">
      <p class="suave">Copie o texto abaixo e cole numa conversa com o Claude. Ele resume a semana e acha conexões. Nada é enviado automaticamente.</p>
      <div class="acoes"><button class="b" id="copiar">Copiar para o Claude</button></div>
      <pre class="copia" id="prev">${esc(prompt)}</pre>
    </div>`;
  const desenharMapa = () => {
    const m = L.mapaTags(notas, { desde: escopoMapa === '7' ? r.desde : '' });
    $('#mapa').innerHTML = m.nos.length
      ? `${V.mapaDeTags(m)}<p class="suave">Cada bolha é uma tag usada em duas ou mais anotações; o fio liga tags que aparecem juntas. Toque numa bolha para ver as anotações.</p><div class="mapa-notas" id="mapa-notas"></div>`
      : '<div class="vazio">Use a mesma tag em duas anotações para ver conexões aqui.</div>';
    V.ligarMapa($('#mapa'), (tag) => {
      const todas = tag ? m.base.filter((n) => n.tags.includes(tag)).sort(L.maisRecentesPrimeiro) : [];
      $('#mapa-notas').innerHTML = todas.slice(0, 6).map((n) => linhaNota(n)).join('')
        + (todas.length > 6 ? `<p class="suave"><a href="#/lista" id="ver-todas">Ver as ${todas.length} anotações de #${esc(tag)} na Lista</a></p>` : '');
      const v = $('#ver-todas'); if (v) v.onclick = () => { filtro = { termo: '', tipo: '', tag, arquivadas: false }; };
    });
  };
  desenharMapa();
  $('#escopo').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; escopoMapa = b.dataset.e; document.querySelectorAll('#escopo .chip').forEach((c) => c.classList.toggle('on', c === b)); desenharMapa(); };
  $('#copiar').onclick = async () => {
    try { await navigator.clipboard.writeText(prompt); aviso('Copiado! Cole no Claude.'); }
    catch { const s = window.getSelection(), rg = document.createRange(); rg.selectNodeContents($('#prev')); s.removeAllRanges(); s.addRange(rg); aviso('Selecionei o texto: copie manualmente.', 4000); }
  };
}

function telaAjustes() {
  app.innerHTML = `
    <h1>Ajustes</h1>
    <div class="cartao">
      <p><b>Anotações lidas:</b> ${notas.length}</p>
      <p class="suave">Última atualização: ${ultimaAtualizacao ? ultimaAtualizacao.toTimeString().slice(0, 8) : '—'}</p>
      <div class="acoes"><button class="b sec" id="atual">Atualizar agora</button></div>
    </div>
    <div class="cartao">
      <p><b>Trancar agora</b></p>
      <p class="suave">Pede o PIN de novo na próxima vez.</p>
      <div class="acoes"><button class="b sec" id="trancar">Trancar</button></div>
    </div>
    <div class="cartao">
      <p><b>Trocar a chave deste aparelho</b></p>
      <p class="suave">Apaga só a chave guardada aqui. Suas anotações continuam no GitHub.</p>
      <div class="acoes"><button class="b perigo" id="trocar">Trocar chave</button></div>
    </div>`;
  $('#atual').onclick = async () => { await atualizar(); aviso('Atualizado'); telaAjustes(); };
  $('#trancar').onclick = () => { sessionStorage.removeItem('cofre.sessao'); repo = null; telaPin(); };
  $('#trocar').onclick = () => { if (confirm('Apagar a chave deste aparelho? As anotações não são apagadas.')) { esquecerChave(); repo = null; telaPrimeiroAcesso(); } };
}

// ---------- partida ----------
document.addEventListener('visibilitychange', () => { if (!document.hidden) atualizar({ silencioso: true }); });
setInterval(() => { if (!document.hidden) atualizar({ silencioso: true }); }, 60000);

(function partida() {
  let sessao = null;
  try { sessao = sessionStorage.getItem('cofre.sessao'); } catch { /* ignora */ }
  if (sessao) iniciar(sessao);
  else if (temChaveGuardada()) telaPin();
  else telaPrimeiroAcesso();
})();
