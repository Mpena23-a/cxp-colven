/* =====================================================================
   COLVEN · Cuentas por pagar — utilidades compartidas
   Carga/lectura del Excel, cálculos, formato, temas y exportación PNG.
   ===================================================================== */
(function () {
  const CFG = window.COLVEN_CONFIG || {};

  /* ---------- Tipos ---------- */
  const TIPOS = {
    PROV: 'Proveedor',
    SERV: 'Prestador de servicios',
    AMBOS: 'Ambos',
    NA: 'Sin clasificar',
  };
  const TIPO_ORDEN = [TIPOS.PROV, TIPOS.SERV, TIPOS.AMBOS, TIPOS.NA];
  const TIPO_CORTO = {
    [TIPOS.PROV]: 'Proveedor',
    [TIPOS.SERV]: 'Prestador',
    [TIPOS.AMBOS]: 'Proveedor + Prestador',
    [TIPOS.NA]: 'Sin clasificar',
  };

  /* ---------- Temas (oscuro = pantalla, claro = informes impresos) ----------
     Colores de categoría validados para daltonismo (ΔE CVD ≥ 8). El amarillo
     es el color de marca Colven y siempre identifica a "Proveedor".        */
  const THEMES = {
    dark: {
      name: 'dark',
      bg: '#1D2041', surface: '#252A55', surface2: '#2D3263',
      text: '#F4F5FA', text2: '#B9BDD8', muted: '#8C91B5',
      grid: 'rgba(255,255,255,0.07)', axis: 'rgba(255,255,255,0.22)',
      quadLine: 'rgba(255,216,77,0.55)', quadFill: 'rgba(255,255,255,0.025)',
      ring: '#FFFFFF', brand: '#FFD84D',
      tipo: { [TIPOS.PROV]: '#FFD84D', [TIPOS.SERV]: '#3D8EF0', [TIPOS.AMBOS]: '#E8607A', [TIPOS.NA]: '#9AA0C3' },
      tooltipBg: '#12152E',
    },
    light: {
      name: 'light',
      bg: '#E6EAF2', surface: '#FFFFFF', surface2: '#F1F3F8',
      text: '#1D2041', text2: '#4A4F75', muted: '#7A7FA3',
      grid: 'rgba(29,32,65,0.08)', axis: 'rgba(29,32,65,0.3)',
      quadLine: 'rgba(29,32,65,0.45)', quadFill: 'rgba(29,32,65,0.025)',
      ring: '#1D2041', brand: '#1D2041',
      tipo: { [TIPOS.PROV]: '#E0A800', [TIPOS.SERV]: '#2F6FD0', [TIPOS.AMBOS]: '#D94867', [TIPOS.NA]: '#8C91B5' },
      tooltipBg: '#FFFFFF',
    },
  };

  /* ---------- Formato ---------- */
  const nf0 = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 1 });
  const sym = CFG.simbolo || '$';
  function money(v) { return sym + nf0.format(Math.round(v || 0)); }
  function moneyShort(v) {
    v = v || 0; const a = Math.abs(v);
    if (a >= 1e6) return sym + nf1.format(v / 1e6) + ' M';
    if (a >= 1e3) return sym + nf0.format(v / 1e3) + ' K';
    return sym + nf0.format(v);
  }
  function pct(v) { return nf1.format((v || 0) * 100) + '%'; }
  function int(v) { return nf0.format(v || 0); }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function norm(s) { return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
  function fechaCorte() {
    if (CFG.fechaCorte) return CFG.fechaCorte;
    return new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });
  }
  function shortName(s, n = 26) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  /* ---------- Lectura de datos ---------- */
  function parseNumber(v) {
    if (typeof v === 'number') return v;
    if (v == null) return NaN;
    let s = String(v).replace(/[^0-9,.\-]/g, '');
    if (!s) return NaN;
    const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc > -1 && ld > -1) {
      s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (lc > -1) {
      s = /,\d{3}$/.test(s) && s.split(',').length >= 2 && s.split(',').pop().length === 3 ? s.replace(/,/g, '') : s.replace(',', '.');
    } else if (ld > -1 && s.split('.').length > 2) {
      s = s.replace(/\./g, '');
    }
    return parseFloat(s);
  }

  function normTipo(v) {
    const s = norm(v);
    if (!s) return TIPOS.NA;
    const prov = /prov|sumin|bien|material/.test(s);
    const serv = /serv|prest/.test(s);
    if (/ambos|mixto|\+|\by\b.*prest|ambas/.test(s) || (prov && serv)) return TIPOS.AMBOS;
    if (serv) return TIPOS.SERV;
    if (prov) return TIPOS.PROV;
    return TIPOS.NA;
  }

  /** Detecta columnas por nombre (sin importar el orden). */
  function mapHeader(row) {
    const m = {};
    row.forEach((h, i) => {
      const s = norm(h);
      if (!s) return;
      if (m.empresa == null && /^(empresa|proveedor|razon social|nombre|contratista)/.test(s)) m.empresa = i;
      else if (m.historico == null && /(historic|pagado|pagos)/.test(s)) m.historico = i;
      else if (m.importancia == null && /(importancia|relacion|pozo|peso)/.test(s)) m.importancia = i;
      else if (m.tipo == null && /^(tipo|categoria|clasificacion|figura)/.test(s)) m.tipo = i;
      else if (m.deuda == null && /(deuda|monto|cxp|por pagar|saldo)/.test(s)) m.deuda = i;
    });
    return m;
  }

  function parseRows(aoa) {
    let hIdx = -1, map = null;
    for (let i = 0; i < Math.min(aoa.length, 25); i++) {
      const m = mapHeader(aoa[i] || []);
      if (m.empresa != null && (m.deuda != null || m.importancia != null)) { hIdx = i; map = m; break; }
    }
    if (hIdx < 0) throw new Error('No se encontró la fila de encabezados (debe incluir "Empresa" y "Monto ($)").');
    // divisoria de importancia (celda junto a "Divisoria importancia")
    let divisoriaX = null;
    for (let i = 0; i < hIdx; i++) {
      const r = aoa[i] || [];
      r.forEach((c, j) => {
        if (/divisoria.*importancia/.test(norm(c))) {
          for (let k = j + 1; k < r.length; k++) { const n = parseNumber(r[k]); if (!isNaN(n)) { divisoriaX = n; break; } }
        }
      });
    }
    const filas = [];
    for (let i = hIdx + 1; i < aoa.length; i++) {
      const r = aoa[i] || [];
      const empresa = String(r[map.empresa] ?? '').replace(/\s+/g, ' ').trim();
      if (!empresa || /^total/i.test(empresa)) continue;
      const deuda = map.deuda != null ? parseNumber(r[map.deuda]) : NaN;
      const imp = map.importancia != null ? parseNumber(r[map.importancia]) : NaN;
      filas.push({
        empresa,
        importancia: isNaN(imp) ? null : imp,
        deuda: isNaN(deuda) ? 0 : deuda,
        tipo: map.tipo != null ? r[map.tipo] : '',
        historico: map.historico != null ? parseNumber(r[map.historico]) : NaN,
      });
    }
    return { filas, divisoriaX, tieneHistorico: map.historico != null, tieneTipo: map.tipo != null };
  }

  function parseWorkbook(buf) {
    const wb = XLSX.read(buf, { type: 'array' });
    const name = wb.SheetNames.find(n => /empresa/i.test(n)) || wb.SheetNames[0];
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    return parseRows(aoa);
  }

  /** Normaliza filas y calcula campos derivados. */
  function prepare(raw, fuente) {
    const filas = raw.filas.map((f, i) => ({
      id: 'p' + (i + 1),
      n: i + 1,
      empresa: f.empresa,
      importancia: f.importancia,
      deuda: +f.deuda || 0,
      historico: isNaN(+f.historico) || f.historico == null ? null : +f.historico,
      tipo: normTipo(f.tipo),
    }));
    const imps = filas.map(f => f.importancia).filter(v => v != null);
    const minImp = Math.min(...imps), maxImp = Math.max(...imps);
    let divisoriaX = raw.divisoriaX;
    if (divisoriaX == null) divisoriaX = minImp < 0 ? 0 : 5;
    const promDeuda = filas.reduce((s, f) => s + f.deuda, 0) / (filas.length || 1);
    const conHist = filas.filter(f => f.historico != null);
    const promHist = conHist.reduce((s, f) => s + f.historico, 0) / (conHist.length || 1);
    filas.forEach(f => {
      const alta = f.importancia != null && f.importancia > divisoriaX;
      const altoMonto = f.deuda >= promDeuda;
      f.cuadrante = alta ? (altoMonto ? 1 : 2) : (altoMonto ? 3 : 4);
    });
    // duplicados probables por nombre normalizado
    const key = s => norm(s).replace(/[^a-z0-9]/g, '').replace(/(ca|sa|sas|rl|inc)$/g, '');
    const groups = {};
    filas.forEach(f => { (groups[key(f.empresa)] = groups[key(f.empresa)] || []).push(f.empresa); });
    const duplicados = Object.values(groups).filter(g => g.length > 1);
    return {
      filas, divisoriaX, promDeuda, promHist, minImp, maxImp, duplicados,
      tieneHistorico: raw.tieneHistorico !== false && conHist.length > 0,
      fuente: fuente || '',
    };
  }

  async function loadData() {
    const url = (CFG.archivoExcel || 'data/Matriz_Contratistas.xlsx');
    try {
      if (location.protocol === 'file:') throw new Error('file');
      const res = await fetch(url + '?v=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = await res.arrayBuffer();
      return prepare(parseWorkbook(buf), url.split('/').pop());
    } catch (e) {
      if (window.COLVEN_DATA_FALLBACK) {
        const d = window.COLVEN_DATA_FALLBACK;
        return prepare({ filas: d.filas, divisoriaX: d.divisoriaX, tieneHistorico: true }, 'Datos de respaldo (js/data-fallback.js)');
      }
      throw e;
    }
  }

  /* ---------- Resumen (sin doble conteo) ---------- */
  function summarize(list) {
    const s = { n: list.length, total: 0, prov: 0, serv: 0, ambos: 0, na: 0, nProv: 0, nServ: 0, nAmbos: 0, nNa: 0, soloProv: 0, soloServ: 0, nSoloProv: 0, nSoloServ: 0, hist: 0, ambosList: [] };
    list.forEach(f => {
      s.total += f.deuda; s.hist += f.historico || 0;
      if (f.tipo === TIPOS.PROV) { s.soloProv += f.deuda; s.nSoloProv++; }
      if (f.tipo === TIPOS.SERV) { s.soloServ += f.deuda; s.nSoloServ++; }
      if (f.tipo === TIPOS.AMBOS) { s.ambos += f.deuda; s.nAmbos++; s.ambosList.push(f); }
      if (f.tipo === TIPOS.NA) { s.na += f.deuda; s.nNa++; }
    });
    s.prov = s.soloProv + s.ambos; s.nProv = s.nSoloProv + s.nAmbos;
    s.serv = s.soloServ + s.ambos; s.nServ = s.nSoloServ + s.nAmbos;
    s.ambosList.sort((a, b) => b.deuda - a.deuda);
    const sorted = list.slice().sort((a, b) => b.deuda - a.deuda);
    s.top5 = sorted.slice(0, 5).reduce((a, f) => a + f.deuda, 0);
    s.top5Pct = s.total ? s.top5 / s.total : 0;
    s.promedio = s.n ? s.total / s.n : 0;
    s.mayor = sorted[0] || null;
    return s;
  }

  const CUADRANTES = {
    1: { label: 'Alta importancia · Alto monto', short: 'Prioridad alta' },
    2: { label: 'Alta importancia · Bajo monto', short: 'Estratégico al día' },
    3: { label: 'Baja importancia · Alto monto', short: 'Revisar' },
    4: { label: 'Baja importancia · Bajo monto', short: 'Bajo impacto' },
  };

  /* ---------- Animación de cifras ---------- */
  function countUp(el, to, fmt, dur = 700) {
    const from = +el.dataset.v || 0; el.dataset.v = to;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    function step(t) {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- Exportación PNG con marca ---------- */
  let logoImg = null;
  function getLogo() {
    if (logoImg) return Promise.resolve(logoImg);
    return new Promise(res => {
      const im = new Image();
      im.onload = () => { logoImg = im; res(im); };
      im.onerror = () => res(null);
      im.src = 'assets/logo-colven.png';
    });
  }
  function loadImage(src) {
    return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  }

  /**
   * Renderiza una opción de ECharts fuera de pantalla y la compone en un PNG.
   * @param {Function} buildOption  (theme) => echarts option
   * @param {Object} o  { title, subtitle, kpis:[{label,value}], note, theme:'dark'|'light'|'transparent', w, h, fileName }
   */
  async function exportChartPNG(buildOption, o) {
    const themeKey = o.theme === 'light' ? 'light' : 'dark';
    const T = THEMES[themeKey];
    const W = o.w || 1600, H = o.h || 900;
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:-99999px;top:0;width:${W}px;height:${H}px;`;
    document.body.appendChild(host);
    const chart = echarts.init(host, null, { renderer: 'canvas', width: W, height: H, devicePixelRatio: 2 });
    const opt = buildOption(T, { exporting: true, w: W, h: H });
    opt.animation = false;
    chart.setOption(opt);
    const chartURL = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: o.theme === 'transparent' ? 'transparent' : T.surface });
    chart.dispose(); host.remove();
    const chartImg = await loadImage(chartURL);

    if (o.theme === 'transparent') { download(chartURL, o.fileName || 'grafico.png'); return; }

    const S = 2, pad = 56 * S;
    const headH = 150 * S, kpiH = o.kpis && o.kpis.length ? 120 * S : 0, footH = 64 * S;
    const cw = W * S + pad * 2, ch = headH + kpiH + H * S + footH + pad;
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    // fondo
    g.fillStyle = themeKey === 'light' ? '#FFFFFF' : T.bg; g.fillRect(0, 0, cw, ch);
    // banda de encabezado
    g.fillStyle = '#1D2041'; g.fillRect(0, 0, cw, headH);
    g.fillStyle = '#FFD84D'; g.fillRect(0, headH - 6 * S, cw, 6 * S);
    const logo = await getLogo();
    if (logo) { const lh = 96 * S, lw = logo.width * lh / logo.height; g.drawImage(logo, cw - pad - lw, (headH - lh) / 2 - 3 * S, lw, lh); }
    g.fillStyle = '#FFFFFF'; g.textBaseline = 'alphabetic';
    g.font = `700 ${38 * S}px Poppins, Inter, Arial, sans-serif`;
    g.fillText(o.title || '', pad, 66 * S);
    g.fillStyle = '#C9CCE4'; g.font = `400 ${21 * S}px Inter, Arial, sans-serif`;
    g.fillText(o.subtitle || '', pad, 104 * S);
    // KPIs
    let y = headH + 24 * S;
    if (kpiH) {
      const n = o.kpis.length, gap = 20 * S, bw = (cw - pad * 2 - gap * (n - 1)) / n;
      o.kpis.forEach((k, i) => {
        const x = pad + i * (bw + gap);
        g.fillStyle = themeKey === 'light' ? '#F3F4F9' : T.surface; roundRect(g, x, y, bw, 88 * S, 12 * S); g.fill();
        g.fillStyle = k.color || (themeKey === 'light' ? '#1D2041' : '#FFD84D'); g.fillRect(x, y + 14 * S, 5 * S, 60 * S);
        g.fillStyle = T.text2; g.font = `500 ${16 * S}px Inter, Arial, sans-serif`; g.fillText(k.label, x + 22 * S, y + 34 * S);
        g.fillStyle = T.text; g.font = `700 ${30 * S}px Poppins, Inter, Arial, sans-serif`; g.fillText(k.value, x + 22 * S, y + 72 * S);
      });
      y += kpiH;
    }
    // gráfico
    g.fillStyle = themeKey === 'light' ? '#FFFFFF' : T.surface; roundRect(g, pad - 8 * S, y - 8 * S, W * S + 16 * S, H * S + 16 * S, 14 * S); g.fill();
    g.drawImage(chartImg, pad, y, W * S, H * S);
    y += H * S + 22 * S;
    // pie
    g.fillStyle = T.muted; g.font = `400 ${16 * S}px Inter, Arial, sans-serif`;
    g.fillText(`${CFG.empresa || 'Colven Business & Corp.'} · ${CFG.area || ''} · Corte: ${fechaCorte()}`, pad, y + 26 * S);
    if (o.note) { g.textAlign = 'right'; g.fillText(o.note, cw - pad, y + 26 * S); g.textAlign = 'left'; }
    download(c.toDataURL('image/png'), o.fileName || 'grafico.png');
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function download(url, name) { const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  function slug(s) { return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }
  function stamp() { const d = new Date(); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }

  /* ---------- Tooltip compartido ---------- */
  function tooltipHTML(f, T, extra) {
    const c = T.tipo[f.tipo];
    return `<div class="tt">
      <div class="tt-name">${esc(f.empresa)}</div>
      <div class="tt-tipo"><i style="background:${c}"></i>${esc(TIPO_CORTO[f.tipo])}</div>
      <table>
        <tr><td>Deuda vigente</td><td><b>${money(f.deuda)}</b></td></tr>
        ${f.historico != null ? `<tr><td>Histórico pagado</td><td>${money(f.historico)}</td></tr>` : ''}
        <tr><td>Importancia operativa</td><td>${f.importancia ?? '—'}</td></tr>
        <tr><td>Cuadrante</td><td>${CUADRANTES[f.cuadrante].label}</td></tr>
        ${extra || ''}
      </table>
    </div>`;
  }
  function tooltipBase(T) {
    return {
      backgroundColor: T.tooltipBg, borderColor: T.name === 'dark' ? 'rgba(255,216,77,.35)' : 'rgba(29,32,65,.15)', borderWidth: 1,
      padding: 0, extraCssText: 'border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.35);',
      textStyle: { color: T.text, fontFamily: 'Inter, sans-serif' },
      transitionDuration: 0.2, confine: true,
    };
  }

  window.COLVEN = {
    CFG, TIPOS, TIPO_ORDEN, TIPO_CORTO, THEMES, CUADRANTES,
    money, moneyShort, pct, int, esc, norm, shortName, fechaCorte,
    parseWorkbook, prepare, loadData, summarize, countUp,
    exportChartPNG, slug, stamp, tooltipHTML, tooltipBase,
  };
})();
