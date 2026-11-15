// Cofre - regras do app (sem tela). Usado pelo app e pelos testes.
export const TIPOS = {
  pensamento: { nome: 'Pensamento', icone: '💭' },
  livro: { nome: 'Livro', icone: '📖' },
  video: { nome: 'Vídeo', icone: '▶️' },
};
export const STATUS = ['lendo', 'lido', 'abandonado'];

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
  const nota = meta.nota === undefined || meta.nota === '' ? null : Number(meta.nota);
  return {
    id, caminho,
    tipo: TIPOS[meta.tipo] ? meta.tipo : 'pensamento',
    titulo: meta.titulo || '',
    status: meta.status || '',
    nota: Number.isFinite(nota) ? nota : null,
    link: meta.link || '',
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
      const palheiro = semAcento([n.titulo, n.corpo, n.link, n.tags.join(' ')].join(' '));
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
      return { nota: o, tagsComuns, score: tagsComuns.length * 3 + palavrasComuns };
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
    if (n.corpo && n.corpo !== tituloExibido(n)) partes.push('  ' + n.corpo.replace(/\n/g, '\n  '));
    return partes.join('\n');
  });
  return `Você é meu assistente de reflexão. Abaixo estão minhas anotações pessoais de ${resumo.desde} a ${resumo.hoje} (pensamentos, livros e vídeos).

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
