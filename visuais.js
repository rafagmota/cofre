// Cofre - desenhos leves (SVG e HTML puros, sem bibliotecas). Só leem os números de lib.js; não gravam nada.
import * as L from './lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dataBR = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const diaDaSemana = (iso) => DIAS[new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)).getDay()];
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// ---------- calendário de constância ----------
const CEL = 10, PASSO = 12, COLS = 53;
export function calendario(c) {
  const quartis = (n) => (n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4);
  const hoje = c.dias[c.dias.length - 1]?.dia;
  const quadrados = c.dias.map((x, i) => {
    const col = Math.floor(i / 7), lin = i % 7;
    return `<rect class="n${quartis(x.n)}${x.dia === hoje ? ' hoje' : ''}" x="${col * PASSO}" y="${lin * PASSO}" width="${CEL}" height="${CEL}" rx="2.5"/>`;
  }).join('');
  const rotulos = [];
  for (let col = 0; col < COLS; col++) {
    const d = c.dias[col * 7]; if (!d) break;
    if (+d.dia.slice(8, 10) <= 7 && col > 0) rotulos.push(`<span style="left:${(col / COLS * 100).toFixed(2)}%">${MESES[+d.dia.slice(5, 7) - 1]}</span>`);
  }
  const resumo = c.diasComNota
    ? `Você anotou em ${plural(c.diasComNota, 'dia', 'dias')} dos últimos ${c.dias.length}.${c.sequencia > 1 ? ` Sequência atual: ${c.sequencia} dias.` : ''}`
    : 'Anote hoje para acender o primeiro quadradinho.';
  return `<div class="cal">
    <svg viewBox="0 0 ${COLS * PASSO - 2} ${7 * PASSO - 2}" role="img" aria-label="Calendário do último ano: ${esc(resumo)}">${quadrados}</svg>
    <div class="cal-meses" aria-hidden="true">${rotulos.join('')}</div>
    <p class="suave" id="cal-info" aria-live="polite">${esc(resumo)}</p>
  </div>`;
}
// Toque num quadradinho mostra o dia e quantas anotações teve.
export function ligarCalendario(raiz, c) {
  const svg = raiz.querySelector('.cal svg'), info = raiz.querySelector('#cal-info');
  if (!svg || !info) return;
  const padrao = info.textContent;
  svg.addEventListener('click', (e) => {
    const r = svg.getBoundingClientRect();
    const col = Math.floor(((e.clientX - r.left) / r.width) * (COLS * PASSO - 2) / PASSO);
    const lin = Math.floor(((e.clientY - r.top) / r.height) * (7 * PASSO - 2) / PASSO);
    const x = c.dias[col * 7 + lin];
    info.textContent = x ? `${diaDaSemana(x.dia)}, ${dataBR(x.dia)} · ${x.n ? plural(x.n, 'anotação', 'anotações') : 'nenhuma anotação'}` : padrao;
  });
}

// ---------- barras da semana ----------
export function barrasDaSemana(s) {
  const topo = Math.max(3, s.max);
  const colunas = s.dias.map((d, i) => {
    const seg = Object.keys(L.TIPOS).map((t) => (d[t] ? `<i class="t-${t}" style="height:${(d[t] / topo * 100).toFixed(1)}%"></i>` : '')).join('');
    const rotulo = `${diaDaSemana(d.dia)} ${dataBR(d.dia)}: ${d.total ? plural(d.total, 'anotação', 'anotações') : 'nenhuma anotação'}`;
    return `<div class="dia${i === s.dias.length - 1 ? ' hoje' : ''}" role="img" aria-label="${esc(rotulo)}">
      <b>${d.total || ''}</b><div class="pilha">${seg}</div><span>${diaDaSemana(d.dia)}</span></div>`;
  }).join('');
  const legenda = Object.entries(L.TIPOS).map(([k, v]) => `<span><i class="t-${k}"></i>${v.nome.toLowerCase()}</span>`).join('');
  return `<div class="barras">${colunas}</div><div class="legenda">${legenda}</div>`;
}

// ---------- capas e miniaturas ----------
function quebrar(texto, largura, maxLinhas) {
  const linhas = []; let atual = '';
  for (const p of String(texto).trim().split(/\s+/)) {
    const palavra = p.length > largura ? p.slice(0, largura - 1) + '…' : p;
    if (!atual) atual = palavra;
    else if ((atual + ' ' + palavra).length <= largura) atual += ' ' + palavra;
    else { linhas.push(atual); atual = palavra; }
  }
  if (atual) linhas.push(atual);
  if (linhas.length > maxLinhas) { linhas.length = maxLinhas; linhas[maxLinhas - 1] = linhas[maxLinhas - 1].replace(/.?$/, '…'); }
  return linhas;
}
export const tomDoLivro = (titulo) => L.hashTexto(titulo || 'livro') % 5;

// Capa de livro desenhada na hora a partir do título (o mesmo título sempre dá a mesma cor).
export function capaLivro(titulo, classe = '') {
  const linhas = quebrar(titulo || 'Livro', 10, 4);
  const y0 = 42 - ((linhas.length - 1) * 8.5) / 2;
  const texto = linhas.map((l, i) => `<text x="33" y="${(y0 + i * 8.5).toFixed(1)}" text-anchor="middle">${esc(l)}</text>`).join('');
  return `<svg class="capa t${tomDoLivro(titulo)} ${classe}" viewBox="0 0 60 84" aria-hidden="true" focusable="false">
    <rect class="fd" width="60" height="84" rx="3"/><rect class="lomb" width="5" height="84" rx="2.5"/>
    <path class="fio" d="M16 20h34M16 64h34"/>${texto}</svg>`;
}

const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9.5 7.5v9l7.5-4.5z"/></svg>';
// Miniatura do vídeo: a imagem do YouTube quando o link é de lá; senão (ou se não carregar) um selo genérico de vídeo.
export function miniaturaVideo(link, classe = '') {
  const id = L.idDoYoutube(link);
  return `<span class="mini ${classe}"${id ? ` data-yt="${esc(id)}"` : ''}><span class="play">${PLAY}</span></span>`;
}
// Carrega as imagens só depois (preguiçoso). Se falhar, fica o selo genérico.
export function armarImagens(raiz) {
  raiz.querySelectorAll('.mini[data-yt]').forEach((m) => {
    if (m.querySelector('img')) return;
    const img = new Image();
    img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; img.width = 320; img.height = 180;
    img.onload = () => m.classList.add('com-foto');
    img.onerror = () => img.remove();
    img.src = L.miniaturaYoutube(m.dataset.yt);
    m.prepend(img);
  });
}

// ---------- estante ----------
export function lendoAgora(lista) {
  return `<div class="trilho">${lista.map((n) => `<a class="lv" href="#/nota/${esc(n.id)}">${capaLivro(n.titulo, 'g')}<span class="tl">${esc(L.tituloExibido(n))}</span></a>`).join('')}</div>`;
}
export function estanteLidos(e) {
  const mostrar = e.lidos.slice(0, 30);
  const lombadas = mostrar.map((n) => {
    const h = L.hashTexto(n.titulo);
    return `<a class="lombada t${tomDoLivro(n.titulo)}" href="#/nota/${esc(n.id)}" style="--w:${40 + (h % 9)}px;--h:${104 + (h >> 3) % 26}px" aria-label="${esc(L.tituloExibido(n))}${n.nota !== null ? ', nota ' + n.nota : ''}">
      <span class="lt">${esc(L.tituloExibido(n))}</span>${n.nota !== null ? `<span class="ln">${n.nota}</span>` : ''}</a>`;
  }).join('');
  const media = e.media === null ? '' : ` · nota média ${e.media.toFixed(1).replace('.', ',')}`;
  return `<div class="estante">${lombadas}</div><p class="suave">${plural(e.lidos.length, 'livro lido', 'livros lidos')}${media}${e.lidos.length > mostrar.length ? ` · mostrando os ${mostrar.length} mais recentes` : ''}</p>`;
}

// ---------- mapa de conexões ----------
const LARG = 340, ALT = 270;
function posicionar(nos, fios) {
  const n = nos.length, topo = Math.max(...nos.map((x) => x.q));
  const P = nos.map((x, i) => {
    const r = 17 + 15 * Math.sqrt(x.q / topo), ang = (2 * Math.PI * i) / n - Math.PI / 2;
    return { ...x, r, w: Math.max(2 * r, (x.tag.length + 1) * 6.6), h: 2 * r + 18, x: LARG / 2 + Math.cos(ang) * 105, y: ALT / 2 - 8 + Math.sin(ang) * 85, vx: 0, vy: 0 };
  });
  if (n === 1) { P[0].x = LARG / 2; P[0].y = ALT / 2 - 10; return P; }
  const porNome = new Map(P.map((p) => [p.tag, p]));
  for (let it = 0, calor = 1; it < 260; it++, calor = 1 - it / 260) {
    for (const p of P) { p.vx += (LARG / 2 - p.x) * 0.004; p.vy += (ALT / 2 - 8 - p.y) * 0.004; }
    for (const f of fios) { // fios puxam as bolhas ligadas para perto
      const a = porNome.get(f.a), b = porNome.get(f.b);
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, alvo = a.r + b.r + 60, k = (d - alvo) * 0.006;
      a.vx += (dx / d) * k; a.vy += (dy / d) * k; b.vx -= (dx / d) * k; b.vy -= (dy / d) * k;
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { // bolhas e rótulos não se sobrepõem
      const a = P[i], b = P[j];
      const ox = (a.w + b.w) / 2 + 14 - Math.abs(b.x - a.x), oy = (a.h + b.h) / 2 + 12 - Math.abs(b.y - a.y);
      if (ox > 0 && oy > 0) {
        if (ox < oy) { const s = (b.x >= a.x ? 1 : -1) * ox * 0.25; a.vx -= s; b.vx += s; }
        else { const s = (b.y >= a.y ? 1 : -1) * oy * 0.25; a.vy -= s; b.vy += s; }
      }
    }
    for (const p of P) {
      p.x += p.vx * 0.5 * calor + 0.001; p.y += p.vy * 0.5 * calor; p.vx *= 0.6; p.vy *= 0.6;
      p.x = Math.min(LARG - p.w / 2 - 4, Math.max(p.w / 2 + 4, p.x));
      p.y = Math.min(ALT - p.r - 22, Math.max(p.r + 4, p.y));
    }
  }
  // centraliza o conjunto (bolhas + rótulos) dentro da moldura
  const x0 = Math.min(...P.map((p) => p.x - p.w / 2)), x1 = Math.max(...P.map((p) => p.x + p.w / 2));
  const y0 = Math.min(...P.map((p) => p.y - p.r)), y1 = Math.max(...P.map((p) => p.y + p.r + 20));
  const dx = (LARG - (x1 - x0)) / 2 - x0, dy = (ALT - (y1 - y0)) / 2 - y0;
  for (const p of P) { p.x += dx; p.y += dy; }
  return P;
}
export function mapaDeTags(mapa) {
  if (!mapa.nos.length) return '';
  const P = posicionar(mapa.nos, mapa.fios), por = new Map(P.map((p) => [p.tag, p]));
  const fios = mapa.fios.map((f) => { const a = por.get(f.a), b = por.get(f.b); return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke-width="${Math.min(4, 0.9 + f.peso * 0.7).toFixed(1)}"/>`; }).join('');
  const bolhas = P.map((p) => `<g class="no" data-tag="${esc(p.tag)}" tabindex="0" role="button" aria-pressed="false" aria-label="#${esc(p.tag)}, ${plural(p.q, 'anotação', 'anotações')}">
      <circle class="toque" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${Math.max(p.r, 24).toFixed(1)}"/>
      <circle class="bol" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.r.toFixed(1)}"/>
      <text class="qt" x="${p.x.toFixed(1)}" y="${(p.y + 5).toFixed(1)}" text-anchor="middle">${p.q}</text>
      <text class="rot" x="${p.x.toFixed(1)}" y="${(p.y + p.r + 15).toFixed(1)}" text-anchor="middle">#${esc(p.tag)}</text></g>`).join('');
  return `<svg class="mapa" viewBox="0 0 ${LARG} ${ALT}" role="group" aria-label="Mapa de tags: cada bolha é uma tag, fios ligam tags que aparecem juntas"><g class="fios">${fios}</g>${bolhas}</svg>`;
}
// Toque (ou Enter) numa bolha: marca e avisa quem chamou.
export function ligarMapa(raiz, aoEscolher) {
  const svg = raiz.querySelector('svg.mapa'); if (!svg) return;
  const escolher = (g) => {
    const ja = g.classList.contains('on');
    svg.querySelectorAll('.no').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
    if (!ja) { g.classList.add('on'); g.setAttribute('aria-pressed', 'true'); }
    aoEscolher(ja ? '' : g.dataset.tag);
  };
  svg.addEventListener('click', (e) => { const g = e.target.closest('.no'); if (g) escolher(g); });
  svg.addEventListener('keydown', (e) => { if (e.key !== 'Enter' && e.key !== ' ') return; const g = e.target.closest('.no'); if (g) { e.preventDefault(); escolher(g); } });
}

// ---------- cursos e eventos ----------
const textoProgresso = (p) => (p.total ? `${p.feitas} de ${p.total} aulas` : p.feitas ? `${plural(p.feitas, 'aula', 'aulas')} assistidas` : '');
const barra = (p) => (p.pct === null ? '' : `<span class="prog" role="img" aria-label="${p.pct}% concluído"><i style="width:${p.pct}%"></i></span>`);
export function cursosAgora(lista) {
  return lista.map((n) => {
    const p = L.progressoCurso(n), sub = [n.plataforma, textoProgresso(p)].filter(Boolean).join(' · ');
    return `<a class="curso" href="#/nota/${esc(n.id)}"><span class="tx">${esc(L.tituloExibido(n))}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}${barra(p)}</a>`;
  }).join('');
}
export function detalheCurso(n) {
  const p = L.progressoCurso(n);
  const linha = [n.plataforma, n.status, textoProgresso(p) + (p.pct !== null ? ` (${p.pct}%)` : '')].filter(Boolean).join(' · ');
  return `<p class="suave">${esc(linha)}</p>${barra(p)}`;
}
export function detalheEvento(n) {
  const hoje = L.hojeISO(), prox = L.proximaOcorrencia(n, hoje);
  const dia = n.data ? `${diaDaSemana(n.data)}, ${dataBR(n.data)}/${n.data.slice(0, 4)}${n.hora ? ' às ' + n.hora : ''}` : '';
  const rep = n.repete !== 'nao' ? ` · ${L.REPETE[n.repete]}` : '';
  const quando = prox ? `Próxima vez: ${L.quandoTexto(prox, hoje) || diaDaSemana(prox) + ', ' + dataBR(prox)}` : 'Este evento já passou.';
  return `<p class="suave">${esc(dia + rep)}</p><p class="suave"><b>${esc(quando)}</b></p>`;
}
