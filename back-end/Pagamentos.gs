/**
 * Álbum da Festa — pagamentos pelo Mercado Pago (Checkout Bricks)
 *
 * Arquivo NOVO, no mesmo projeto do back-end central (ao lado de "Código").
 * Usa funções que já existem lá: json_, comTrava_, limpar_, hash_.
 *
 * Instalação (uma vez):
 *  1. No editor do Apps Script: + (Adicionar arquivo) > Script > nome "Pagamentos" e cole este conteúdo.
 *  2. Em "Código", dentro de doPost(e), logo na primeira linha do try, cole:
 *         const pg = pagamentos_(e); if (pg) return pg;
 *  3. Configurações do projeto (engrenagem) > Propriedades do script > Adicionar:
 *         MP_ACCESS_TOKEN = seu Access Token de produção (APP_USR-...)
 *  4. Rode testarMercadoPago() pelo editor e autorize o acesso a serviços externos.
 *  5. Implantar > Gerenciar implantações > lápis > Versão: Nova versão > Implantar.
 *     (editar a implantação existente mantém o mesmo endereço /exec que o app já usa)
 *  6. No Mercado Pago: Suas integrações > sua aplicação > Webhooks > Modo produção.
 *     URL: o endereço que testarMercadoPago() mostra no registro (termina em ?mp=1).
 *     Eventos: "Pagamentos" e "Planos e assinaturas". É assim que chegam as cobranças
 *     mensais da Licença Profissional, que liberam as 2 festas de cada mês.
 *
 * Planos:
 *  - Faça Você Mesmo e Feito pra Você: pagamento único (Pix, cartão, boleto).
 *  - Licença Profissional mensal: assinatura no cartão, R$ 199/mês, 2 festas por mês.
 *  - Licença Profissional anual: pagamento único de R$ 1.990, 24 festas.
 *  - Festa adicional (profissional): pagamento único de R$ 79,79, 1 festa.
 * Cada festa é um código de ativação do degrau "pro" (ou "diy" no Faça Você Mesmo).
 * O valor vem da tabela abaixo, nunca da página. Cada pagamento é entregue uma única vez.
 */

const MP = {
  API: 'https://api.mercadopago.com',
  SITE: 'https://albumdafesta.github.io/',
  DESCRITOR: 'ALBUMDAFESTA',
  PRIMEIRA_COBRANCA_DIAS: 20,   // cobrança da assinatura até 20 dias após a adesão = 1º mês (já entregue na adesão)
  PLANOS: {
    'diy':           { nome: 'Álbum Faça Você Mesmo', valor: 39.90, degrau: 'diy', festas: 1 },
    'feito':         { nome: 'Álbum Feito pra Você', valor: 319.15, briefing: true },
    'licenca':       { nome: 'Licença Profissional mensal', valor: 199.00, degrau: 'pro', festas: 2, planoMp: 'd44b5cfe75e844f5a4d8c1c64c955f4b' },
    'licenca-anual': { nome: 'Licença Profissional anual', valor: 1990.00, degrau: 'pro', festas: 24 },
    'adicional':     { nome: 'Festa adicional da Licença Profissional', valor: 79.79, degrau: 'pro', festas: 1 }
  }
};

/* Chamado no começo de doPost. Devolve a resposta quando o pedido é de pagamento; senão, null. */
function pagamentos_(e) {
  let b = {};
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}') || {}; } catch (x) { b = {}; }
  const p = (e && e.parameter) || {};

  // aviso do Mercado Pago: só o id e o tipo importam; o resto é lido da API com o token
  const tipo = b.type || p.type || p.topic || String(b.action || '').split('.')[0];
  if (p.mp === '1' || (b.data && b.data.id && tipo)) {
    try {
      const id = String((b.data && b.data.id) || p['data.id'] || p.id || '');
      if (id && tipo === 'payment') processarPagamento_(id);
      if (id && tipo === 'subscription_authorized_payment') processarCobranca_(id);
    } catch (err) { Logger.log('webhook MP: ' + err); }
    return json_({ ok: true });
  }

  if (b.acao !== 'pagar' && b.acao !== 'assinar' && b.acao !== 'status-pagamento') return null;
  try {
    if (b.acao === 'pagar') return json_(pagar_(b));
    if (b.acao === 'assinar') return json_(assinar_(b));
    return json_(statusPagamento_(b));
  } catch (err) {
    Logger.log('pagamento: ' + err);
    return json_({ ok: false, erro: 'Não foi possível concluir agora. Tente de novo em instantes.' });
  }
}

/* Pagamento único (Pix, cartão, boleto) */
function pagar_(b) {
  const plano = MP.PLANOS[b.plano];
  if (!plano || plano.planoMp) return { ok: false, erro: 'Plano inválido' };
  const f = b.formData || {};
  const payer = f.payer || {};
  const email = limpar_(payer.email, 120);
  if (!f.payment_method_id || !email) return { ok: false, erro: 'Faltam dados do pagamento' };

  const recibo = Utilities.getUuid();
  const corpo = {
    transaction_amount: plano.valor,
    description: plano.nome,
    payment_method_id: String(f.payment_method_id),
    payer: Object.assign({}, payer, { email: email }),
    external_reference: b.plano + ':' + recibo.slice(0, 8),
    statement_descriptor: MP.DESCRITOR,
    notification_url: ScriptApp.getService().getUrl() + '?mp=1',
    metadata: { plano: b.plano }
  };
  if (f.token) {
    corpo.token = String(f.token);
    corpo.installments = Math.max(1, Math.min(12, Number(f.installments) || 1));
    if (f.issuer_id) corpo.issuer_id = String(f.issuer_id);
  }
  if (f.transaction_details) corpo.transaction_details = f.transaction_details;

  const r = mp_('post', '/v1/payments', corpo, limpar_(b.chave, 64) || recibo);
  if (!r || !r.id) return { ok: false, erro: 'O Mercado Pago recusou os dados do pagamento' };

  salvarPg_(String(r.id), { plano: b.plano, email: email, recibo: hash_(recibo), criado: Date.now() });
  const reg = processarPagamento_(String(r.id), r) || {};
  const pix = (r.point_of_interaction && r.point_of_interaction.transaction_data) || {};
  return {
    ok: true, id: r.id, recibo: recibo, status: r.status, detalhe: r.status_detail,
    entrega: reg.entrega || null,
    pix: pix.qr_code ? { codigo: pix.qr_code, imagem: pix.qr_code_base64 || '' } : null,
    boleto: (r.transaction_details && r.transaction_details.external_resource_url) || null
  };
}

/* Assinatura mensal no cartão (Licença Profissional), no plano já criado no Mercado Pago */
function assinar_(b) {
  const plano = MP.PLANOS[b.plano];
  if (!plano || !plano.planoMp) return { ok: false, erro: 'Plano inválido' };
  const f = b.formData || {};
  const email = limpar_(f.payer && f.payer.email, 120);
  if (!f.token || !email) return { ok: false, erro: 'Faltam dados do cartão' };

  const r = mp_('post', '/preapproval', {
    preapproval_plan_id: plano.planoMp,
    card_token_id: String(f.token),
    payer_email: email,
    status: 'authorized',
    external_reference: b.plano + ':' + Utilities.getUuid().slice(0, 8)
  }, limpar_(b.chave, 64));
  if (!r || !r.id) return { ok: false, erro: 'O cartão não foi aceito para assinatura. Tente outro cartão.' };
  if (r.status !== 'authorized') return { ok: true, id: r.id, status: 'rejected' };

  const props = PropertiesService.getScriptProperties();
  const reg = comTrava_(function () {
    const k = 'AS:' + r.id;
    const ja = JSON.parse(props.getProperty(k) || 'null');
    if (ja) return ja;
    // o 1º mês é entregue já na adesão; a 1ª cobrança que chegar pelo webhook não entrega de novo
    const v = { plano: b.plano, email: email, status: r.status, criado: Date.now(), primeiraPendente: true,
                entrega: entregar_(plano, email), meses: 1 };
    props.setProperty(k, JSON.stringify(v));
    return v;
  });
  return { ok: true, id: r.id, status: 'approved', entrega: reg.entrega };
}

/* Cobrança mensal da assinatura: libera as festas do mês quando o pagamento é aprovado */
function processarCobranca_(id) {
  const ap = mp_('get', '/authorized_payments/' + encodeURIComponent(id));
  if (!ap || !ap.preapproval_id) return null;
  const aprovado = ap.payment && ap.payment.status === 'approved';
  const props = PropertiesService.getScriptProperties();
  return comTrava_(function () {
    const kA = 'AS:' + ap.preapproval_id, kC = 'AP:' + ap.id;
    const as = JSON.parse(props.getProperty(kA) || 'null');
    if (!as || !aprovado || props.getProperty(kC)) return as;
    const plano = MP.PLANOS[as.plano];
    if (!plano) return as;
    const quando = Date.parse(ap.debit_date || ap.date_created || ap.last_modified || '') || Date.now();
    const ehPrimeira = as.primeiraPendente && quando - as.criado < MP.PRIMEIRA_COBRANCA_DIAS * 864e5;
    as.primeiraPendente = false;
    let ent = null;
    if (!ehPrimeira) { ent = entregar_(plano, as.email); as.meses = (as.meses || 1) + 1; as.ultima = ent; }
    props.setProperty(kC, JSON.stringify({ preapproval: ap.preapproval_id, pagamento: ap.payment && ap.payment.id, entregue: !!ent, t: Date.now() }));
    props.setProperty(kA, JSON.stringify(as));
    return as;
  });
}

/* A página do Pix pergunta se já caiu. Só responde a quem tem o recibo do próprio pagamento. */
function statusPagamento_(b) {
  const id = String(b.id || '').replace(/\D/g, '');
  const reg = id && JSON.parse(PropertiesService.getScriptProperties().getProperty('PG:' + id) || 'null');
  if (!reg || !b.recibo || reg.recibo !== hash_(String(b.recibo))) return { ok: false, erro: 'Pagamento não encontrado' };
  const atual = reg.status === 'approved' ? reg : (processarPagamento_(id) || reg);
  return { ok: true, id: id, status: atual.status, entrega: atual.status === 'approved' ? (atual.entrega || null) : null };
}

/* Lê o pagamento na API e entrega uma única vez quando aprovado */
function processarPagamento_(id, r) {
  r = r || mp_('get', '/v1/payments/' + encodeURIComponent(id));
  if (!r || !r.id) return null;
  const plano0 = (r.metadata && r.metadata.plano) || String(r.external_reference || '').split(':')[0];
  // cobranças da assinatura chegam como pagamento também: quem entrega é processarCobranca_
  if (MP.PLANOS[plano0] && MP.PLANOS[plano0].planoMp) return null;
  const props = PropertiesService.getScriptProperties();
  return comTrava_(function () {
    const k = 'PG:' + r.id;
    const reg = JSON.parse(props.getProperty(k) || 'null') || {};
    reg.plano = reg.plano || plano0;
    reg.email = reg.email || (r.payer && r.payer.email) || '';
    reg.status = r.status;
    if (r.status === 'approved' && !reg.entrega) {
      const plano = MP.PLANOS[reg.plano];
      if (plano && !plano.planoMp && Math.abs(Number(r.transaction_amount) - plano.valor) < 0.01) {
        reg.entrega = entregar_(plano, reg.email);
        reg.entregueEm = Date.now();
      } else {
        reg.alerta = 'plano ou valor não confere: revisar à mão';
      }
    }
    props.setProperty(k, JSON.stringify(reg));
    return reg;
  });
}

function salvarPg_(id, extra) {
  const props = PropertiesService.getScriptProperties();
  comTrava_(function () {
    const k = 'PG:' + id;
    const reg = JSON.parse(props.getProperty(k) || 'null') || {};
    Object.keys(extra).forEach(function (c) { if (reg[c] == null) reg[c] = extra[c]; });
    props.setProperty(k, JSON.stringify(reg));
  });
}

/* Gera os códigos (um por festa) ou o link do briefing e manda o e-mail */
function entregar_(plano, email) {
  let ent;
  if (plano.briefing) ent = { tipo: 'briefing', link: MP.SITE + '#briefing' };
  else {
    const codigos = novosCodigos_(plano.degrau, plano.festas || 1);
    ent = { tipo: 'codigo', codigo: codigos[0], codigos: codigos, link: MP.SITE + '#criar' };
  }
  if (email) {
    try {
      let corpo;
      if (plano.briefing) {
        corpo = 'Oi! Obrigado pela compra do ' + plano.nome + '.\n\n' +
          'Agora conte pra gente como é a festa neste formulário:\n' + ent.link + '\n\n' +
          'No campo "Nome ou e-mail usado na compra", use este e-mail: ' + email + '\n\n' +
          'Assim que a gente montar o álbum, você recebe os links por aqui.\n';
      } else {
        const varios = ent.codigos.length > 1;
        corpo = 'Oi! Obrigado pela compra do ' + plano.nome + '.\n\n' +
          (varios ? 'Seus ' + ent.codigos.length + ' códigos de ativação (um por festa):\n' + ent.codigos.join('\n')
                  : 'Seu código de ativação: ' + ent.codigo) + '\n\n' +
          'Para criar cada álbum:\n1. Abra ' + ent.link + ' no celular.\n2. Preencha os dados da festa.\n3. No último passo, cole o código.\n\n' +
          'Guarde este e-mail: ' + (varios ? 'cada código cria uma festa.' : 'é com o código que a festa é criada.') + '\n';
      }
      MailApp.sendEmail({ to: email, subject: 'Seu ' + plano.nome + ' chegou', body: corpo, name: 'Álbum da Festa' });
      ent.email = true;
    } catch (err) { Logger.log('e-mail: ' + err); ent.email = false; }
  }
  return ent;
}

/* Mesmo formato de gerarCodigo(): cada código vale uma festa no assistente #criar.
   ATENÇÃO: os códigos ficam na propriedade CODIGOS, que aceita até 9 KB (uns 100 códigos usados).
   Uma licença anual gera 24. Antes de vender muitas licenças, os códigos precisam ir para um
   arquivo no Drive (mudança no criar_ do "Código"). Ao passar de 70% do limite, chega um e-mail. */
const CODIGOS_LIMITE = 9000;
function novosCodigos_(degrau, qtd) {
  const props = PropertiesService.getScriptProperties();
  const codigos = JSON.parse(props.getProperty('CODIGOS') || '{}');
  const novos = [];
  for (let i = 0; i < qtd; i++) {
    let c;
    do { c = 'ALB-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase(); } while (codigos[c]);
    codigos[c] = { degrau: degrau };   // formato curto: o criar_ trata usado/extras ausentes como "não usado"/"sem extras"
    novos.push(c);
  }
  const txt = JSON.stringify(codigos);
  if (txt.length > CODIGOS_LIMITE * 0.7) avisarDono_('Códigos de ativação perto do limite',
    'A lista de códigos usa ' + txt.length + ' de ' + CODIGOS_LIMITE + ' caracteres. Passe os códigos para um arquivo no Drive antes de novas vendas de licença.');
  props.setProperty('CODIGOS', txt);   // se passar do limite, falha aqui e o pagamento fica sem entrega (aparece em listarPagamentos)
  return novos;
}

function avisarDono_(assunto, texto) {
  const props = PropertiesService.getScriptProperties();
  const hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
  if (props.getProperty('AVISO:' + assunto) === hoje) return;   // no máximo um por dia
  try { MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '[Álbum da Festa] ' + assunto, texto); } catch (x) {}
  props.setProperty('AVISO:' + assunto, hoje);
}

function mp_(metodo, caminho, corpo, idem) {
  const token = PropertiesService.getScriptProperties().getProperty('MP_ACCESS_TOKEN');
  if (!token) throw new Error('MP_ACCESS_TOKEN ausente nas propriedades do script');
  const headers = { Authorization: 'Bearer ' + token };
  if (idem) headers['X-Idempotency-Key'] = idem;
  const op = { method: metodo, headers: headers, muteHttpExceptions: true };
  if (corpo) { op.contentType = 'application/json'; op.payload = JSON.stringify(corpo); }
  const resp = UrlFetchApp.fetch(MP.API + caminho, op);
  let r = {};
  try { r = JSON.parse(resp.getContentText()) || {}; } catch (x) {}
  if (resp.getResponseCode() >= 400) Logger.log('MP ' + resp.getResponseCode() + ' ' + caminho + ': ' + resp.getContentText().slice(0, 500));
  return r;
}

/* ===== administrador (rodar pelo editor) ===== */

// Confere o token e pede a autorização de serviços externos na primeira vez.
function testarMercadoPago() {
  const r = mp_('get', '/v1/payment_methods');
  Logger.log(Array.isArray(r) ? 'Token ok: ' + r.length + ' formas de pagamento disponíveis' : 'Falhou: ' + JSON.stringify(r).slice(0, 300));
  Logger.log('URL do webhook (cole no Mercado Pago): ' + ScriptApp.getService().getUrl() + '?mp=1');
}

// Lista os pagamentos e assinaturas recebidos pelo site e o que foi entregue.
function listarPagamentos() {
  const props = PropertiesService.getScriptProperties().getProperties();
  Object.keys(props).filter(function (k) { return /^(PG|AS):/.test(k); }).forEach(function (k) {
    const v = JSON.parse(props[k]);
    const ent = v.ultima || v.entrega;
    Logger.log([k, v.plano, v.status, v.email, ent ? ((ent.codigos || []).join(' ') || ent.tipo) : '-', v.meses ? v.meses + ' mês(es)' : '', v.alerta || ''].join(' · '));
  });
}
