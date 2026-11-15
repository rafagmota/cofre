// Cofre - telas e comportamento.
import * as L from './lib.js';
import { Repositorio, REPO_PADRAO, guardarChave, abrirChave, temChaveGuardada, esquecerChave, tituloDoVideo } from './net.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');

let repo = null;          // conexão com o GitHub (só depois de destrancar)
let notas = [];           // anotações já lidas
let arvore = [];          // [{path, sha}]
let textos = {};          // sha -> texto
let ultimaAtualizacao = null;
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
      <h1>🔒 Cofre</h1>
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
  const [, rota = '', arg = ''] = location.hash.split('/');
  const nome = rota.split('?')[0];
  document.querySelectorAll('#abas a').forEach((a) => a.classList.toggle('ativa',
    (a.dataset.aba === 'painel' && nome === '') || a.dataset.aba === nome || (a.dataset.aba === 'lista' && nome === 'nota')));
  window.scrollTo(0, 0);
  if (nome === '') telaPainel();
  else if (nome === 'lista') telaLista();
  else if (nome === 'nova') telaForm(arg || 'pensamento');
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
  const tags = n.tags.map((t) => '#' + t).join(' ');
  return `<a class="linha ${extra}" href="#/nota/${esc(n.id)}"><span class="ic">${L.TIPOS[n.tipo].icone}</span><span class="tx">${esc(L.tituloExibido(n))}</span>${tags ? `<span class="tg">${esc(tags)}</span>` : ''}<span class="dt">${dataCurta(n.rever_em && extra ? n.rever_em : n.criada)}</span></a>`;
}

function telaPainel() {
  const hoje = L.hojeISO();
  const lembretes = L.lembretesDeHoje(notas, hoje);
  const lendo = notas.filter((n) => !n.arquivada && n.tipo === 'livro' && n.status === 'lendo');
  const ultimas = [...notas].filter((n) => !n.arquivada).sort(L.maisRecentesPrimeiro).slice(0, 5);
  const t = L.totais(notas);
  app.innerHTML = `
    <h1>Painel</h1>
    <div class="totais">
      <div class="cartao"><b>${t.pensamento}</b><span>💭 pensamentos</span></div>
      <div class="cartao"><b>${t.livro}</b><span>📖 livros</span></div>
      <div class="cartao"><b>${t.video}</b><span>▶️ vídeos</span></div>
    </div>
    <h2>Rever hoje</h2>
    <div class="cartao">${lembretes.length ? lembretes.map((n) => linhaNota(n, 'aviso-data')).join('') : '<div class="vazio">Nada para rever hoje.</div>'}</div>
    <h2>Lendo agora</h2>
    <div class="cartao">${lendo.length ? lendo.map((n) => linhaNota(n)).join('') : '<div class="vazio">Nenhum livro marcado como “lendo”.</div>'}</div>
    <h2>Últimas anotações</h2>
    <div class="cartao">${ultimas.length ? ultimas.map((n) => linhaNota(n)).join('') : '<div class="vazio">Ainda não há anotações. Toque em “Anotar”.</div>'}</div>
    ${t.arquivadas ? `<p class="suave">${t.arquivadas} arquivada(s) — veja na Lista, opção “Arquivadas”.</p>` : ''}`;
}

function telaLista() {
  const tags = L.contarTags(notas).slice(0, 14);
  const achadas = L.buscar(notas, filtro);
  app.innerHTML = `
    <h1>Lista</h1>
    <input id="busca" type="search" placeholder="Buscar (ex.: dinheiro)" value="${esc(filtro.termo)}" autocomplete="off">
    <div class="chips" id="tipos">
      ${[['', 'Tudo'], ['pensamento', '💭'], ['livro', '📖'], ['video', '▶️']].map(([v, r]) => `<button class="chip ${filtro.tipo === v ? 'on' : ''}" data-tipo="${v}">${r}</button>`).join('')}
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
  app.innerHTML = `
    <p><a href="#/lista">← Lista</a></p>
    <div class="cartao ${n.arquivada ? 'arquivada' : ''}">
      <div class="suave">${L.TIPOS[n.tipo].icone} ${L.TIPOS[n.tipo].nome} · ${esc(n.criada.slice(0, 10).split('-').reverse().join('/'))}${n.arquivada ? ' · <b>ARQUIVADA</b>' : ''}</div>
      <h1 style="margin-top:8px">${esc(n.titulo || (n.tipo === 'pensamento' ? '' : '(sem título)'))}</h1>
      ${n.tipo === 'livro' ? `<p class="suave">Status: ${esc(n.status || '-')} · Nota: ${n.nota ?? '-'}</p>` : ''}
      ${linkOk ? `<p><a href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">${esc(n.link)}</a></p>` : n.link ? `<p class="suave">${esc(n.link)}</p>` : ''}
      <div class="corpo">${esc(n.corpo)}</div>
      ${n.tags.length ? `<div class="chips">${n.tags.map((t) => `<a class="chip" href="#/lista" data-tag="${esc(t)}">#${esc(t)}</a>`).join('')}</div>` : ''}
      ${n.rever_em ? `<p class="suave">🔔 Rever em ${esc(n.rever_em.split('-').reverse().join('/'))}</p>` : n.revisada_em ? `<p class="suave">✅ Revisada em ${esc(n.revisada_em.split('-').reverse().join('/'))}</p>` : ''}
    </div>
    <div class="acoes">
      <a class="b" href="#/editar/${esc(n.id)}" style="text-align:center">Editar</a>
      <button class="b sec" id="r7">Rever em 7 dias</button>
      <button class="b sec" id="r30">Rever em 30 dias</button>
      ${n.rever_em ? '<button class="b sec" id="visto">Marcar como revisada</button>' : ''}
      <button class="b ${n.arquivada ? 'sec' : 'perigo'}" id="arq">${n.arquivada ? 'Desfazer arquivamento' : 'Arquivar'}</button>
    </div>
    <p class="erro" id="erro" hidden></p>
    <h2>Relacionadas</h2>
    <div class="cartao">${rel.length ? rel.map((r) => linhaNota(r.nota)).join('') : '<div class="vazio">Nada parecido por enquanto.</div>'}</div>`;
  document.querySelectorAll('.chip[data-tag]').forEach((c) => { c.onclick = () => { filtro = { termo: '', tipo: '', tag: c.dataset.tag, arquivadas: false }; }; });
  const mudar = async (campos, msg, ok) => {
    try { await salvarNota({ ...n, ...campos, editada: L.agoraISO() }, msg); aviso(ok); telaNota(id); }
    catch (e) { const er = $('#erro'); er.textContent = e.message; er.hidden = false; }
  };
  $('#r7').onclick = () => mudar({ rever_em: L.addDias(L.hojeISO(), 7), revisada_em: '' }, 'Rever em 7 dias', 'Lembrete marcado para 7 dias');
  $('#r30').onclick = () => mudar({ rever_em: L.addDias(L.hojeISO(), 30), revisada_em: '' }, 'Rever em 30 dias', 'Lembrete marcado para 30 dias');
  const v = $('#visto'); if (v) v.onclick = () => mudar({ rever_em: '', revisada_em: L.hojeISO() }, 'Revisada', 'Marcada como revisada');
  $('#arq').onclick = () => {
    if (!n.arquivada && !confirm('Arquivar esta anotação? Ela some da lista, mas não é apagada e dá para desfazer.')) return;
    mudar({ arquivada: !n.arquivada }, n.arquivada ? 'Desarquivar' : 'Arquivar', n.arquivada ? 'Anotação restaurada' : 'Arquivada (dá para desfazer)');
  };
}

function telaForm(tipo, existente) {
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
      ${tipo === 'video' ? `
        <label for="link">Link do vídeo</label>
        <input id="link" type="url" inputmode="url" required placeholder="Cole o link aqui" value="${esc(n?.link)}">
        <label for="titulo">Título <span class="suave" id="dica"></span></label>
        <input id="titulo" value="${esc(n?.titulo)}">
        <label for="corpo">O que aprendi</label>
        <textarea id="corpo">${esc(n?.corpo)}</textarea>` : ''}
      <label for="tags">Tags</label>
      <input id="tags" value="${esc(tagsExistentes)}" placeholder="#dinheiro #habitos" autocapitalize="off">
      <div class="chips" id="sug"></div>
      ${campoRever}
      <p class="erro" id="erro" hidden></p>
      <div class="acoes"><button class="b" id="ok">Salvar</button><a class="b sec" href="${ed ? '#/nota/' + esc(n.id) : '#/'}" style="text-align:center">Cancelar</a></div>
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
  if (corpoEl && tipo === 'pensamento') corpoEl.oninput = () => sugerir(corpoEl, true);

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

  $('#rever').onchange = (e) => { $('#reverData').hidden = e.target.value !== 'data'; };
  if (n?.rever_em) { $('#rever').value = 'data'; $('#reverData').hidden = false; $('#reverData').value = n.rever_em; }

  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const val = (id) => ($('#' + id)?.value || '').trim();
    const corpo = val('corpo');
    const tags = L.unicos([...L.extrairTags(corpo), ...val('tags').split(/[\s,]+/).map(L.normTag)].filter(Boolean));
    const r = val('rever');
    const rever = r === '7' || r === '30' ? L.addDias(L.hojeISO(), Number(r)) : r === 'data' ? val('reverData') : '';
    const agora = L.agoraISO();
    const base = n ? { ...n } : { id: L.novoId(), tipo, criada: agora, arquivada: false, status: '', nota: null, link: '', titulo: '', revisada_em: '' };
    const nova = { ...base, corpo, tags, rever_em: rever, editada: n ? agora : '' };
    if (tipo === 'livro') { nova.titulo = val('titulo'); nova.status = val('status'); nova.nota = val('nota') === '' ? null : Number(val('nota')); }
    if (tipo === 'video') { nova.link = val('link'); nova.titulo = val('titulo') || nova.link; }
    if (tipo === 'pensamento' && !corpo) return;
    $('#ok').disabled = true; $('#ok').textContent = 'Salvando…';
    try {
      await salvarNota(nova, (n ? 'Editar' : 'Nova') + ' ' + tipo);
      aviso('Salvo ✓');
      location.hash = n ? '#/nota/' + nova.id : '#/';
    } catch (err) {
      const er = $('#erro'); er.textContent = err.message + ' O que você escreveu continua na tela.'; er.hidden = false;
      $('#ok').disabled = false; $('#ok').textContent = 'Salvar';
    }
  };
}

function telaSemana() {
  const r = L.resumoSemana(notas);
  const prompt = L.promptParaClaude(r);
  app.innerHTML = `
    <h1>Semana</h1>
    <p class="suave">De ${esc(r.desde.split('-').reverse().join('/'))} até hoje · ${r.daSemana.length} anotação(ões)</p>
    <h2>Temas mais frequentes</h2>
    <div class="cartao">${r.temas.length ? `<div class="chips">${r.temas.slice(0, 12).map(([t, q]) => `<span class="chip">#${esc(t)} ×${q}</span>`).join('')}</div>` : '<div class="vazio">Sem tags nesta semana.</div>'}</div>
    <h2>Ideias que se conectam</h2>
    <div class="cartao">${r.conexoes.length ? r.conexoes.map((c) => `<p><b>#${esc(c.tag)}</b></p>${c.notas.map((n) => linhaNota(n)).join('')}`).join('') : '<div class="vazio">Use a mesma tag em duas anotações para ver conexões aqui.</div>'}</div>
    <h2>O que anotei</h2>
    <div class="cartao">${r.daSemana.length ? r.daSemana.map((n) => linhaNota(n)).join('') : '<div class="vazio">Nenhuma anotação nesta semana.</div>'}</div>
    <h2>Análise do Claude</h2>
    <div class="cartao">
      <p class="suave">Copie o texto abaixo e cole numa conversa com o Claude. Ele resume a semana e acha conexões. Nada é enviado automaticamente.</p>
      <div class="acoes"><button class="b" id="copiar">Copiar para o Claude</button></div>
      <pre class="copia" id="prev">${esc(prompt)}</pre>
    </div>`;
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
