/* Flipbook e preparo para impressão da área privada do álbum.
   Só é baixado quando a pessoa clica em "Ver como álbum" ou "Preparar para impressão".
   Usa funções e dados do index.html: Dono, agrupar, carregarMinis, chamar, montarZip, montarTxt, baixarBlob, slug, u8doB64, esc, Som, Album. */
(function () {
  'use strict';
  const q = (s, r) => (r || document).querySelector(s);
  const reduzido = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- estilos (injetados uma vez) ---------- */
  if (!q('#albumExtraCss')) {
    const st = document.createElement('style'); st.id = 'albumExtraCss';
    st.textContent = `
.fx-ov{position:fixed;inset:0;z-index:60;background:radial-gradient(ellipse at center,#1d6b3d 0%,#0b3d22 70%,#072814 100%);display:flex;flex-direction:column;color:#fff}
.fx-topo{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;gap:10px}
.fx-topo b{font-size:15px;letter-spacing:.04em;text-transform:uppercase;opacity:.9}
.fx-x{min-width:44px;height:44px;border-radius:22px;border:1.5px solid rgba(255,255,255,.55);background:rgba(0,0,0,.25);color:#fff;font:700 15px/1 system-ui,sans-serif;padding:0 14px;cursor:pointer}
.fx-palco{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:0 8px;overflow:hidden}
#flipLivro{width:min(96vw,1100px);height:min(78vh,760px)}
.fx-nav{display:flex;align-items:center;justify-content:center;gap:14px;padding:10px 14px calc(14px + env(safe-area-inset-bottom))}
.fx-nav button{width:52px;height:52px;border-radius:50%;border:0;background:#ffd21f;color:#0a0a0a;font:900 26px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 0 #c9a200}
.fx-nav button:active{transform:translateY(3px);box-shadow:0 1px 0 #c9a200}
.fx-nav button[disabled]{opacity:.4}
.fx-nav span{min-width:140px;text-align:center;font-weight:700;font-size:14px}
.pg{width:100%;height:100%;container-type:inline-size;background:#fbf8ef;color:#1b1b1b;box-sizing:border-box;overflow:hidden;font-family:Georgia,'Times New Roman',serif}
.pg .in{height:100%;display:flex;flex-direction:column;padding:6% 7%;box-sizing:border-box}
.pg-capa{background:repeating-linear-gradient(90deg,#14703c 0 12%,#0f5c33 12% 24%);color:#fff;border:6px solid #ffd21f}
.pg-capa .in{align-items:center;justify-content:center;text-align:center;padding:10%}
.pg-capa .sel{background:#ffd21f;color:#0a0a0a;font:800 clamp(10px,3.4cqw,15px)/1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;padding:.6em 1em;border-radius:99px}
.pg-capa h1{font:900 clamp(26px,12cqw,64px)/1 'Arial Black',system-ui,sans-serif;margin:.5em 0 .3em;text-transform:uppercase}
.pg-capa p{margin:0;font:600 clamp(12px,4.4cqw,20px)/1.3 system-ui,sans-serif;opacity:.9}
.pg-foto .moldura{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}
.pg-foto img{max-width:100%;max-height:100%;border:max(6px,2cqw) solid #fff;box-shadow:0 8px 20px -8px rgba(0,0,0,.5);display:block;object-fit:contain;background:#fff}
.pg-foto .leg{margin:.9em 0 0;text-align:center;font-style:italic;font-size:clamp(12px,4.4cqw,22px);line-height:1.25;min-height:1.3em;word-break:break-word}
.pg-foto .de{margin:.3em 0 0;text-align:center;font:700 clamp(10px,3.4cqw,15px)/1 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#0f5c33}
.pg-recado .in{justify-content:center}
.pg-recado .sel{align-self:flex-start;background:#ffd21f;color:#0a0a0a;font:800 clamp(10px,3.2cqw,14px)/1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;padding:.55em .9em;border-radius:99px}
.pg-recado h3{font:900 clamp(18px,8cqw,38px)/1.05 'Arial Black',system-ui,sans-serif;margin:.5em 0 .4em;color:#0f5c33}
.pg-recado blockquote{margin:0;border-left:.35em solid #ffd21f;padding-left:.9em;font-size:clamp(13px,5cqw,24px);line-height:1.35;white-space:pre-wrap;word-break:break-word;overflow:hidden}
.pg-recado blockquote.longo{font-size:clamp(11px,4cqw,19px)}
.pg-fim{font:600 clamp(14px,5cqw,24px)/1.3 Georgia,serif;font-style:italic;color:#0f5c33}
.pg-fim .in{align-items:center;justify-content:center;text-align:center}
/* impressão */
.ov-claro{position:fixed;inset:0;z-index:60;background:rgba(10,10,10,.6);display:flex;align-items:flex-end;justify-content:center}
.ov-c{background:#f5f6ef;width:min(1000px,100%);max-height:96vh;border-radius:20px 20px 0 0;display:flex;flex-direction:column;overflow:hidden}
.ov-topo{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 4px}
.ov-topo h2{margin:0;font-size:20px}
.ov-corpo{padding:6px 16px 10px;overflow:auto;flex:1}
.ov-rodape{padding:12px 16px calc(12px + env(safe-area-inset-bottom));border-top:1px solid #dfe3d6;background:#fff}
.ov-rodape .btn{width:100%}
.ov-claro .x{min-width:44px;height:44px;border-radius:22px;border:1.5px solid #0a0a0a;background:#fff;font:700 15px/1 system-ui,sans-serif;padding:0 14px;cursor:pointer}
.imp-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-top:10px}
.imp-it{border:1.5px solid #d9dfd3;border-radius:12px;background:#fff;padding:8px;cursor:pointer;text-align:left;font:inherit;color:inherit}
.imp-it .caixa{display:block;position:relative;width:100%;overflow:hidden;border-radius:6px;background:#e9ece3;aspect-ratio:var(--r)}
.imp-it .caixa img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.imp-it .nm{display:block;font-weight:800;font-size:14px;margin-top:6px;word-break:break-word}
.imp-it .qd{display:inline-block;font-size:12px;font-weight:800;border-radius:99px;padding:3px 8px;margin-top:4px}
.qd.o{background:#dff3e5;color:#0a5a2c}.qd.b{background:#fff3c4;color:#6b5200}.qd.r{background:#fde0de;color:#a31d17}
.ed{position:fixed;inset:0;z-index:70;background:rgba(10,10,10,.88);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px;color:#fff}
.ed-box{position:relative;overflow:hidden;border-radius:6px;background:#222;touch-action:none;cursor:grab;aspect-ratio:var(--r);width:min(88vw,calc(62vh * var(--r)));outline:3px solid #ffd21f}
.ed-box img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;user-select:none}
.ed p{margin:0;font-size:14px;text-align:center;max-width:420px}
.ed .acoes{margin:0;justify-content:center}
`;
    document.head.appendChild(st);
  }

  function carregarLib() {
    if (window.St && window.St.PageFlip) return Promise.resolve();
    return new Promise((ok, falha) => {
      const sc = document.createElement('script'); sc.src = 'vendor/page-flip.browser.js';
      sc.onload = () => (window.St && window.St.PageFlip) ? ok() : falha(new Error('lib')); sc.onerror = () => falha(new Error('lib'));
      document.head.appendChild(sc);
    });
  }
  const trocaFoco = (de) => { try { if (de && de.focus) de.focus(); } catch (e) { /* sem foco para devolver */ } };

  /* ================= FLIPBOOK ================= */
  async function flipbook(lista) {
    await Promise.all([carregarMinis(lista.map(f => f.id)), carregarLib()]);
    const quemAbriu = document.activeElement;
    const grupos = agrupar(lista), paginas = [];
    paginas.push(`<div class="pg pg-capa" data-density="hard"><div class="in"><span class="sel">Álbum de recados</span><h1>${esc(Album.homenageado)}</h1><p>${lista.length} ${lista.length === 1 ? 'foto' : 'fotos'} e recados dos amigos</p></div></div>`);
    const inner = [];
    grupos.forEach(g => {
      g.fotos.forEach(f => inner.push(`<div class="pg pg-foto"><div class="in"><div class="moldura">${Dono.minis[f.id] ? `<img alt="Foto de ${esc(g.nome)}" src="${Dono.minis[f.id]}">` : ''}</div><p class="leg">${esc(f.legenda || '')}</p><p class="de">de ${esc(g.nome)}</p></div></div>`));
      if (g.recado) inner.push(`<div class="pg pg-recado"><div class="in"><span class="sel">Recado</span><h3>${esc(g.nome)}</h3><blockquote class="${g.recado.length > 220 ? 'longo' : ''}">${esc(g.recado)}</blockquote></div></div>`);
    });
    if (inner.length % 2) inner.push(`<div class="pg pg-fim"><div class="in"><span>Obrigado, amigos!</span></div></div>`);
    paginas.push(...inner);
    paginas.push(`<div class="pg pg-capa" data-density="hard"><div class="in"><span class="sel">Fim</span><h1>${esc(Album.homenageado)}</h1><p>Valeu por fazer parte!</p></div></div>`);

    const ov = document.createElement('div'); ov.className = 'fx-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Álbum digital');
    ov.innerHTML = `<div class="fx-topo"><b>Álbum do ${esc(Album.homenageado)}</b><button class="fx-x" id="fxFechar" aria-label="Fechar o álbum">Fechar ✕</button></div>
      <div class="fx-palco"><div id="flipLivro">${paginas.join('')}</div></div>
      <div class="fx-nav"><button id="fxPrev" aria-label="Página anterior">‹</button><span id="fxPos" role="status" aria-live="polite"></span><button id="fxNext" aria-label="Próxima página">›</button></div>`;
    document.body.appendChild(ov);
    const livro = new window.St.PageFlip(q('#flipLivro', ov), {
      width: 360, height: 500, size: 'stretch', minWidth: 220, maxWidth: 560, minHeight: 320, maxHeight: 780,
      showCover: true, usePortrait: true, maxShadowOpacity: .5, mobileScrollSupport: false, flippingTime: reduzido() ? 150 : 700, drawShadow: !reduzido()
    });
    livro.loadFromHTML(ov.querySelectorAll('.pg'));
    const total = paginas.length, pos = () => {
      const i = livro.getCurrentPageIndex();
      q('#fxPos', ov).textContent = i === 0 ? 'Capa' : i >= total - 1 ? 'Contracapa' : `Página ${i} de ${total - 2}`;
      q('#fxPrev', ov).disabled = i <= 0; q('#fxNext', ov).disabled = i >= total - 1;
    };
    livro.on('flip', () => { pos(); Som.tocar('tick'); });
    pos();
    const fechar = () => { document.removeEventListener('keydown', tecla); try { livro.destroy(); } catch (e) { /* já removido */ } ov.remove(); trocaFoco(quemAbriu); };
    const tecla = e => { if (e.key === 'Escape') fechar(); else if (e.key === 'ArrowRight') livro.flipNext(); else if (e.key === 'ArrowLeft') livro.flipPrev(); };
    document.addEventListener('keydown', tecla);
    q('#fxFechar', ov).onclick = fechar; q('#fxPrev', ov).onclick = () => livro.flipPrev(); q('#fxNext', ov).onclick = () => livro.flipNext();
    q('#fxFechar', ov).focus();
    Som.tocar('ok');
  }

  /* ================= IMPRESSÃO ================= */
  const FORMATOS = [
    { id: '10x15', nome: '10 × 15 cm', a: 10, b: 15 },
    { id: '13x18', nome: '13 × 18 cm', a: 13, b: 18 },
    { id: '15x21', nome: '15 × 21 cm (A5)', a: 15, b: 21 },
    { id: '15x15', nome: '15 × 15 cm (quadrada)', a: 15, b: 15 },
    { id: '20x20', nome: '20 × 20 cm (quadrada)', a: 20, b: 20 }
  ];
  const DPI = 300, px = cm => Math.round(cm / 2.54 * DPI);

  /* tamanho final (cm) de uma foto no formato e orientação escolhidos */
  function tamanho(f, fmt, ori) {
    const W = f.w || 2400, H = f.h || 1800, quad = fmt.a === fmt.b;
    const paisagem = quad ? false : ori === 'paisagem' ? true : ori === 'retrato' ? false : W >= H;
    return paisagem ? { w: Math.max(fmt.a, fmt.b), h: Math.min(fmt.a, fmt.b) } : { w: Math.min(fmt.a, fmt.b), h: Math.max(fmt.a, fmt.b) };
  }
  /* região da foto original que será impressa, a partir do ponto de foco (0 a 100) */
  function recorte(f, t, foco) {
    const W = f.w || 2400, H = f.h || 1800, r = t.w / t.h;
    let cw, ch; if (W / H > r) { ch = H; cw = H * r; } else { cw = W; ch = W / r; }
    return { sx: (W - cw) * foco.x / 100, sy: (H - ch) * foco.y / 100, cw, ch, dpi: cw / (t.w / 2.54) };
  }
  const qualidade = dpi => dpi >= 250 ? ['o', 'Ótima'] : dpi >= 170 ? ['b', 'Boa'] : ['r', 'Baixa: pode ficar granulada'];

  async function impressao(lista) {
    await carregarMinis(lista.map(f => f.id));
    const quemAbriu = document.activeElement;
    const est = { fmt: FORMATOS[0], ori: 'auto', foco: {} };
    lista.forEach(f => { est.foco[f.id] = { x: 50, y: 40 }; });         // por padrão enquadra um pouco acima do centro, onde costumam estar os rostos
    const ov = document.createElement('div'); ov.className = 'ov-claro'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Preparar para impressão');
    ov.innerHTML = `<div class="ov-c"><div class="ov-topo"><h2>Preparar para impressão</h2><button class="x" id="impX" aria-label="Fechar">Fechar ✕</button></div>
      <div class="ov-corpo"><p class="dica">Cada foto é cortada no mesmo tamanho, em ${DPI} dpi, pronta para revelar. Toque numa foto para ajustar o enquadramento. No laboratório, peça para imprimir <b>sem corte e sem ajuste automático</b>.</p>
        <div class="rot">Tamanho</div><div class="filtros" id="impFmt" role="group" aria-label="Tamanho"></div>
        <div class="rot" id="impOriRot">Orientação</div><div class="filtros" id="impOri" role="group" aria-label="Orientação"></div>
        <div class="imp-grade" id="impGrade"></div></div>
      <div class="ov-rodape"><div class="prog oculto" id="impProg"><i></i></div><p class="hint oculto" id="impTx" role="status"></p><button class="btn amarelo" id="impGerar"></button></div></div>`;
    document.body.appendChild(ov);

    const desenhar = () => {
      q('#impFmt', ov).innerHTML = FORMATOS.map(f => `<button class="chip" data-fmt="${f.id}" aria-pressed="${f.id === est.fmt.id}">${f.nome}</button>`).join('');
      const quad = est.fmt.a === est.fmt.b;
      q('#impOriRot', ov).classList.toggle('oculto', quad); q('#impOri', ov).classList.toggle('oculto', quad);
      q('#impOri', ov).innerHTML = [['auto', 'Segue a foto'], ['retrato', 'Tudo em pé'], ['paisagem', 'Tudo deitado']].map(o => `<button class="chip" data-ori="${o[0]}" aria-pressed="${o[0] === est.ori}">${o[1]}</button>`).join('');
      q('#impGrade', ov).innerHTML = lista.map((f, i) => {
        const t = tamanho(f, est.fmt, est.ori), rc = recorte(f, t, est.foco[f.id]), ql = qualidade(rc.dpi), fo = est.foco[f.id];
        return `<button class="imp-it" data-i="${i}" aria-label="Ajustar enquadramento da foto de ${esc(f.nome)}"><span class="caixa" style="--r:${(t.w / t.h).toFixed(4)}"><img alt="" src="${Dono.minis[f.id] || ''}" style="object-position:${fo.x}% ${fo.y}%"></span>
          <span class="nm">${esc(f.nome)}</span><span class="hint" style="margin:0">${t.w} × ${t.h} cm</span><span class="qd ${ql[0]}">${ql[1]}</span></button>`;
      }).join('');
      q('#impGerar', ov).textContent = `Gerar ZIP com ${lista.length} ${lista.length === 1 ? 'foto cortada' : 'fotos cortadas'}`;
      ov.querySelectorAll('[data-fmt]').forEach(b => b.onclick = () => { est.fmt = FORMATOS.find(x => x.id === b.dataset.fmt); desenhar(); });
      ov.querySelectorAll('[data-ori]').forEach(b => b.onclick = () => { est.ori = b.dataset.ori; desenhar(); });
      ov.querySelectorAll('[data-i]').forEach(b => b.onclick = () => editar(lista[+b.dataset.i], b));
    };

    /* editor de enquadramento: arraste a foto dentro da moldura */
    const editar = (f, botao) => {
      const t = tamanho(f, est.fmt, est.ori), fo = est.foco[f.id], W = f.w || 2400, H = f.h || 1800, r = t.w / t.h;
      const ed = document.createElement('div'); ed.className = 'ed'; ed.setAttribute('role', 'dialog'); ed.setAttribute('aria-modal', 'true'); ed.setAttribute('aria-label', 'Ajustar enquadramento');
      ed.innerHTML = `<p>Arraste a foto para escolher o que fica dentro do corte.</p><div class="ed-box" style="--r:${r.toFixed(4)}"><img alt="Foto de ${esc(f.nome)}" src="${Dono.minis[f.id] || ''}"></div>
        <div class="acoes"><button class="btn sec" id="edCentro">Centralizar</button><button class="btn amarelo" id="edOk">Pronto</button></div>`;
      document.body.appendChild(ed);
      const box = q('.ed-box', ed), im = q('img', box), pinta = () => { im.style.objectPosition = `${fo.x}% ${fo.y}%`; };
      pinta();
      let ult = null;
      box.onpointerdown = e => { ult = { x: e.clientX, y: e.clientY }; box.setPointerCapture(e.pointerId); box.style.cursor = 'grabbing'; };
      box.onpointermove = e => {
        if (!ult) return;
        const bw = box.clientWidth, bh = box.clientHeight, esc_ = Math.max(bw / W, bh / H), ox = W * esc_ - bw, oy = H * esc_ - bh;
        if (ox > 0.5) fo.x = Math.min(100, Math.max(0, fo.x - (e.clientX - ult.x) / ox * 100));
        if (oy > 0.5) fo.y = Math.min(100, Math.max(0, fo.y - (e.clientY - ult.y) / oy * 100));
        ult = { x: e.clientX, y: e.clientY }; pinta();
      };
      box.onpointerup = box.onpointercancel = () => { ult = null; box.style.cursor = 'grab'; };
      const sai = () => { ed.remove(); desenhar(); const b = q(`[data-i="${lista.indexOf(f)}"]`, ov); trocaFoco(b || botao); };
      q('#edCentro', ed).onclick = () => { fo.x = 50; fo.y = 50; pinta(); };
      q('#edOk', ed).onclick = sai;
      ed.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); sai(); } });
      q('#edOk', ed).focus();
    };

    const fechar = () => { document.removeEventListener('keydown', tecla); ov.remove(); trocaFoco(quemAbriu); };
    const tecla = e => { if (e.key === 'Escape' && !q('.ed')) fechar(); };
    document.addEventListener('keydown', tecla);
    q('#impX', ov).onclick = fechar;

    q('#impGerar', ov).onclick = async () => {
      const btn = q('#impGerar', ov), prog = q('#impProg', ov), tx = q('#impTx', ov);
      btn.disabled = true; prog.classList.remove('oculto'); tx.classList.remove('oculto');
      const arquivos = [], nomes = {};
      try {
        for (let i = 0; i < lista.length; i++) {
          const f = lista[i], t = tamanho(f, est.fmt, est.ori), rc = recorte(f, t, est.foco[f.id]);
          tx.textContent = `Cortando ${i + 1} de ${lista.length}…`; prog.firstElementChild.style.width = (i / lista.length * 100) + '%';
          const r = await chamar({ acao: 'foto', id: f.id });
          const img = await carregarImg(new Blob([u8doB64(r.dados)], { type: r.mime || 'image/jpeg' }));
          const k = img.naturalWidth / (f.w || img.naturalWidth);          // usa as medidas reais do arquivo recebido
          const sx = rc.sx * k, sy = rc.sy * k, cw = rc.cw * k, ch = rc.ch * k;
          const c = document.createElement('canvas'); c.width = px(t.w); c.height = px(t.h);
          const cx = c.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(img, sx, sy, cw, ch, 0, 0, c.width, c.height);
          const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', .92));
          const nome = String(i + 1).padStart(2, '0') + ' - ' + slug(f.nome) + (f.legenda ? ' - ' + slug(f.legenda) : '') + '.jpg';
          arquivos.push({ nome, dados: new Uint8Array(await blob.arrayBuffer()) }); nomes[f.id] = nome;
          c.width = c.height = 0;
        }
        const leia = `Fotos cortadas para impressão\nTamanho: ${est.fmt.nome}${est.fmt.a === est.fmt.b ? '' : ' (orientação: ' + (est.ori === 'auto' ? 'segue cada foto' : est.ori) + ')'}\nResolução: ${DPI} dpi (${px(est.fmt.a)} × ${px(est.fmt.b)} px no formato retrato)\n\nNo laboratório ou gráfica, peça para imprimir SEM corte e SEM ajuste automático, para o enquadramento ficar como você escolheu.\nOs recados dos amigos estão em recados.txt.\n`;
        arquivos.push({ nome: 'LEIA-ME.txt', dados: new TextEncoder().encode(leia) });
        arquivos.push({ nome: 'recados.txt', dados: new TextEncoder().encode(montarTxt(lista, nomes)) });
        prog.firstElementChild.style.width = '100%'; tx.textContent = 'Pronto! Baixando…'; Som.tocar('pronto');
        baixarBlob(montarZip(arquivos), `impressao-${est.fmt.id}-${slug(Album.homenageado)}.zip`);
      } catch (e) { tx.textContent = 'Não consegui gerar agora. Tente de novo.'; }
      btn.disabled = false;
    };
    desenhar();
    q('#impX', ov).focus();
  }

  window.AlbumExtra = { flipbook, impressao };
})();
