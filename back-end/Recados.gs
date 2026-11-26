/**
 * Álbum de Recados — back-end (um álbum por projeto de script)
 *
 * Projeto SEPARADO do back-end central das festas. Aqui:
 *  - o convidado só ENVIA (foto + nome + recado + autorizações). Nenhuma rota devolve fotos sem sessão.
 *  - quem contratou entra com uma senha (PIN) e vê, baixa e apaga.
 *  - nenhum arquivo é compartilhado por link: tudo fica privado na pasta do script e sai só pelas rotas abaixo.
 *
 * Instalação (uma vez, na conta Google do produto):
 *  1. Cole este arquivo num projeto novo do Apps Script (script.google.com > Novo projeto).
 *  2. Confira as constantes de CFG (nome, datas).
 *  3. Rode configurar() e autorize. Ela cria a pasta privada e gera a senha: veja a senha em "Registro de execução".
 *  4. Rode ativarRotina() uma vez (liga o gatilho diário que apaga tudo depois de ACESSO_ATE).
 *  5. Implantar > Nova implantação > App da Web: Executar como "Eu"; Quem pode acessar "Qualquer pessoa".
 *  6. Copie o endereço /exec para SCRIPT_URL em recados/index.html.
 *  Para publicar mudanças: Implantar > Gerenciar implantações > lápis > Nova versão (o endereço /exec não muda).
 */

const CFG = {
  HOMENAGEADO: 'Caio',
  NOME_RAIZ: 'Álbum de Recados — Caio',
  FUSO: 'America/Sao_Paulo',
  ENVIO_ATE: '2026-12-28',      // último dia para enviar (CONFIRMAR com a contratante)
  ACESSO_ATE: '2027-03-31',     // depois desta data tudo é apagado (CONFIRMAR)
  LIMITE_BYTES: 12 * 1024 * 1024,
  LIMITE_MINI_BYTES: 600 * 1024,
  MAX_ENVIOS_POR_HORA: 20,      // por aparelho
  TERMOS_VERSAO: 'recados-2026-11-26.1',
  EMAIL_AVISO: ''               // opcional: recebe um aviso quando alguém envia (deixe vazio para não avisar)
};

/* ===================== rotas ===================== */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.acao === 'ping') return json_({ ok: true });
    if (p.acao === 'album') return json_({ ok: true, album: publico_() });
    return json_({ ok: false, erro: 'Ação desconhecida' });
  } catch (err) {
    return json_(erro_(err));
  }
}

function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents);
    switch (b.acao) {
      case 'enviar': return json_(enviar_(b));
      case 'entrar': return json_(entrar_(b));
    }
    // daqui para baixo, só com a sessão que o servidor deu depois de conferir a senha
    sessaoOuErro_(b.token);
    switch (b.acao) {
      case 'listar': return json_(listar_());
      case 'miniaturas': return json_(miniaturas_(b));
      case 'foto': return json_(foto_(b));
      case 'apagar': return json_(apagar_(b));
    }
    return json_({ ok: false, erro: 'Ação desconhecida' });
  } catch (err) {
    return json_(erro_(err));
  }
}

function publico_() {
  return { homenageado: CFG.HOMENAGEADO, envioAberto: hoje_() <= CFG.ENVIO_ATE, envioAte: CFG.ENVIO_ATE, acessoAte: CFG.ACESSO_ATE, termos: CFG.TERMOS_VERSAO };
}

/* ===================== envio do convidado ===================== */

function enviar_(b) {
  if (hoje_() > CFG.ENVIO_ATE) return { ok: false, erro: 'O prazo de envio terminou' };
  if (b.site) return { ok: true };                       // campo-isca: robô preencheu, finge que deu certo
  if (!b.dados) throw new Error('Foto vazia');
  if (!/^image\//.test(b.mime || '')) throw new Error('Só enviamos fotos');

  const aceite = b.aceite || {};
  if (aceite.v !== CFG.TERMOS_VERSAO || !aceite.t) return { ok: false, erro: 'Aceite dos termos ausente. Recarregue a página e tente de novo.' };

  const nome = limpar_(b.nome, 40);
  if (nome.length < 2) return { ok: false, erro: 'Escreva seu nome' };
  const recado = limpar_(b.recado, 400);
  const menor = b.menor === true;
  const responsavel = limpar_(b.responsavel, 60);
  if (menor && responsavel.length < 3) return { ok: false, erro: 'Para menores de 18 anos, escreva o nome do responsável' };
  const ia = b.autorizaIA === true;   // para menor de 18, quem autoriza é o responsável nomeado acima

  const cache = CacheService.getScriptCache();
  const disp = limpar_(b.dispositivo, 60) || 'sem-aparelho';
  const kd = 'env:' + disp, usados = Number(cache.get(kd) || 0);
  if (usados >= CFG.MAX_ENVIOS_POR_HORA) return { ok: false, erro: 'Muitos envios seguidos. Tente de novo daqui a pouco.' };

  const bytes = Utilities.base64Decode(b.dados);
  if (bytes.length > CFG.LIMITE_BYTES) throw new Error('Foto grande demais');
  const chave = String(b.chave || '').slice(0, 60);
  if (chave) { const ja = indice_().filter(function (x) { return x.chave === chave; })[0]; if (ja) return { ok: true, repetida: true }; }

  const mime = b.mime === 'image/png' ? 'image/png' : 'image/jpeg';
  const ext = mime === 'image/png' ? 'png' : 'jpg';
  const t = Date.now();
  const base = Utilities.formatDate(new Date(t), CFG.FUSO, 'yyyy-MM-dd HH-mm-ss') + ' - ' + nome.replace(/[\\/:*?"<>|]/g, '');
  const pasta = pasta_();
  const arq = pasta.createFile(Utilities.newBlob(bytes, mime, base + '.' + ext));   // privado: sem setSharing
  let mini = null;
  if (b.mini) {
    const mb = Utilities.base64Decode(b.mini);
    if (mb.length <= CFG.LIMITE_MINI_BYTES) mini = subpasta_(pasta, 'miniaturas').createFile(Utilities.newBlob(mb, 'image/jpeg', base + ' (mini).jpg'));
  }
  const foto = {
    id: arq.getId(), mini: mini ? mini.getId() : '', nome: nome, recado: recado, t: t, mime: mime, bytes: bytes.length,
    w: Number(b.w) || 0, h: Number(b.h) || 0, chave: chave,
    menor: menor, responsavel: menor ? responsavel : '',
    ia: ia,                                               // autorizou a foto e o recado no vídeo feito por IA
    aceite: { v: CFG.TERMOS_VERSAO, t: Number(aceite.t) || t, recebido: t, d: disp }
  };
  comTrava_(function () {
    const idx = indice_(true);
    if (chave && idx.filter(function (x) { return x.chave === chave; })[0]) { arq.setTrashed(true); if (mini) mini.setTrashed(true); return; }
    idx.push(foto);
    salvarIndice_(idx);
  });
  cache.put(kd, String(usados + 1), 3600);
  if (CFG.EMAIL_AVISO) { try { MailApp.sendEmail(CFG.EMAIL_AVISO, 'Novo recado no álbum do ' + CFG.HOMENAGEADO, nome + ' enviou uma foto.'); } catch (x) {} }
  return { ok: true };                                    // não devolve nada do álbum
}

/* ===================== área de quem contratou ===================== */

function entrar_(b) {
  const props = PropertiesService.getScriptProperties();
  const cache = CacheService.getScriptCache();
  const d = limpar_(b.dispositivo, 60) || 'sem-aparelho';
  const kd = 'fd:' + d, kg = 'fg';
  const fd = Number(cache.get(kd) || 0), fg = Number(cache.get(kg) || 0);
  if (fd >= 5) return { ok: false, erro: 'Muitas tentativas neste aparelho. Espere 10 minutos.' };
  if (fg >= 30) return { ok: false, erro: 'Muitas tentativas erradas. Espere alguns minutos.' };
  Utilities.sleep(Math.min(3000, fd * 600));
  const sal = props.getProperty('SAL'), ph = props.getProperty('PIN_HASH');
  if (!sal || !ph || hash_(sal + String(b.pin || '')) !== ph) {
    cache.put(kd, String(fd + 1), 600); cache.put(kg, String(fg + 1), 600);
    return { ok: false, erro: 'Senha incorreta' };
  }
  cache.remove(kd);
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  cache.put('tk:' + token, d, 21600);                     // sessão de 6 horas
  return { ok: true, token: token, horas: 6 };
}

function sessaoOuErro_(token) {
  if (!token || !CacheService.getScriptCache().get('tk:' + String(token))) throw new Error('Sessão expirada');
}

function listar_() {
  const fotos = indice_().map(function (f) {
    return { id: f.id, nome: f.nome, recado: f.recado, t: f.t, ia: !!f.ia, menor: !!f.menor, responsavel: f.responsavel || '', w: f.w, h: f.h, mini: !!f.mini };
  });
  return { ok: true, total: fotos.length, fotos: fotos, homenageado: CFG.HOMENAGEADO, acessoAte: CFG.ACESSO_ATE };
}

// miniaturas em lote (uma chamada traz várias), para a galeria abrir rápido
function miniaturas_(b) {
  const ids = (b.ids || []).slice(0, 12);
  const idx = indice_(), out = {};
  ids.forEach(function (id) {
    const f = idx.filter(function (x) { return x.id === id; })[0];
    if (!f) return;
    try { out[id] = Utilities.base64Encode(DriveApp.getFileById(f.mini || f.id).getBlob().getBytes()); } catch (x) {}
  });
  return { ok: true, minis: out };
}

function foto_(b) {
  const f = indice_().filter(function (x) { return x.id === b.id; })[0];
  if (!f) return { ok: false, erro: 'Foto não encontrada' };
  const blob = DriveApp.getFileById(f.id).getBlob();
  return { ok: true, mime: f.mime || blob.getContentType(), dados: Utilities.base64Encode(blob.getBytes()) };
}

function apagar_(b) {
  return comTrava_(function () {
    const idx = indice_(true);
    const i = idx.findIndex(function (x) { return x.id === b.id; });
    if (i < 0) return { ok: false, erro: 'Foto não encontrada' };
    const f = idx[i];
    try { DriveApp.getFileById(f.id).setTrashed(true); } catch (x) {}
    if (f.mini) { try { DriveApp.getFileById(f.mini).setTrashed(true); } catch (x) {} }
    idx.splice(i, 1);
    salvarIndice_(idx);
    return { ok: true };
  });
}

/* ===================== armazenamento ===================== */

function pasta_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PASTA_ID');
  if (!id) throw new Error('Álbum não configurado');
  return DriveApp.getFolderById(id);
}
function subpasta_(pasta, nome) { const it = pasta.getFoldersByName(nome); return it.hasNext() ? it.next() : pasta.createFolder(nome); }
function arquivoIndice_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('INDICE_ID');
  if (id) { try { const f = DriveApp.getFileById(id); if (!f.isTrashed()) return f; } catch (x) {} }
  const arq = pasta_().createFile('_indice.json', '[]', 'application/json');
  props.setProperty('INDICE_ID', arq.getId());
  return arq;
}
function indice_(forcar) {
  const cache = CacheService.getScriptCache();
  if (!forcar) { const c = cache.get('indice'); if (c) return JSON.parse(c); }
  let v; try { v = JSON.parse(arquivoIndice_().getBlob().getDataAsString() || '[]'); } catch (x) { v = []; }
  try { cache.put('indice', JSON.stringify(v), 21600); } catch (x) {}
  return v;
}
function salvarIndice_(v) {
  const txt = JSON.stringify(v);
  arquivoIndice_().setContent(txt);
  try { CacheService.getScriptCache().put('indice', txt, 21600); } catch (x) { CacheService.getScriptCache().remove('indice'); }
}

/* ===================== utilidades ===================== */

function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function comTrava_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('ocupado');
  try { return fn(); } finally { lock.releaseLock(); }
}
function erro_(err) {
  const m = String((err && err.message) || err);
  const ocupado = /ocupado|too many|simultaneous|Limite|Service invoked|Lock/i.test(m);
  return { ok: false, erro: ocupado ? 'ocupado' : m, tentarDeNovo: ocupado };
}
function limpar_(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }
function hoje_() { return Utilities.formatDate(new Date(), CFG.FUSO, 'yyyy-MM-dd'); }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

/* ===================== funções do administrador (rodar pelo editor) ===================== */

// 1) Cria a pasta privada e gera a senha. A senha aparece UMA vez, no Registro de execução.
function configurar() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PASTA_ID')) props.setProperty('PASTA_ID', DriveApp.createFolder(CFG.NOME_RAIZ).getId());
  novaSenha();
  Logger.log('Pasta: ' + pasta_().getUrl());
}

// Gera (ou troca) a senha de quem contratou. Entregue só a ela; nada fica guardado em texto.
function novaSenha() {
  const props = PropertiesService.getScriptProperties();
  let pin = '';
  for (let i = 0; i < 6; i++) pin += Math.floor(Math.random() * 10);
  const sal = Utilities.getUuid();
  props.setProperty('SAL', sal);
  props.setProperty('PIN_HASH', hash_(sal + pin));
  Logger.log('SENHA DO ÁLBUM: ' + pin + '   (guarde agora; ela não fica salva em texto)');
}

// 2) Liga o gatilho diário que apaga tudo depois de ACESSO_ATE.
function ativarRotina() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'rotinaDiaria') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('rotinaDiaria').timeBased().everyDays(1).atHour(4).create();
}

function rotinaDiaria() {
  if (hoje_() <= CFG.ACESSO_ATE) return;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PASTA_ID');
  if (id) { try { DriveApp.getFolderById(id).setTrashed(true); } catch (x) {} }
  props.deleteProperty('PASTA_ID'); props.deleteProperty('INDICE_ID');
  CacheService.getScriptCache().remove('indice');
}

// Resumo rápido para conferir pelo editor
function resumo() {
  const i = indice_(true);
  Logger.log('Fotos: ' + i.length + ' | autorizaram o vídeo: ' + i.filter(function (f) { return f.ia; }).length + ' | menores: ' + i.filter(function (f) { return f.menor; }).length);
}
