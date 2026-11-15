// Cofre - regras do app (sem tela). Usado pelo app e pelos testes.
export const TIPOS = {
  pensamento: { nome: 'Pensamento', icone: '💭' },
  livro: { nome: 'Livro', icone: '📖' },
  video: { nome: 'Vídeo', icone: '▶️' },
  curso: { nome: 'Curso', icone: '🎓' },
  evento: { nome: 'Evento', icone: '🗓️' },
  trecho: { nome: 'Trecho', icone: '✍️' },
};
export const STATUS = ['lendo', 'lido', 'abandonado'];
export const STATUS_CURSO = ['assistindo', 'concluído', 'pausado'];
export const REPETE = { nao: 'não repete', semana: 'toda semana', mes: 'todo mês', ano: 'todo ano' };

const pad = (n) => String(n).padStart(2, '0');
export const hojeISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const agoraISO = (d = new Date()) => `${hojeISO(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
export function addDias(iso, n) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return hojeISO(new Date(y, m - 1, d + n));
}
export const novoId = (d = new Date()) =>
  agoraISO(d).replace(/[-:]/g, '').replace('T', '-') + '-' + Math.random().toString(36).slice(2, 6);
export const caminhoDaNota = (id) => `notas/${id.slice(0, 4)}/${id}.md`;

export const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const normTag = (t) => String(t || '').toLowerCase().replace(/^#+/, '').replace(/[^\p{L}\p{N}_-]/gu, '');
export function extrairTags(texto) {
  const out = [];
  for (const m of String(texto || '').matchAll(/(^|\s)#([\p{L}\p{N}_-]+)/gu)) out.push(normTag(m[2]));
  return out.filter(Boolean);
}
export const unicos = (a) => [...new Set(a)];

export function lerNota(texto, caminho = '') {
  const t = String(texto).replace(/\r\n/g, '\n');
  const m = t.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta = {};
  let corpo = t;
  if (m) {
    for (const linha of m[1].split('\n')) {
      const i = linha.indexOf(':');
      if (i > 0) meta[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
    }
    corpo = m[2].replace(/^\n/, '').replace(/\n+$/, '');
  }
  const id = meta.id || caminho.split('/').pop().replace(/\.md$/, '');
  const numero = (v) => { if (v === undefined || v === '') return null; const x = Number(v); return Number.isFinite(x) ? x : null; };
  const nota = meta.nota === undefined || meta.nota === '' ? null : Number(meta.nota);
  return {
    id, caminho,
    tipo: TIPOS[meta.tipo] ? meta.tipo : 'pensamento',
    titulo: meta.titulo || '',
    status: meta.status || '',
    nota: Number.isFinite(nota) ? nota : null,
    link: meta.link || '',
    plataforma: meta.plataforma || '',
    aulas_feitas: numero(meta.aulas_feitas),
    aulas_total: numero(meta.aulas_total),
    data: meta.data || '',
    hora: meta.hora || '',
    repete: REPETE[meta.repete] ? meta.repete : 'nao',
    fonte: meta.fonte || '',
    fonte_id: meta.fonte_id || '',
    local: meta.local || '',
    tags: unicos((meta.tags || '').split(',').map(normTag).filter(Boolean)),
    criada: meta.criada || '',
    editada: meta.editada || '',
    rever_em: meta.rever_em || '',
    revisada_em: meta.revisada_em || '',
    arquivada: meta.arquivada === 'sim',
    corpo,
  };
}

export function escreverNota(n) {
  const L = ['---', `id: ${n.id}`, `tipo: ${n.tipo}`];
  const add = (k, v) => { if (v !== undefined && v !== null && v !== '') L.push(`${k}: ${String(v).replace(/\n/g, ' ')}`); };
  add('titulo', n.titulo); add('status', n.status); add('nota', n.nota); add('link', n.link);
  add('plataforma', n.plataforma); add('aulas_feitas', n.aulas_feitas); add('aulas_total', n.aulas_total);
  add('data', n.data); add('hora', n.hora); add('repete', n.repete === 'nao' ? '' : n.repete);
  add('fonte', n.fonte); add('fonte_id', n.fonte_id); add('local', n.local);
  add('tags', (n.tags || []).join(', '));
  add('criada', n.criada); add('editada', n.editada); add('rever_em', n.rever_em); add('revisada_em', n.revisada_em);
  L.push(`arquivada: ${n.arquivada ? 'sim' : 'nao'}`, '---', '', n.corpo || '');
  return L.join('\n').replace(/\n*$/, '\n');
}

export function tituloExibido(n) {
  if (n.titulo) return n.titulo;
  const linha = (n.corpo || '').split('\n').find((l) => l.trim()) || '(sem texto)';
  return linha.length > 80 ? linha.slice(0, 77) + '…' : linha;
}

export const maisRecentesPrimeiro = (a, b) => (b.criada || '').localeCompare(a.criada || '');

export function buscar(notas, { termo = '', tipo = '', tag = '', arquivadas = false } = {}) {
  const palavras = semAcento(termo).split(/\s+/).filter(Boolean);
  return notas
    .filter((n) => (arquivadas ? n.arquivada : !n.arquivada))
    .filter((n) => !tipo || n.tipo === tipo)
    .filter((n) => !tag || n.tags.includes(tag))
    .filter((n) => {
      if (!palavras.length) return true;
      const palheiro = semAcento([n.titulo, n.corpo, n.link, n.fonte, n.local, n.tags.join(' ')].join(' '));
      return palavras.every((p) => palheiro.includes(p));
    })
    .sort(maisRecentesPrimeiro);
}

export function contarTags(notas) {
  const c = new Map();
  for (const n of notas) if (!n.arquivada) for (const t of n.tags) c.set(t, (c.get(t) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function sugerirTags(notas, prefixo = '', jaUsadas = []) {
  const p = normTag(prefixo);
  return contarTags(notas).map(([t]) => t).filter((t) => !jaUsadas.includes(t) && (!p || t.startsWith(p))).slice(0, 8);
}

const PARADAS = new Set('para como mais mas com uma que dos das nos nas por sobre entre isso esse essa este esta muito tambem ainda quando onde porque cada todo toda todos todas sem ser ter foi sao tem vai fazer pelo pela'.split(' '));
const palavrasChave = (n) => new Set(
  semAcento([n.titulo, n.corpo].join(' ')).split(/[^a-z0-9]+/).filter((w) => w.length >= 5 && !PARADAS.has(w)));

export function relacionadas(nota, todas, limite = 5) {
  const pn = palavrasChave(nota);
  return todas
    .filter((o) => o.id !== nota.id && !o.arquivada)
    .map((o) => {
      const tagsComuns = o.tags.filter((t) => nota.tags.includes(t));
      let palavrasComuns = 0;
      for (const w of palavrasChave(o)) if (pn.has(w)) palavrasComuns++;
      const mesmaFonte = (nota.tipo === 'trecho' && o.tipo === 'trecho' && ((nota.fonte_id && nota.fonte_id === o.fonte_id) || (!nota.fonte_id && nota.fonte && semAcento(nota.fonte) === semAcento(o.fonte)))) ? 3 : 0;
      return { nota: o, tagsComuns, score: tagsComuns.length * 3 + palavrasComuns + mesmaFonte };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || maisRecentesPrimeiro(a.nota, b.nota))
    .slice(0, limite);
}

export const lembretesDeHoje = (notas, hoje = hojeISO()) =>
  notas.filter((n) => !n.arquivada && n.rever_em && n.rever_em <= hoje).sort((a, b) => a.rever_em.localeCompare(b.rever_em));

export function resumoSemana(notas, hoje = hojeISO(), dias = 7) {
  const desde = addDias(hoje, -(dias - 1));
  const daSemana = notas.filter((n) => !n.arquivada && n.criada.slice(0, 10) >= desde).sort(maisRecentesPrimeiro);
  const temas = contarTags(daSemana);
  const conexoes = temas.filter(([, q]) => q >= 2).map(([tag]) => ({ tag, notas: daSemana.filter((n) => n.tags.includes(tag)) }));
  return { desde, hoje, daSemana, temas, conexoes };
}

export function promptParaClaude(resumo) {
  const linhas = resumo.daSemana.map((n) => {
    const partes = [`- [${TIPOS[n.tipo].nome}] ${n.criada.slice(0, 10)} — ${tituloExibido(n)}`];
    if (n.tags.length) partes.push(`  tags: ${n.tags.map((t) => '#' + t).join(' ')}`);
    if (n.tipo === 'livro' && (n.status || n.nota !== null)) partes.push(`  status: ${n.status || '-'}; nota: ${n.nota ?? '-'}`);
    if (n.link) partes.push(`  link: ${n.link}`);
    if (n.tipo === 'trecho' && (n.fonte || n.local)) partes.push(`  fonte: ${[n.fonte, n.local].filter(Boolean).join(', ')}`);
    if (n.corpo && n.corpo !== tituloExibido(n)) partes.push('  ' + n.corpo.replace(/\n/g, '\n  '));
    return partes.join('\n');
  });
  return `Você é meu assistente de reflexão. Abaixo estão minhas anotações pessoais de ${resumo.desde} a ${resumo.hoje} (pensamentos, livros, vídeos, cursos e trechos/insights de leituras).

Por favor, em português simples:
1. Resuma a semana em poucas linhas.
2. Mostre os temas que mais se repetem.
3. Encontre conexões entre ideias que eu talvez não tenha percebido (inclusive entre livros, vídeos e pensamentos).
4. Aponte 2 ou 3 perguntas que valem a pena eu pensar na próxima semana.

ANOTAÇÕES:
${linhas.join('\n') || '(nenhuma anotação nesta semana)'}
`;
}

export function totais(notas) {
  const ativas = notas.filter((n) => !n.arquivada);
  return {
    pensamento: ativas.filter((n) => n.tipo === 'pensamento').length,
    livro: ativas.filter((n) => n.tipo === 'livro').length,
    video: ativas.filter((n) => n.tipo === 'video').length,
    arquivadas: notas.length - ativas.length,
  };
}

// ---------- números para os visuais (só leitura: contam, nunca gravam) ----------
const ativas = (notas) => notas.filter((n) => !n.arquivada && n.criada);

// Calendário: 53 semanas (segunda a domingo) terminando hoje.
export function constancia(notas, hoje = hojeISO()) {
  const porDia = new Map();
  for (const n of ativas(notas)) { const d = n.criada.slice(0, 10); porDia.set(d, (porDia.get(d) || 0) + 1); }
  const [y, m, d] = hoje.split('-').map(Number);
  const desdeSegunda = (new Date(y, m - 1, d).getDay() + 6) % 7;
  const inicio = addDias(hoje, -desdeSegunda - 52 * 7);
  const dias = [];
  for (let i = 0; i < 53 * 7; i++) {
    const dia = addDias(inicio, i);
    if (dia > hoje) break;
    dias.push({ dia, n: porDia.get(dia) || 0 });
  }
  let sequencia = 0;
  let c = porDia.has(hoje) ? hoje : addDias(hoje, -1);
  while (porDia.has(c)) { sequencia++; c = addDias(c, -1); }
  return { inicio, dias, diasComNota: dias.filter((x) => x.n > 0).length, sequencia, max: Math.max(0, ...dias.map((x) => x.n)) };
}

// Barras da semana: quantas anotações por dia e por tipo.
export function semanaPorDia(notas, hoje = hojeISO(), dias = 7) {
  const lista = [];
  for (let i = dias - 1; i >= 0; i--) lista.push({ dia: addDias(hoje, -i), ...Object.fromEntries(Object.keys(TIPOS).map((t) => [t, 0])), total: 0 });
  const porDia = new Map(lista.map((x) => [x.dia, x]));
  for (const n of ativas(notas)) {
    const x = porDia.get(n.criada.slice(0, 10));
    if (x) { x[n.tipo]++; x.total++; }
  }
  return { dias: lista, max: Math.max(0, ...lista.map((x) => x.total)) };
}

// Estante: o que está sendo lido, o que já foi lido e a nota média dos lidos.
export function estante(notas) {
  const livros = ativas(notas).filter((n) => n.tipo === 'livro').sort(maisRecentesPrimeiro);
  const lendo = livros.filter((n) => n.status === 'lendo');
  const lidos = livros.filter((n) => n.status === 'lido');
  const notasDosLidos = lidos.map((n) => n.nota).filter((x) => x !== null);
  const media = notasDosLidos.length ? notasDosLidos.reduce((a, b) => a + b, 0) / notasDosLidos.length : null;
  return { lendo, lidos, media };
}

// Mapa: tags usadas em 2+ anotações (bolhas) e quantas anotações cada par de tags divide (fios).
export function mapaTags(notas, { desde = '', max = 10 } = {}) {
  const base = ativas(notas).filter((n) => !desde || n.criada.slice(0, 10) >= desde);
  const nos = contarTags(base).filter(([, q]) => q >= 2).slice(0, max).map(([tag, q]) => ({ tag, q }));
  const nomes = new Set(nos.map((x) => x.tag));
  const pares = new Map();
  for (const n of base) {
    const ts = n.tags.filter((t) => nomes.has(t)).sort();
    for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
      const k = ts[i] + '\u0000' + ts[j]; pares.set(k, (pares.get(k) || 0) + 1);
    }
  }
  const fios = [...pares].map(([k, peso]) => { const [a, b] = k.split('\u0000'); return { a, b, peso }; });
  return { nos, fios, base };
}

// Imagens: capa gerada para livro; miniatura do YouTube a partir do link (nada é gravado).
export function hashTexto(s) {
  let h = 5381;
  for (const c of String(s || '')) h = ((h * 33) ^ c.codePointAt(0)) >>> 0;
  return h;
}
export function idDoYoutube(link) {
  try {
    const u = new URL(link);
    const h = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
    let id = '';
    if (h === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
      else { const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/?]+)/); if (m) id = m[2]; }
    }
    return /^[\w-]{6,15}$/.test(id) ? id : '';
  } catch { return ''; }
}
export const miniaturaYoutube = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

// ---------- cursos e eventos ----------
export function progressoCurso(n) {
  const feitas = n.aulas_feitas ?? 0, total = n.aulas_total || 0;
  return { feitas, total, pct: total ? Math.min(100, Math.round((feitas / total) * 100)) : null };
}
export const cursosEmAndamento = (notas) =>
  notas.filter((n) => !n.arquivada && n.tipo === 'curso' && n.status === 'assistindo')
    .sort((a, b) => (b.editada || b.criada || '').localeCompare(a.editada || a.criada || ''));

export const diasEntre = (a, b) => {
  const [y1, m1, d1] = a.slice(0, 10).split('-').map(Number), [y2, m2, d2] = b.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
};
// soma meses mantendo o dia (31 em mês de 30 dias vira 30)
export function addMeses(iso, k) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const alvo = new Date(y, m - 1 + k, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  return hojeISO(new Date(alvo.getFullYear(), alvo.getMonth(), Math.min(d, ultimo)));
}
// próxima data em que o evento acontece (hoje conta); '' se já passou e não repete
export function proximaOcorrencia(n, hoje = hojeISO()) {
  if (n.tipo !== 'evento' || !n.data) return '';
  if (n.data >= hoje) return n.data;
  if (n.repete === 'semana') return addDias(n.data, Math.ceil(diasEntre(n.data, hoje) / 7) * 7);
  if (n.repete === 'mes' || n.repete === 'ano') {
    const passo = n.repete === 'ano' ? 12 : 1;
    const [y1, m1] = n.data.split('-').map(Number), [y2, m2] = hoje.split('-').map(Number);
    let k = Math.max(0, Math.floor(((y2 - y1) * 12 + (m2 - m1)) / passo) * passo);
    while (addMeses(n.data, k) < hoje) k += passo;
    return addMeses(n.data, k);
  }
  return '';
}
export function proximosEventos(notas, hoje = hojeISO(), limite = 5) {
  return notas.filter((n) => !n.arquivada && n.tipo === 'evento')
    .map((nota) => ({ nota, quando: proximaOcorrencia(nota, hoje) }))
    .filter((x) => x.quando)
    .sort((a, b) => (a.quando + (a.nota.hora || '99')).localeCompare(b.quando + (b.nota.hora || '99')))
    .slice(0, limite);
}
export function quandoTexto(dataISO, hoje = hojeISO()) {
  const d = diasEntre(hoje, dataISO);
  return d === 0 ? 'hoje' : d === 1 ? 'amanhã' : d > 1 && d < 7 ? `em ${d} dias` : d < 0 ? 'passou' : '';
}

// Arquivo .ics: o iPhone abre no Calendário, que toca o alarme mesmo com o Cofre fechado.
const icsTexto = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
const dobrar = (linha) => (linha.match(/.{1,60}/gsu) || ['']).join('\r\n ');
const aaaammdd = (iso) => iso.slice(0, 10).replace(/-/g, '');
export function eventoParaICS(n, agora = new Date()) {
  const carimbo = agora.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const L2 = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cofre//PT-BR//', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:${n.id}@cofre`, `DTSTAMP:${carimbo}`];
  if (n.hora) {
    const [y, m, d] = n.data.split('-').map(Number), [h, mi] = n.hora.split(':').map(Number);
    const f = (dt) => `${hojeISO(dt).replace(/-/g, '')}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
    L2.push(`DTSTART:${f(new Date(y, m - 1, d, h, mi))}`, `DTEND:${f(new Date(y, m - 1, d, h + 1, mi))}`);
  } else {
    L2.push(`DTSTART;VALUE=DATE:${aaaammdd(n.data)}`, `DTEND;VALUE=DATE:${aaaammdd(addDias(n.data, 1))}`);
  }
  const freq = { semana: 'WEEKLY', mes: 'MONTHLY', ano: 'YEARLY' }[n.repete];
  if (freq) L2.push(`RRULE:FREQ=${freq}`);
  L2.push(`SUMMARY:${icsTexto(tituloExibido(n))}`);
  if (n.corpo) L2.push(`DESCRIPTION:${icsTexto(n.corpo)}`);
  L2.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsTexto(tituloExibido(n))}`, n.hora ? 'TRIGGER:-PT30M' : 'TRIGGER;RELATED=START:PT9H', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
  return L2.map(dobrar).join('\r\n') + '\r\n';
}

// ---------- trechos / insights (passagens de livros, vídeos e cursos) ----------
export const TIPOS_DE_FONTE = ['livro', 'video', 'curso'];

// Fontes que podem receber trechos (mais recentes primeiro) — alimenta a lista de sugestões do formulário.
export const fontesDisponiveis = (notas) =>
  notas.filter((n) => !n.arquivada && TIPOS_DE_FONTE.includes(n.tipo) && n.titulo)
    .sort((a, b) => (b.editada || b.criada || '').localeCompare(a.editada || a.criada || ''));

// Acha a anotação-fonte de um trecho: pelo id guardado ou, na falta dele, pelo nome igual.
export function fonteDoTrecho(trecho, notas) {
  if (trecho.fonte_id) { const p = notas.find((n) => n.id === trecho.fonte_id); if (p) return p; }
  const nome = semAcento(trecho.fonte);
  return nome ? fontesDisponiveis(notas).find((n) => semAcento(n.titulo) === nome) || null : null;
}

// Trechos de um livro/vídeo/curso, na ordem em que foram anotados.
export const trechosDaFonte = (fonte, notas) =>
  notas.filter((n) => !n.arquivada && n.tipo === 'trecho' && (n.fonte_id === fonte.id || (!n.fonte_id && n.fonte && semAcento(n.fonte) === semAcento(fonte.titulo))))
    .sort((a, b) => (a.criada || '').localeCompare(b.criada || ''));

const nomeDaFonte = (t, fonteNota) => {
  const titulo = fonteNota?.titulo || t.fonte;
  if (!titulo) return '';
  const tipo = fonteNota ? { livro: 'livro', video: 'vídeo', curso: 'curso' }[fonteNota.tipo] + ' ' : '';
  return `${tipo}“${titulo}”${t.local ? ` (${t.local})` : ''}`;
};

// Texto pronto para colar no Claude e aprofundar UM trecho (o Claude pesquisa e estende a ideia).
export function promptAprofundar(trecho, notas = []) {
  const fonte = fonteDoTrecho(trecho, notas);
  const origem = nomeDaFonte(trecho, fonte);
  const rel = relacionadas(trecho, notas, 3).map((r) => `- ${tituloExibido(r.nota)}${r.nota.tags.length ? ' ' + r.nota.tags.map((t) => '#' + t).join(' ') : ''}`);
  return `Quero aprofundar um insight que anotei${origem ? ' em ' + origem : ''}.

O QUE REGISTREI:
${trecho.corpo || tituloExibido(trecho)}
${trecho.tags.length ? '\nTags: ' + trecho.tags.map((t) => '#' + t).join(' ') + '\n' : ''}${rel.length ? '\nOutras anotações minhas que podem se conectar:\n' + rel.join('\n') + '\n' : ''}
Por favor, em português simples:
1. Explique a ideia com outras palavras e dê um exemplo do dia a dia (se fizer sentido, ligado a finanças ou contabilidade).
2. Se tiver acesso à internet, pesquise e traga contexto: de onde vem a ideia, autores ou estudos relacionados, críticas e limites. Cite as fontes.
3. Mostre como ela se conecta às minhas outras anotações acima.
4. Sugira 3 perguntas para eu refletir e 1 pequena ação prática para testar a ideia.
5. Indique 2 ou 3 leituras ou vídeos para estender o tema.
`;
}

// Todos os trechos de uma fonte juntos, para o Claude organizar e estender.
export function promptTrechos(fonte, trechos) {
  const itens = trechos.map((t, i) => `${i + 1}. ${t.local ? `[${t.local}] ` : ''}${(t.corpo || tituloExibido(t)).replace(/\n/g, '\n   ')}${t.tags.length ? `\n   tags: ${t.tags.map((x) => '#' + x).join(' ')}` : ''}`);
  const tipo = { livro: 'livro', video: 'vídeo', curso: 'curso' }[fonte.tipo] || 'material';
  return `Estes são os trechos e insights que registrei do ${tipo} “${fonte.titulo}”.

${itens.join('\n\n') || '(nenhum trecho ainda)'}

Por favor, em português simples:
1. Resuma as ideias centrais que eu destaquei.
2. Agrupe os trechos por tema e mostre como eles se conectam.
3. Aponte o que eu parecia valorizar mais e se há ideias que se contradizem.
4. Se tiver acesso à internet, pesquise e traga contexto, críticas e leituras complementares sobre esses temas. Cite as fontes.
5. Sugira como aplicar 2 ou 3 dessas ideias na minha rotina e 3 perguntas para eu pensar.
`;
}
