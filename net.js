// Cofre - conversa com o GitHub e guarda a chave trancada por PIN.
const API = 'https://api.github.com';
export const REPO_PADRAO = 'rafagmota/cofre-dados';

const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const deb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const textoParaBase64 = (t) => b64(enc.encode(t));

async function derivar(pin, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// Guarda a chave do GitHub trancada com o PIN (só neste aparelho).
export async function guardarChave(token, pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await derivar(pin, salt);
  const dados = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(token));
  localStorage.setItem('cofre.chave', JSON.stringify({ salt: b64(salt), iv: b64(iv), dados: b64(dados) }));
}
export const temChaveGuardada = () => { try { return !!localStorage.getItem('cofre.chave'); } catch { return false; } };
export async function abrirChave(pin) {
  const o = JSON.parse(localStorage.getItem('cofre.chave'));
  const k = await derivar(pin, deb64(o.salt));
  const bruto = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deb64(o.iv) }, k, deb64(o.dados));
  return new TextDecoder().decode(bruto);
}
export const esquecerChave = () => {
  try { localStorage.removeItem('cofre.chave'); sessionStorage.removeItem('cofre.sessao'); } catch { /* sem problema */ }
};

export class ErroCofre extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

export class Repositorio {
  constructor(token, repo = REPO_PADRAO) { this.token = token; this.repo = repo; }

  async pedir(caminho, opcoes = {}) {
    let r;
    try {
      r = await fetch(API + caminho, {
        cache: 'no-store',
        ...opcoes,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(opcoes.headers || {}),
        },
      });
    } catch {
      throw new ErroCofre('Sem conexão com a internet.', 0);
    }
    if (!r.ok) {
      const msg = r.status === 401 ? 'A chave não é aceita (venceu ou foi cancelada).'
        : r.status === 404 ? 'Depósito não encontrado (chave sem acesso ao cofre-dados?).'
        : r.status === 409 ? 'Conflito: a anotação mudou em outro aparelho. Atualize e tente de novo.'
        : r.status === 422 ? 'Conflito: a anotação mudou em outro aparelho. Atualize e tente de novo.'
        : `Erro do GitHub (${r.status}).`;
      throw new ErroCofre(msg, r.status);
    }
    return r;
  }

  async testar() { await this.pedir(`/repos/${this.repo}`); return true; }

  // Lista todos os arquivos de anotação: [{path, sha}]
  async listar() {
    const r = await this.pedir(`/repos/${this.repo}/git/trees/main?recursive=1`);
    const j = await r.json();
    return j.tree.filter((e) => e.type === 'blob' && /^notas\/.+\.md$/.test(e.path)).map((e) => ({ path: e.path, sha: e.sha }));
  }

  async ler(sha) {
    const r = await this.pedir(`/repos/${this.repo}/git/blobs/${sha}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
    return r.text();
  }

  // Cria (sem sha) ou atualiza (com sha) uma anotação. Nunca apaga.
  async gravar(path, texto, mensagem, sha) {
    const corpo = { message: mensagem, content: textoParaBase64(texto), branch: 'main' };
    if (sha) corpo.sha = sha;
    const r = await this.pedir(`/repos/${this.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'PUT', body: JSON.stringify(corpo), headers: { 'Content-Type': 'application/json' },
    });
    const j = await r.json();
    return j.content.sha;
  }
}

// Busca o título de um vídeo a partir do link (serviço gratuito; só o link sai do aparelho).
export async function tituloDoVideo(url) {
  try {
    const r = await fetch('https://noembed.com/embed?url=' + encodeURIComponent(url));
    const j = await r.json();
    return j.title || '';
  } catch { return ''; }
}
