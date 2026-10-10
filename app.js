'use strict';
/* =====================================================================
   Factux — lógica. Funciones puras arriba (testeables en Node),
   wiring del DOM abajo (solo corre en el navegador).
   ===================================================================== */

/* ---------- Constantes del paywall (copiar EXACTO, sin tipeos) ---------- */
var USDT_BSC_CONTRACT = '0x55d398326f99059ff775485246999027b3197955';
var OUR_USDT_ADDRESS  = '0xb2a38e074808f0c0d4ee9c13f5894c6c601fb172';
var PAYPAL_EMAIL      = 'chachiafk@gmail.com';
var USDT_DECIMALS     = 18;
var PRO_PRICE_USDT    = 19;
/* topic del evento ERC-20 Transfer(address,address,uint256) */
var TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4d9aa8';
var BSC_RPCS = [
  'https://bsc-dataseed.binance.org',
  'https://bsc-dataseed1.binance.org',
  'https://bsc-dataseed2.binance.org',
  'https://bsc-dataseed3.binance.org',
  'https://bsc.publicnode.com'
];

/* ---------- Utilidades puras ---------- */
function round2(x){
  var n = Number(x);
  if (!isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function escapeHtml(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* Cálculo de totales. lines: [{qty, unit}] — números o strings numéricos. */
function calcTotals(lines, taxPct, discountPct){
  var tax = Math.max(0, Number(taxPct) || 0);
  var disc = Math.min(100, Math.max(0, Number(discountPct) || 0));
  var subtotal = 0;
  (lines || []).forEach(function(l){
    var q = Math.max(0, Number(l.qty) || 0);
    var u = Math.max(0, Number(l.unit) || 0);
    subtotal += q * u;
  });
  subtotal = round2(subtotal);
  var discountAmt = round2(subtotal * disc / 100);
  var taxable = round2(subtotal - discountAmt);
  var taxAmt = round2(taxable * tax / 100);
  var total = round2(taxable + taxAmt);
  return { subtotal: subtotal, discountAmt: discountAmt, taxable: taxable,
           taxAmt: taxAmt, total: total, taxPct: tax, discountPct: disc };
}

var CURRENCY_LOCALES = { DOP:'es-DO', USD:'es-DO', MXN:'es-MX', COP:'es-CO', CRC:'es-CR', PEN:'es-PE' };

function formatMoney(amount, currency){
  var cur = CURRENCY_LOCALES[currency] ? currency : 'USD';
  var loc = CURRENCY_LOCALES[cur];
  var n = Number(amount);
  if (!isFinite(n)) n = 0;
  try {
    return new Intl.NumberFormat(loc, { style:'currency', currency:cur,
      minimumFractionDigits:2, maximumFractionDigits:2 }).format(n);
  } catch(e){
    return cur + ' ' + n.toFixed(2);
  }
}

/* Numeración secuencial. store: {getItem,setItem} (localStorage en browser). */
function seqKey(kind){ return 'factux_seq_' + kind; }
function seqPrefix(kind){ return kind === 'COT' ? 'COT' : 'FAC'; }
function pad4(n){ return String(n).padStart(4, '0'); }

function peekNumber(kind, store){
  var k = seqPrefix(kind);
  var cur = parseInt(store.getItem(seqKey(k)) || '0', 10) || 0;
  return k + '-' + pad4(cur + 1);
}
function consumeNumber(kind, store){
  var k = seqPrefix(kind);
  var cur = parseInt(store.getItem(seqKey(k)) || '0', 10) || 0;
  var next = cur + 1;
  store.setItem(seqKey(k), String(next));
  return k + '-' + pad4(next);
}
/* atómica: devuelve el siguiente y lo consume (para tests y uso simple) */
function getNextNumber(kind, store){
  return consumeNumber(kind, store);
}

/* ---------- Esquema del código PRO por PayPal ----------
   código válido = primeros 16 hex de SHA-256("CHACHI-PRO-" + email en
   minúsculas y sin espacios). El comprador envía su recibo de PayPal a
   chachiafk@gmail.com y recibe su código por correo. */
function normalizeEmailForCode(email){
  return String(email || '').toLowerCase().replace(/\s+/g, '');
}
function proCodeForEmail(email){
  var norm = normalizeEmailForCode(email);
  var data = new TextEncoder().encode('CHACHI-PRO-' + norm);
  return crypto.subtle.digest('SHA-256', data).then(function(buf){
    var hex = Array.prototype.map.call(new Uint8Array(buf), function(b){
      return b.toString(16).padStart(2, '0');
    }).join('');
    return hex.slice(0, 16);
  });
}

/* ---------- Verificación on-chain del pago USDT (BSC) ----------
   receipt: objeto JSON de eth_getTransactionReceipt.
   Reglas: status == 0x1, y al menos un evento Transfer del contrato
   oficial USDT-BSC hacia OUR_USDT_ADDRESS cuya suma >= 19 USDT
   (18 decimales, aritmética BigInt exacta). */
function parseUsdtPayment(receipt, ourAddress){
  var our = String(ourAddress || '').toLowerCase();
  if (!receipt || typeof receipt !== 'object'){
    return { ok:false, reason:'receipt_invalido' };
  }
  var st = String(receipt.status || '').toLowerCase();
  if (st !== '0x1' && st !== '0x01'){
    return { ok:false, reason:'transaccion_fallida' };
  }
  var total = 0n;
  var logs = receipt.logs || [];
  for (var i = 0; i < logs.length; i++){
    var log = logs[i] || {};
    if (String(log.address || '').toLowerCase() !== USDT_BSC_CONTRACT) continue;
    var topics = log.topics || [];
    if (topics.length < 3) continue;
    if (String(topics[0] || '').toLowerCase() !== TRANSFER_TOPIC) continue;
    var to = '0x' + String(topics[2]).slice(-40).toLowerCase();
    if (to !== our) continue;
    try { total += BigInt(log.data || '0x0'); } catch(e){ /* dato malformado: ignorar */ }
  }
  var required = BigInt(PRO_PRICE_USDT) * (10n ** BigInt(USDT_DECIMALS));
  if (total >= required){
    return { ok:true, reason:'ok', total: total.toString(), required: required.toString() };
  }
  return { ok:false, reason:'monto_insuficiente', total: total.toString(), required: required.toString() };
}

/* Llama eth_getTransactionReceipt a los RPC públicos de BSC con fallback. */
function verifyBscTxHash(txHash){
  var hash = String(txHash || '').trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)){
    return Promise.resolve({ ok:false, reason:'hash_invalido' });
  }
  var body = JSON.stringify({ jsonrpc:'2.0', id:1, method:'eth_getTransactionReceipt', params:[hash] });
  var attempt = function(idx){
    if (idx >= BSC_RPCS.length){
      return Promise.resolve({ ok:false, reason:'rpc_no_disponible' });
    }
    var ctrl = new AbortController();
    var timer = setTimeout(function(){ ctrl.abort(); }, 12000);
    return fetch(BSC_RPCS[idx], {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: body, signal: ctrl.signal
    }).then(function(res){
      clearTimeout(timer);
      if (!res.ok) return attempt(idx + 1);
      return res.json();
    }).then(function(json){
      if (!json || !json.result) return attempt(idx + 1);
      return parseUsdtPayment(json.result, OUR_USDT_ADDRESS);
    }).catch(function(){ return attempt(idx + 1); });
  };
  return attempt(0);
}

/* =====================================================================
   BROWSER: wiring del DOM (no se ejecuta en Node)
   ===================================================================== */
if (typeof window !== 'undefined' && typeof document !== 'undefined') (function(){
  var $ = function(id){ return document.getElementById(id); };
  var LS_DOC = 'factux_doc_v1';
  var LS_PRO = 'factux_pro';

  var state = {
    docType: 'FAC',          // 'FAC' | 'COT'
    status: 'borrador',      // borrador | emitida | pagada
    number: '',
    autoNumber: true,
    date: '', due: '',
    emName:'', emRnc:'', emCountry:'República Dominicana', emContact:'',
    clName:'', clEmail:'',
    lines: [{desc:'', qty:1, unit:0}],
    currency:'DOP', taxOn:true, taxRate:18, discount:0, notes:'',
    logoUrl:'', template:'tpl-clasico'
  };

  function isPro(){
    try { return localStorage.getItem(LS_PRO) === '1'; } catch(e){ return false; }
  }

  /* ---------- persistencia ---------- */
  function save(){
    try { localStorage.setItem(LS_DOC, JSON.stringify(state)); } catch(e){}
  }
  function load(){
    try {
      var raw = localStorage.getItem(LS_DOC);
      if (raw){ var s = JSON.parse(raw); for (var k in s){ state[k] = s[k]; } }
    } catch(e){}
    if (!state.lines || !state.lines.length) state.lines = [{desc:'', qty:1, unit:0}];
  }

  /* ---------- numeración ---------- */
  function refreshNumberDisplay(){
    if (state.autoNumber){
      state.number = peekNumber(state.docType, localStorage);
    }
    $('inv-number').value = state.number;
  }
  function onTypeChange(){
    state.docType = state.docType === 'FAC' ? 'COT' : 'FAC';
    state.autoNumber = true;
    $('btn-fac').classList.toggle('active', state.docType === 'FAC');
    $('btn-cot').classList.toggle('active', state.docType === 'COT');
    refreshNumberDisplay(); save(); render();
  }

  /* ---------- líneas ---------- */
  function renderLines(){
    var box = $('lines'); box.innerHTML = '';
    state.lines.forEach(function(l, i){
      var div = document.createElement('div');
      div.className = 'line-item';
      div.innerHTML =
        '<div><label class="f">Descripción</label><input type="text" data-i="'+i+'" data-f="desc" value="'+escapeHtml(l.desc)+'" placeholder="Ej: Diseño de logo"></div>'+
        '<div><label class="f">Cant.</label><input type="number" data-i="'+i+'" data-f="qty" min="0" step="1" value="'+escapeHtml(l.qty)+'"></div>'+
        '<div><label class="f">P. unitario</label><input type="number" data-i="'+i+'" data-f="unit" min="0" step="0.01" value="'+escapeHtml(l.unit)+'"></div>'+
        '<button type="button" class="rm" data-i="'+i+'" title="Quitar línea">×</button>';
      box.appendChild(div);
    });
  }

  /* ---------- preview ---------- */
  var STATUS_LABEL = { borrador:'Borrador', emitida:'Emitida', pagada:'Pagada' };
  var TAX_LABEL = { 'República Dominicana':'ITBIS', 'México':'IVA', 'Colombia':'IVA', 'Perú':'IGV', 'Costa Rica':'IVA', 'Otro país LATAM':'Impuesto' };

  function render(){
    var pro = isPro();
    var t = calcTotals(state.lines, state.taxOn ? state.taxRate : 0, state.discount);
    var tpl = pro ? state.template : 'tpl-clasico';
    var sheet = $('sheet');
    sheet.className = 'sheet ' + tpl;

    var title = state.docType === 'FAC' ? 'FACTURA' : 'COTIZACIÓN';
    var taxName = TAX_LABEL[state.emCountry] || 'Impuesto';
    var wm = pro ? '' : '<div class="wm"><span>Generado con Factux</span></div>';

    var logo = (pro && state.logoUrl) ? '<div class="sheet-logo"><img src="'+escapeHtml(state.logoUrl)+'" alt="Logo"></div>' : '';

    var emisorExtra = state.emRnc ? '<p>RNC/NIT: '+escapeHtml(state.emRnc)+'</p>' : '';
    if (state.emContact) emisorExtra += '<p>'+escapeHtml(state.emContact)+'</p>';

    var rows = state.lines.map(function(l, i){
      var q = Math.max(0, Number(l.qty) || 0);
      var u = Math.max(0, Number(l.unit) || 0);
      return '<tr><td>'+(i+1)+'</td><td>'+escapeHtml(l.desc || '—')+'</td>'+
        '<td class="n">'+q+'</td><td class="n">'+formatMoney(u, state.currency)+'</td>'+
        '<td class="n">'+formatMoney(round2(q*u), state.currency)+'</td></tr>';
    }).join('');

    var totRows =
      '<div class="trow"><span>Subtotal</span><span>'+formatMoney(t.subtotal, state.currency)+'</span></div>'+
      (t.discountAmt > 0 ? '<div class="trow"><span>Descuento ('+t.discountPct+'%)</span><span>−'+formatMoney(t.discountAmt, state.currency)+'</span></div>' : '')+
      (state.taxOn ? '<div class="trow"><span>'+taxName+' ('+t.taxPct+'%)</span><span>'+formatMoney(t.taxAmt, state.currency)+'</span></div>' : '')+
      '<div class="trow grand"><span>Total</span><span>'+formatMoney(t.total, state.currency)+'</span></div>';

    var notes = state.notes ? '<div class="sheet-notes"><b>Notas:</b> '+escapeHtml(state.notes)+'</div>' : '';
    var foot = pro ? '¡Gracias por su preferencia!' : 'Generado con Factux · factux';

    sheet.innerHTML = wm +
      '<div class="sheet-head"><div style="display:flex;gap:14px;align-items:center">'+logo+
      '<div class="sheet-emisor"><h4>'+escapeHtml(state.emName || 'Tu negocio')+'</h4>'+
      '<p>'+escapeHtml(state.emCountry)+'</p>'+emisorExtra+'</div></div>'+
      '<div class="sheet-title"><h2>'+title+'</h2><div class="num">'+escapeHtml(state.number)+
      '</div><span class="badge '+state.status+'">'+STATUS_LABEL[state.status]+'</span></div></div>'+
      '<div class="sheet-meta"><div class="box"><h5>Facturar a</h5><div><b>'+escapeHtml(state.clName || 'Cliente')+'</b>'+
      (state.clEmail ? '<br>'+escapeHtml(state.clEmail) : '')+'</div></div>'+
      '<div class="box" style="text-align:right"><h5>Fecha</h5><div>'+escapeHtml(state.date || '—')+'</div>'+
      '<h5 style="margin-top:8px">Vencimiento</h5><div>'+escapeHtml(state.due || '—')+'</div></div></div>'+
      '<table class="items"><thead><tr><th>#</th><th>Descripción</th><th class="n">Cant.</th><th class="n">P. unitario</th><th class="n">Importe</th></tr></thead>'+
      '<tbody>'+rows+'</tbody></table>'+
      '<div class="totals">'+totRows+'</div>'+notes+
      '<div class="sheet-foot">'+escapeHtml(foot)+'</div>';

    /* bloqueo PRO */
    $('prolock').classList.toggle('locked', !pro);
    $('locknote').style.display = pro ? 'none' : 'block';
    var tplSel = $('template');
    Array.prototype.forEach.call(tplSel.options, function(o){
      o.disabled = !pro && o.value !== 'tpl-clasico';
    });
    if (!pro) state.template = 'tpl-clasico';
  }

  /* ---------- lectura del formulario ---------- */
  function bindSimple(id, key, isNum){
    $(id).addEventListener('input', function(){
      state[key] = isNum ? (Number(this.value) || 0) : this.value;
      save(); render();
    });
  }

  function init(){
    load();
    if (!state.date){
      var d = new Date();
      state.date = d.toISOString().slice(0,10);
    }

    /* valores iniciales del form */
    $('em-name').value = state.emName; $('em-rnc').value = state.emRnc;
    $('em-country').value = state.emCountry; $('em-contact').value = state.emContact;
    $('cl-name').value = state.clName; $('cl-email').value = state.clEmail;
    $('doc-date').value = state.date; $('doc-due').value = state.due;
    $('currency').value = state.currency;
    $('discount').value = state.discount;
    $('tax-on').checked = !!state.taxOn; $('tax-rate').value = state.taxRate;
    $('notes').value = state.notes;
    $('logo-url').value = state.logoUrl; $('template').value = state.template;
    $('btn-fac').classList.toggle('active', state.docType === 'FAC');
    $('btn-cot').classList.toggle('active', state.docType === 'COT');
    Array.prototype.forEach.call(document.querySelectorAll('#doc-status-lbl button'), function(b){
      b.classList.toggle('active', b.getAttribute('data-st') === state.status);
    });

    bindSimple('em-name','emName'); bindSimple('em-rnc','emRnc'); bindSimple('em-contact','emContact');
    bindSimple('cl-name','clName'); bindSimple('cl-email','clEmail');
    bindSimple('notes','notes'); bindSimple('logo-url','logoUrl');
    bindSimple('discount','discount',true); bindSimple('tax-rate','taxRate',true);

    $('em-country').addEventListener('change', function(){ state.emCountry = this.value; save(); render(); });
    $('currency').addEventListener('change', function(){ state.currency = this.value; save(); render(); });
    $('template').addEventListener('change', function(){ state.template = this.value; save(); render(); });
    $('doc-date').addEventListener('change', function(){ state.date = this.value; save(); render(); });
    $('doc-due').addEventListener('change', function(){ state.due = this.value; save(); render(); });
    $('tax-on').addEventListener('change', function(){ state.taxOn = this.checked; save(); render(); });

    $('inv-number').addEventListener('input', function(){
      state.number = this.value; state.autoNumber = false; save(); render();
    });

    $('btn-fac').addEventListener('click', function(){ if (state.docType !== 'FAC') onTypeChange(); });
    $('btn-cot').addEventListener('click', function(){ if (state.docType !== 'COT') onTypeChange(); });

    Array.prototype.forEach.call(document.querySelectorAll('#doc-status-lbl button'), function(b){
      b.addEventListener('click', function(){
        state.status = b.getAttribute('data-st');
        Array.prototype.forEach.call(document.querySelectorAll('#doc-status-lbl button'), function(x){
          x.classList.toggle('active', x === b);
        });
        save(); render();
      });
    });

    /* líneas: delegación de eventos */
    $('lines').addEventListener('input', function(e){
      var t = e.target;
      if (!t.getAttribute('data-i')) return;
      var i = +t.getAttribute('data-i'), f = t.getAttribute('data-f');
      state.lines[i][f] = (f === 'desc') ? t.value : (Number(t.value) || 0);
      save(); render();
    });
    $('lines').addEventListener('click', function(e){
      if (!e.target.classList.contains('rm')) return;
      var i = +e.target.getAttribute('data-i');
      if (state.lines.length > 1) state.lines.splice(i, 1);
      else state.lines = [{desc:'', qty:1, unit:0}];
      renderLines(); save(); render();
    });
    $('add-line').addEventListener('click', function(){
      state.lines.push({desc:'', qty:1, unit:0});
      renderLines(); save(); render();
    });

    /* imprimir: consume el número automático si no fue editado */
    $('btn-print').addEventListener('click', function(){
      if (state.autoNumber){
        state.number = consumeNumber(state.docType, localStorage);
        $('inv-number').value = state.number;
      }
      save(); render();
      window.print();
    });

    $('btn-clear').addEventListener('click', function(){
      if (!confirm('¿Limpiar todos los datos del documento?')) return;
      state.lines = [{desc:'', qty:1, unit:0}];
      state.emName=''; state.emRnc=''; state.emContact='';
      state.clName=''; state.clEmail=''; state.notes='';
      state.discount=0; state.autoNumber=true;
      try { localStorage.removeItem(LS_DOC); } catch(e){}
      init._reload = true; location.reload();
    });

    /* copiar direcciones */
    Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function(b){
      b.addEventListener('click', function(){
        var v = b.getAttribute('data-copy');
        var done = function(){ b.textContent = '✓ Copiado'; setTimeout(function(){ b.textContent = b.classList.contains('copybtn') && b.textContent.indexOf('dirección')>-1 ? 'Copiar dirección' : (b.textContent.indexOf('correo')>-1 ? 'Copiar correo' : 'Copiar'); }, 1800); };
        if (navigator.clipboard && navigator.clipboard.writeText){
          navigator.clipboard.writeText(v).then(done, done);
        } else {
          var ta = document.createElement('textarea'); ta.value = v;
          document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); } catch(e){}
          document.body.removeChild(ta); done();
        }
      });
    });

    /* modal PRO */
    var modal = $('pro-modal');
    $('btn-pro').addEventListener('click', function(){ modal.classList.add('open'); });
    $('modal-close').addEventListener('click', function(){ modal.classList.remove('open'); });
    modal.addEventListener('click', function(e){ if (e.target === modal) modal.classList.remove('open'); });
    $('mtab-usdt').addEventListener('click', function(){
      $('mtab-usdt').classList.add('active'); $('mtab-pp').classList.remove('active');
      $('mpane-usdt').classList.add('active'); $('mpane-pp').classList.remove('active');
    });
    $('mtab-pp').addEventListener('click', function(){
      $('mtab-pp').classList.add('active'); $('mtab-usdt').classList.remove('active');
      $('mpane-pp').classList.add('active'); $('mpane-usdt').classList.remove('active');
    });

    function unlockPro(){
      try { localStorage.setItem(LS_PRO, '1'); } catch(e){}
      render();
      $('verify-msg').textContent = '🎉 ¡PRO activado! Ya tienes logo, 5 plantillas y documentos sin marca.';
      $('verify-msg').className = 'verify-msg ok';
      $('pp-msg').textContent = '🎉 ¡PRO activado! Ya tienes logo, 5 plantillas y documentos sin marca.';
      $('pp-msg').className = 'verify-msg ok';
      setTimeout(function(){ modal.classList.remove('open'); }, 1800);
    }

    $('btn-verify').addEventListener('click', function(){
      var msg = $('verify-msg');
      var hash = $('tx-hash').value.trim();
      msg.textContent = '⏳ Consultando la blockchain de BSC…';
      msg.className = 'verify-msg work';
      verifyBscTxHash(hash).then(function(r){
        if (r.ok){ unlockPro(); return; }
        var textos = {
          hash_invalido: '❌ Ese hash no tiene formato válido (debe ser 0x + 64 caracteres hex).',
          transaccion_fallida: '❌ La transacción existe pero falló en la blockchain.',
          monto_insuficiente: '❌ No encontramos ≥19 USDT hacia nuestra dirección en esa transacción. Revisa el hash.',
          receipt_invalido: '❌ No se encontró esa transacción todavía. Espera unos segundos y reintenta.',
          rpc_no_disponible: '❌ No pudimos consultar la red ahora mismo. Reintenta en un minuto.'
        };
        msg.textContent = textos[r.reason] || '❌ No pudimos verificar el pago.';
        msg.className = 'verify-msg err';
      });
    });

    $('btn-pp-verify').addEventListener('click', function(){
      var msg = $('pp-msg');
      var email = $('pp-code-email').value.trim();
      var code = $('pp-code').value.trim().toLowerCase();
      if (!email || !code){ msg.textContent = '❌ Escribe tu correo y el código que te enviamos.'; msg.className='verify-msg err'; return; }
      msg.textContent = '⏳ Verificando código…'; msg.className = 'verify-msg work';
      proCodeForEmail(email).then(function(expected){
        if (code === expected){ unlockPro(); }
        else { msg.textContent = '❌ Código incorrecto para ese correo. Revisa mayúsculas y espacios.'; msg.className='verify-msg err'; }
      });
    });

    if (isPro()){ /* ya desbloqueado antes */ }
    renderLines();
    refreshNumberDisplay();
    render();
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();

/* Exportar funciones puras para las pruebas en Node */
if (typeof module !== 'undefined' && module.exports){
  module.exports = {
    USDT_BSC_CONTRACT: USDT_BSC_CONTRACT,
    OUR_USDT_ADDRESS: OUR_USDT_ADDRESS,
    PAYPAL_EMAIL: PAYPAL_EMAIL,
    TRANSFER_TOPIC: TRANSFER_TOPIC,
    BSC_RPCS: BSC_RPCS,
    PRO_PRICE_USDT: PRO_PRICE_USDT,
    round2: round2,
    escapeHtml: escapeHtml,
    calcTotals: calcTotals,
    formatMoney: formatMoney,
    peekNumber: peekNumber,
    consumeNumber: consumeNumber,
    getNextNumber: getNextNumber,
    normalizeEmailForCode: normalizeEmailForCode,
    proCodeForEmail: proCodeForEmail,
    parseUsdtPayment: parseUsdtPayment,
    verifyBscTxHash: verifyBscTxHash
  };
}
