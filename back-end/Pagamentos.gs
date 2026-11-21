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
 *
 * Fluxo: comprar.html manda os dados do Brick (token do cartão ou escolha de Pix/boleto).
 * Aqui o valor vem da tabela abaixo, nunca da página. Pagamento aprovado gera o código de
 * ativação (ou o link do briefing) e manda por e-mail. Pix e boleto são entregues quando o
 * Mercado Pago avisa (webhook) ou quando a página confere o status, o que vier primeiro.
 * Cada pagamento é entregue uma única vez.
 */

const MP = {
  API: 'https://api.mercadopago.com',
  SITE: 'https://albumdafesta.github.io/',
  DESCRITOR: 'ALBUMDAFESTA',
  PLANOS: {
    diy:     { nome: 'Álbum Faça Você Mesmo', valor: 39.90, degrau: 'diy' },
    feito:   { nome: 'Álbum Feito pra Você', valor: 319.15, briefing: true },
    familia: { nome: 'Assinatura anual da família', valor: 638.30, degrau: 'familia', planoMp: '9c4dbef02c3a4af195bc2bf4bd6dd9b3' },
    licenca: { nome: 'Licença Profissional', valor: 638.30, degrau: 'pro', planoMp: 'dd496a1e90804b18af243b17543d330a' }
  }
};

/* Chamado no começo de doPost. Devolve a resposta quando o pedido é de pagamento; senão, null. */
function pagamentos_(e) {
  let b = {};
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}') || {}; } catch (x) { b = {}; }
  const p = (e && e.parameter) || {};

  // aviso do Mercado Pago: só o id importa; o resto é lido da API com o token
  if (p.mp === '1' || b.type === 'payment' || /^payment\./.test(b.action || '')) {
    try {
      const id = (b.data && b.data.id) || p['data.id'] || p.id;
      if (id && (b.type === 'payment' || /^payment\./.test(b.action || '') || p.type === 'payment' || p.topic === 'payment')) processarPagamento_(String(id));
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

/* Assinatura (cartão): família anual e licença mensal, nos planos já criados no Mercado Pago */
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
    const v = { plano: b.plano, email: email, status: r.status, criado: Date.now(), entrega: entregar_(plano, email) };
    props.setProperty(k, JSON.stringify(v));
    return v;
  });
  return { ok: true, id: r.id, status: 'approved', entrega: reg.entrega };
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
  const props = PropertiesService.getScriptProperties();
  return comTrava_(function () {
    const k = 'PG:' + r.id;
    const reg = JSON.parse(props.getProperty(k) || 'null') || {};
    reg.plano = reg.plano || (r.metadata && r.metadata.plano) || String(r.external_reference || '').split(':')[0];
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

/* Gera o código (ou o link do briefing) e manda o e-mail */
function entregar_(plano, email) {
  const ent = plano.briefing
    ? { tipo: 'briefing', link: MP.SITE + '#briefing' }
    : { tipo: 'codigo', codigo: novoCodigo_(plano.degrau), link: MP.SITE + '#criar' };
  if (email) {
    try {
      const corpo = plano.briefing
        ? 'Oi! Obrigado pela compra do ' + plano.nome + '.\n\n' +
          'Agora conte pra gente como é a festa neste formulário:\n' + ent.link + '\n\n' +
          'No campo "Nome ou e-mail usado na compra", use este e-mail: ' + email + '\n\n' +
          'Assim que a gente montar o álbum, você recebe os links por aqui.\n'
        : 'Oi! Obrigado pela compra do ' + plano.nome + '.\n\n' +
          'Seu código de ativação: ' + ent.codigo + '\n\n' +
          'Para criar o álbum:\n1. Abra ' + ent.link + ' no celular.\n2. Preencha os dados da festa.\n3. No último passo, cole o código.\n\n' +
          'Guarde este e-mail: é com o código que a festa é criada.\n';
      MailApp.sendEmail({ to: email, subject: 'Seu ' + plano.nome + ' chegou', body: corpo, name: 'Álbum da Festa' });
      ent.email = true;
    } catch (err) { Logger.log('e-mail: ' + err); ent.email = false; }
  }
  return ent;
}

/* Mesmo formato de gerarCodigo(): o código vale no assistente #criar */
function novoCodigo_(degrau) {
  const props = PropertiesService.getScriptProperties();
  const codigos = JSON.parse(props.getProperty('CODIGOS') || '{}');
  let c;
  do { c = 'ALB-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase(); } while (codigos[c]);
  codigos[c] = { degrau: degrau, extras: [], usado: false, criado: Date.now(), origem: 'mercadopago' };
  props.setProperty('CODIGOS', JSON.stringify(codigos));
  return c;
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
  Logger.log('Endereço do aviso (webhook): ' + ScriptApp.getService().getUrl() + '?mp=1');
}

// Lista os pagamentos recebidos pelo site e o que foi entregue.
function listarPagamentos() {
  const props = PropertiesService.getScriptProperties().getProperties();
  Object.keys(props).filter(function (k) { return /^(PG|AS):/.test(k); }).forEach(function (k) {
    const v = JSON.parse(props[k]);
    Logger.log([k, v.plano, v.status, v.email, v.entrega ? (v.entrega.codigo || v.entrega.tipo) : '-', v.alerta || ''].join(' · '));
  });
}
