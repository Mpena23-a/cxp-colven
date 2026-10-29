/* =====================================================================
   COLVEN · Cuentas por pagar — panel principal
   ===================================================================== */
(function () {
  const C = window.COLVEN;
  const { TIPOS, THEMES, CUADRANTES, money, moneyShort, pct, int, esc, norm } = C;
  const T = THEMES.light;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  const DEFAULT_F = { q: '', tipo: 'all', quad: 0, impMin: null, impMax: null, sort: 'deuda', dir: 'desc', top: 0 };
  const state = {
    data: null,
    f: { ...DEFAULT_F },
    view: 'matriz',
    yScale: 'log',
    sel: new Set(),
    tableSort: null,
    list: [],
  };
  window.COLVEN_STATE = state; // accesible para la ventana de análisis

  let main, quad;

  /* ---------------- Carga ---------------- */
  async function init() {
    $('#corte').textContent = 'Corte: ' + C.fechaCorte();
    $('#ribbon').hidden = !C.CFG.datosDeEjemplo;
    $$('.dot[data-t]').forEach(d => d.style.background = T.tipo[d.dataset.t]);
    main = echarts.init($('#mainChart'), null, { renderer: 'canvas' });
    quad = echarts.init($('#quadChart'), null, { renderer: 'canvas' });
    let rz; new ResizeObserver(() => {
      if (state.route === 'analisis') { window.COLVEN_ANALISIS && window.COLVEN_ANALISIS.resize(); return; }
      main.resize(); quad.resize(); clearTimeout(rz);
      rz = setTimeout(() => state.data && main.setOption(buildMain(T), { replaceMerge: ['series'] }), 200);
    }).observe(document.body);
    bindUI();
    try {
      setData(await C.loadData());
    } catch (e) {
      toast('No se pudo leer el Excel: ' + e.message, true);
    }
  }

  function setData(d) {
    state.data = d;
    state.sel.clear();
    // rangos de importancia
    const opts = [];
    for (let v = Math.floor(d.minImp); v <= Math.ceil(d.maxImp); v++) opts.push(v);
    $('#fImpMin').innerHTML = opts.map(v => `<option value="${v}">${v}</option>`).join('');
    $('#fImpMax').innerHTML = opts.map(v => `<option value="${v}">${v}</option>`).join('');
    state.f.impMin = opts[0]; state.f.impMax = opts[opts.length - 1];
    $('#fImpMin').value = state.f.impMin; $('#fImpMax').value = state.f.impMax;
    $('#fSort option[value="historico"]').disabled = !d.tieneHistorico;
    $('#source').textContent = d.fuente;
    $('#footSrc').textContent = `${d.filas.length} empresas · fuente: ${d.fuente}${d.hoja ? ` (hoja «${d.hoja}»)` : ''}`;
    renderDQ();
    renderCriteria();
    update(true);
    if (location.hash === '#analisis') history.replaceState(null, '', location.pathname + location.search);
    route();
  }

  /* ---------------- Filtrado ---------------- */
  function sortVal(f, k) {
    if (k === 'pct') return f.deuda;
    if (k === 'tipo') return C.TIPO_ORDEN.indexOf(f.tipo);
    return f[k] ?? -Infinity;
  }
  function sortList(list, key, dir) {
    const m = dir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      if (key === 'empresa') return m * a.empresa.localeCompare(b.empresa, 'es');
      const d = sortVal(a, key) - sortVal(b, key);
      return d ? m * d : b.deuda - a.deuda;
    });
  }
  function filtered() {
    const f = state.f, q = norm(f.q);
    let list = state.data.filas.filter(r => {
      if (q && !norm(r.empresa).includes(q)) return false;
      if (f.tipo === 'prov' && !(r.tipo === TIPOS.PROV || r.tipo === TIPOS.AMBOS)) return false;
      if (f.tipo === 'serv' && !(r.tipo === TIPOS.SERV || r.tipo === TIPOS.AMBOS)) return false;
      if (f.tipo === 'ambos' && r.tipo !== TIPOS.AMBOS) return false;
      if (f.quad && r.cuadrante !== f.quad) return false;
      if (r.importancia != null && (r.importancia < f.impMin || r.importancia > f.impMax)) return false;
      return true;
    });
    list = sortList(list, f.sort, f.dir);
    if (f.top) list = list.slice(0, f.top);
    return list;
  }

  function filterDescription() {
    const f = state.f, parts = [];
    parts.push({ all: 'Todas las empresas', prov: 'Proveedores (incluye ambos)', serv: 'Prestadores de servicios (incluye ambos)', ambos: 'Proveedor + prestador' }[f.tipo]);
    if (f.quad) parts.push('Cuadrante ' + f.quad);
    const d = state.data;
    if (f.impMin > Math.floor(d.minImp) || f.impMax < Math.ceil(d.maxImp)) parts.push(`Importancia ${f.impMin}–${f.impMax}`);
    if (f.q) parts.push(`"${f.q}"`);
    const sortName = { deuda: 'deuda', importancia: 'importancia', historico: 'histórico pagado', empresa: 'nombre' }[f.sort];
    if (f.top) parts.push(`Top ${f.top} por ${sortName}`);
    return parts.join(' · ');
  }

  /* ---------------- Gráfico principal ---------------- */
  const GRID = { left: 78, right: 34, top: 46, bottom: 58 };
  function bubbleSize(v, W) {
    const max = state.data.maxDeudaAll || 1;
    const k = Math.max(0.5, Math.min(1, (W || 1200) / 1200));
    return (8 + Math.sqrt(Math.max(v, 0) / max) * 46) * k;
  }
  /**
   * Distribuye horizontalmente las burbujas que comparten la misma importancia
   * para que no se monten (tipo "beeswarm"), sin salirse de su columna.
   */
  function dodge(list, yKey, xMin, xMax, yToPx, W, H) {
    const pw = W - GRID.left - GRID.right, ph = H - GRID.top - GRID.bottom;
    const ppx = pw / (xMax - xMin);
    const out = {}, cols = {};
    list.forEach(f => { const k = f.importancia ?? 'x'; (cols[k] = cols[k] || []).push(f); });
    Object.values(cols).forEach(col => {
      col.sort((a, b) => b.deuda - a.deuda);
      const placed = [];
      col.forEach(f => {
        const r = bubbleSize(f.deuda, W) / 2;
        const y = yToPx(yKey === 'historico' ? (f.historico ?? 0) : f.deuda) * ph;
        const lim = Math.max(0, ppx * 0.44 - r * 0.5);
        let best = 0, bestOv = Infinity;
        const cands = [0];
        for (let o = 2; o <= lim; o += 2) cands.push(o, -o);
        for (const off of cands) {
          let ov = 0;
          for (const p of placed) {
            const d = Math.hypot(off - p.x, y - p.y), need = r + p.r + 2;
            if (d < need) ov = Math.max(ov, need - d);
          }
          if (ov === 0) { best = off; bestOv = 0; break; }
          if (ov < bestOv) { bestOv = ov; best = off; }
        }
        placed.push({ x: best, y, r });
        out[f.id] = best / ppx;
      });
    });
    return out;
  }

  function buildMain(TT, opts = {}) {
    return state.view === 'ranking' ? buildRanking(TT, opts) : buildMatrix(TT, opts);
  }

  function axisCommon(TT) {
    return {
      axisLine: { lineStyle: { color: TT.axis } },
      axisTick: { show: false },
      axisLabel: { color: TT.text2, fontFamily: 'Inter', fontSize: 12 },
      splitLine: { lineStyle: { color: TT.grid } },
      nameTextStyle: { color: TT.text2, fontFamily: 'Inter', fontSize: 12, fontWeight: 600 },
    };
  }

  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    const step = n <= 1.2 ? 0.2 : n <= 2.5 ? 0.25 : n <= 6 ? 0.5 : 1;
    return Math.ceil(n / step) * step * p;
  }
  function buildMatrix(TT, opts) {
    const d = state.data, list = state.list.filter(f => f.importancia != null);
    const yKey = d.ejeY;
    const avgY = d.promY;
    const divX = d.divisoriaX + (Number.isInteger(d.divisoriaX) ? 0.5 : 0);
    const xMin = Math.floor(d.minImp) - 1, xMax = Math.ceil(d.maxImp) + 1;
    const W = opts.w || (main ? main.getWidth() : 1200), H = opts.h || (main ? main.getHeight() : 700);
    const yv = f => yKey === 'historico' ? (f.historico ?? 0) : f.deuda;
    const maxY = Math.max(avgY, ...list.map(yv), 1);
    // Escala vertical: logarítmica (por defecto) o lineal.
    const isLog = state.yScale === 'log';
    const positives = list.map(yv).filter(v => v > 0);
    const yMin = isLog ? Math.pow(10, Math.floor(Math.log10(Math.min(avgY, ...(positives.length ? positives : [1000]))))) : 0;
    const yMax = isLog ? Math.pow(10, Math.ceil(Math.log10(maxY * 1.15))) : niceMax(maxY * 1.1);
    const hasFloor = isLog && list.some(f => yv(f) < yMin);
    const yToPx = isLog
      ? v => (Math.log10(Math.max(v, yMin)) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin))
      : v => v / (yMax || 1);
    const yPlot = v => isLog ? Math.max(v, yMin) : v;
    if (!opts.exporting) state.matrixFloor = hasFloor ? yMin : 0;
    const offs = dodge(list, yKey, xMin, xMax, yToPx, W, H);
    const topIds = new Set(list.slice().sort((a, b) => b.deuda - a.deuda).slice(0, opts.exporting ? 8 : 6).map(f => f.id));
    const data = list.map(f => {
      const sel = state.sel.has(f.id);
      return {
        id: f.id, name: f.empresa, f,
        value: [f.importancia + (offs[f.id] || 0), yPlot(yv(f)), f.deuda],
        symbolSize: bubbleSize(f.deuda, W),
        itemStyle: {
          color: TT.tipo[f.tipo], opacity: state.sel.size && !sel && !opts.exporting ? 0.3 : 1,
          borderColor: TT.surface, borderWidth: sel ? 2.5 : 1.5,
        },
        label: { show: topIds.has(f.id) || sel },
      };
    });
    const qTxt = n => `${n} · ${CUADRANTES[n].short}`;
    const qLabel = (txt, pos) => ({ name: txt, label: { show: true, position: pos, color: TT.muted, fontSize: 11, fontFamily: 'Inter', fontWeight: 600, distance: 8 } });
    return {
      backgroundColor: 'transparent',
      animationDuration: 700, animationDurationUpdate: 650, animationEasingUpdate: 'cubicInOut',
      textStyle: { fontFamily: 'Inter' },
      grid: { ...GRID },
      tooltip: {
        ...C.tooltipBase(TT), trigger: 'item',
        formatter: p => p.data && p.data.f ? C.tooltipHTML(p.data.f, TT, rankRow(p.data.f)) : '',
      },
      xAxis: {
        type: 'value', min: xMin, max: xMax, interval: 1, name: 'Importancia operativa →', nameLocation: 'middle', nameGap: 40,
        ...axisCommon(TT), splitLine: { show: false },
        axisLabel: { ...axisCommon(TT).axisLabel, margin: 18, fontWeight: 600, formatter: v => (v > xMin && v < xMax) ? v : '' },
      },
      yAxis: {
        type: isLog ? 'log' : 'value', logBase: 10,
        name: (yKey === 'historico' ? 'Histórico pagado' : 'Deuda vigente') + (isLog ? ' (escala logarítmica)' : ''), nameLocation: 'end', nameGap: 14,
        min: yMin, max: yMax, ...axisCommon(TT),
        nameTextStyle: { ...axisCommon(TT).nameTextStyle, align: 'left', padding: [0, 0, 6, -70] },
        axisLabel: { ...axisCommon(TT).axisLabel, formatter: v => (hasFloor && v <= yMin * 1.0001) ? `$0 – ${moneyShort(v)}` : moneyShort(v) },
      },
      series: [
        {
          id: 'quad', type: 'scatter', data: [], silent: true,
          markArea: {
            silent: true, itemStyle: { color: TT.quadFill },
            data: [
              [{ ...qLabel(qTxt(1, 'alta', 'alta'), 'top'), coord: [divX, avgY] }, { coord: [xMax, 'max'] }],
              [{ ...qLabel(qTxt(3, 'baja', 'alta'), 'top'), coord: [xMin, avgY], itemStyle: { color: 'transparent' } }, { coord: [divX, 'max'] }],
              [{ ...qLabel(qTxt(2, 'alta', 'baja'), 'insideTopRight'), coord: [divX, yMin], itemStyle: { color: 'transparent' } }, { coord: [xMax, avgY] }],
              [{ ...qLabel(qTxt(4, 'baja', 'baja'), 'insideTopLeft'), coord: [xMin, yMin] }, { coord: [divX, avgY] }],
            ],
          },
          markLine: {
            silent: true, symbol: 'none', animation: false,
            lineStyle: { color: TT.quadLine, type: [6, 5], width: 1.2 },
            label: { color: TT.text2, fontSize: 11, fontFamily: 'Inter' },
            data: [
              { xAxis: divX, label: { show: false } },
              { yAxis: avgY, label: { formatter: 'Promedio ' + moneyShort(avgY), position: 'insideEndTop' } },
            ],
          },
        },
        {
          // anillo de selección (igual para todos los colores)
          id: 'halo', type: 'scatter', silent: true, z: 1, animation: false,
          data: data.filter(d => state.sel.has(d.id)).map(d => ({
            value: d.value, symbolSize: d.symbolSize + 12,
            itemStyle: { color: 'transparent', borderColor: TT.ring, borderWidth: 3 },
          })),
          tooltip: { show: false },
        },
        {
          id: 'main', type: 'scatter', data, z: 2,
          label: {
            position: 'top', distance: 4, color: TT.text, fontSize: 11, fontWeight: 600, fontFamily: 'Inter',
            formatter: p => C.shortName(p.name, 22), textBorderColor: TT.surface, textBorderWidth: 3,
          },
          labelLayout: { hideOverlap: true },
          emphasis: {
            focus: 'self', scale: 1.18,
            label: { show: true, fontSize: 12 },
            itemStyle: { borderColor: TT.ring, borderWidth: 2.5, opacity: 1 },
          },
          blur: { itemStyle: { opacity: 0.18 } },
        },
      ],
    };
  }

  function buildRanking(TT, opts) {
    const list = state.list;
    const key = state.f.sort === 'importancia' ? 'importancia' : state.f.sort === 'historico' ? 'historico' : 'deuda';
    const isMoney = key !== 'importancia';
    const many = !opts.exporting && list.length > 22;
    const data = list.map(f => {
      const sel = state.sel.has(f.id);
      return {
        id: f.id, name: f.empresa, f, value: f[key] ?? 0,
        itemStyle: {
          color: TT.tipo[f.tipo], opacity: state.sel.size && !sel && !opts.exporting ? 0.3 : 1,
          borderRadius: [0, 4, 4, 0], borderColor: sel ? TT.ring : 'transparent', borderWidth: sel ? 2.5 : 0,
        },
      };
    });
    const titles = { deuda: 'Deuda vigente', historico: 'Histórico pagado', importancia: 'Importancia operativa' };
    return {
      backgroundColor: 'transparent',
      animationDuration: 700, animationDurationUpdate: 650, animationEasingUpdate: 'cubicInOut',
      textStyle: { fontFamily: 'Inter' },
      grid: { left: 8, right: many ? 64 : 84, top: 26, bottom: 30, containLabel: true },
      tooltip: { ...C.tooltipBase(TT), trigger: 'item', formatter: p => p.data && p.data.f ? C.tooltipHTML(p.data.f, TT, rankRow(p.data.f)) : '' },
      xAxis: {
        type: 'value', position: 'top',
        max: key === 'importancia' ? Math.ceil(state.data.maxImp) : null,
        ...axisCommon(TT), axisLabel: { ...axisCommon(TT).axisLabel, formatter: v => isMoney ? moneyShort(v) : v },
      },
      yAxis: {
        type: 'category', inverse: true, data: list.map(f => f.empresa),
        ...axisCommon(TT), axisLine: { show: false }, splitLine: { show: false },
        axisLabel: {
          ...axisCommon(TT).axisLabel, color: TT.text, width: 240,
          formatter: (v, i) => list[i] && state.sel.has(list[i].id) ? `{sel|● ${C.shortName(v, 28)}}` : C.shortName(v, 30),
          rich: { sel: { color: TT.ring, fontWeight: 700, fontSize: 12, fontFamily: 'Inter', backgroundColor: TT.name === 'dark' ? 'rgba(255,216,77,.18)' : 'rgba(255,216,77,.45)', padding: [2, 6], borderRadius: 4 } },
        },
      },
      dataZoom: many ? [
        { type: 'slider', yAxisIndex: 0, right: 8, width: 14, startValue: 0, endValue: 21, zoomLock: false, showDetail: false, brushSelect: false,
          borderColor: 'transparent', backgroundColor: TT.surface2, fillerColor: 'rgba(255,216,77,.25)', handleSize: 0, moveHandleSize: 0, dataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } } },
        { type: 'inside', yAxisIndex: 0, zoomOnMouseWheel: false, moveOnMouseWheel: true, moveOnMouseMove: false },
      ] : [],
      series: [{
        id: 'main', type: 'bar', data, barMaxWidth: 18, barCategoryGap: '28%',
        showBackground: true, backgroundStyle: { color: TT.name === 'dark' ? 'rgba(255,255,255,.03)' : 'rgba(29,32,65,.03)', borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: TT.text2, fontSize: 11, fontFamily: 'Inter', formatter: p => isMoney ? moneyShort(p.value) : p.value },
        emphasis: { focus: 'self', itemStyle: { borderColor: TT.ring, borderWidth: 2 } },
        blur: { itemStyle: { opacity: 0.3 } },
      }],
    };
  }

  function rankRow(f) {
    const all = state.data.filas;
    const rank = all.filter(x => x.deuda > f.deuda).length + 1;
    const tot = state.summary ? state.summary.total : 0;
    return `<tr><td>Ranking deuda</td><td>#${rank} de ${all.length}</td></tr>
            <tr><td>% de la deuda filtrada</td><td>${tot ? pct(f.deuda / tot) : '—'}</td></tr>
            <tr class="tt-hint"><td colspan="2">${state.sel.has(f.id) ? 'Clic para quitar de la selección' : 'Clic para seleccionar'}</td></tr>`;
  }

  function renderMain(fresh) {
    $('#vScale').classList.toggle('disabled', state.view === 'ranking');
    state.data.maxDeudaAll = Math.max(...state.data.filas.map(f => f.deuda));
    main.setOption(buildMain(T), { notMerge: !!fresh, replaceMerge: fresh ? undefined : ['series', 'xAxis', 'yAxis', 'dataZoom'] });
    $('#chartTitle').textContent = state.view === 'ranking'
      ? 'Ranking por ' + ({ deuda: 'deuda vigente', importancia: 'importancia operativa', historico: 'histórico pagado', empresa: 'deuda vigente' }[state.f.sort])
      : 'Matriz: importancia operativa vs. ' + (state.data.ejeY === 'historico' ? 'histórico pagado' : 'deuda');
    $('#chartHint').textContent = state.view === 'ranking'
      ? (state.list.length > 22 ? 'Desplaza con la rueda del ratón o la barra lateral · clic para seleccionar' : 'Clic en una barra para seleccionarla')
      : (state.data.ejeY === 'historico'
        ? 'Eje vertical = histórico pagado · tamaño de la burbuja = deuda vigente · clic para seleccionar empresas'
          + (state.matrixFloor ? ` · las empresas sin pagos históricos están en la línea inferior` : '')
        : 'El Excel no trae «Histórico pagado»: el eje vertical muestra la deuda · tamaño = deuda vigente');
  }

  /* ---------------- Leyenda ---------------- */
  function renderLegend() {
    const counts = {};
    state.list.forEach(f => counts[f.tipo] = (counts[f.tipo] || 0) + 1);
    const map = { [TIPOS.PROV]: 'prov', [TIPOS.SERV]: 'serv', [TIPOS.AMBOS]: 'ambos' };
    $('#legend').innerHTML = C.TIPO_ORDEN.filter(t => counts[t] || t !== TIPOS.NA).map(t => `
      <button class="lg-item ${counts[t] ? '' : 'off'}" data-f="${map[t] || ''}" title="Filtrar por ${esc(C.TIPO_CORTO[t])}">
        <i style="background:${T.tipo[t]}"></i>${esc(C.TIPO_CORTO[t])} <span>${counts[t] || 0}</span>
      </button>`).join('') +
      (state.view === 'matriz' ? sizeLegend() : '');
  }

  /* ---------------- Resumen ---------------- */
  function renderSummary() {
    const s = C.summarize(state.list);
    state.summary = s;
    $('#scope').textContent = filterDescription();
    C.countUp($('#kN'), s.n, v => int(v));
    $('#kNsub').innerHTML = `${s.nSoloProv} proveedores · ${s.nSoloServ} prestadores · <b class="t-ambos">${s.nAmbos} ambos</b>${s.nNa ? ` · ${s.nNa} sin clasificar` : ''}`;
    C.countUp($('#kTotal'), s.total, money);
    const totAll = C.summarize(state.data.filas).total;
    $('#kTotalSub').textContent = s.total === totAll ? 'Deuda total con todas las empresas' : `${pct(s.total / totAll)} de la deuda total (${moneyShort(totAll)})`;
    C.countUp($('#kServ'), s.serv, money);
    $('#kServSub').textContent = `${s.nServ} empresas${s.nAmbos ? ` · incluye ${moneyShort(s.ambos)} de “ambos”` : ''}`;
    C.countUp($('#kProv'), s.prov, money);
    $('#kProvSub').textContent = `${s.nProv} empresas${s.nAmbos ? ` · incluye ${moneyShort(s.ambos)} de “ambos”` : ''}`;
    $('#kTop5').textContent = pct(s.top5Pct);
    $('#kTop5').title = `Las 5 empresas con mayor deuda suman ${money(s.top5)} de ${money(s.total)}`;
    $('#kAvg').textContent = moneyShort(s.promedio);
    $('#kMax').textContent = s.mayor ? s.mayor.empresa : '—';
    $('#kMax').title = s.mayor ? `${s.mayor.empresa} · ${money(s.mayor.deuda)}` : '';
    renderCompo(s);
    renderQuad();
    renderOverlap(s);
    C.renderFavor($('#favor'), s, state.data, T);
  }

  function renderCompo(s) {
    const tot = s.total || 1;
    const w1 = s.soloProv / tot * 100, w2 = s.ambos / tot * 100, w3 = s.soloServ / tot * 100, w4 = s.na / tot * 100;
    const el = $('#compo');
    if (!el.dataset.ready) {
      el.innerHTML = `
        <div class="br br-top" id="brProv"><span></span></div>
        <div class="bar">
          <div class="seg-p" id="sgProv"></div><div class="seg-a" id="sgAmbos"></div><div class="seg-s" id="sgServ"></div><div class="seg-n" id="sgNa"></div>
        </div>
        <div class="br br-bot" id="brServ"><span></span></div>
        <div class="compo-legend" id="compoLegend"></div>`;
      el.dataset.ready = 1;
      $('#sgProv').style.background = T.tipo[TIPOS.PROV];
      $('#sgAmbos').style.background = T.tipo[TIPOS.AMBOS];
      $('#sgServ').style.background = T.tipo[TIPOS.SERV];
      $('#sgNa').style.background = T.tipo[TIPOS.NA];
    }
    $('#sgProv').style.width = w1 + '%'; $('#sgAmbos').style.width = w2 + '%'; $('#sgServ').style.width = w3 + '%'; $('#sgNa').style.width = w4 + '%';
    const segTitle = (n, v) => `${n}: ${money(v)} (${pct(v / tot)})`;
    $('#sgProv').title = segTitle('Solo proveedor', s.soloProv); $('#sgAmbos').title = segTitle('Proveedor + prestador', s.ambos);
    $('#sgServ').title = segTitle('Solo prestador', s.soloServ); $('#sgNa').title = segTitle('Sin clasificar', s.na);
    const bp = $('#brProv'), bs = $('#brServ');
    bp.style.left = '0%'; bp.style.width = (w1 + w2) + '%'; bp.querySelector('span').textContent = `Proveedores ${moneyShort(s.prov)}`;
    bs.style.left = w1 + '%'; bs.style.width = (w2 + w3) + '%'; bs.querySelector('span').textContent = `Prestadores ${moneyShort(s.serv)}`;
    const place = (el, l, w) => { const sp = el.querySelector('span'); sp.className = w < 34 ? (l + w / 2 > 50 ? 'r' : 'l') : ''; };
    place(bp, 0, w1 + w2); place(bs, w1, w2 + w3);
    bp.style.opacity = (w1 + w2) > 0 ? 1 : 0; bs.style.opacity = (w2 + w3) > 0 ? 1 : 0;
    $('#compoLegend').innerHTML = [
      ['Solo proveedor', s.soloProv, TIPOS.PROV], ['Ambos', s.ambos, TIPOS.AMBOS], ['Solo prestador', s.soloServ, TIPOS.SERV],
      ...(s.na ? [['Sin clasificar', s.na, TIPOS.NA]] : []),
    ].map(([n, v, t]) => `<span><i style="background:${T.tipo[t]}"></i>${n} <b>${moneyShort(v)}</b></span>`).join('');
  }

  function renderQuad() {
    const d = state.data;
    $('#quadHint').innerHTML = `Importancia <b>alta</b> = mayor que ${d.divisoriaX} · ${d.ejeY === 'historico' ? 'Histórico' : 'Deuda'} <b>alto</b> = igual o mayor al promedio (${moneyShort(d.promY)}) · la barra suma la deuda vigente`;
    const vals = [1, 2, 3, 4].map(q => {
      const l = state.list.filter(f => f.cuadrante === q);
      return { q, v: l.reduce((a, f) => a + f.deuda, 0), n: l.length };
    });
    quad.setOption({
      animationDurationUpdate: 600, animationEasingUpdate: 'cubicInOut',
      grid: { left: 4, right: 70, top: 4, bottom: 4, containLabel: true },
      tooltip: { ...C.tooltipBase(T), trigger: 'item', formatter: p => `<div class="tt"><div class="tt-name">${CUADRANTES[p.data.q].label}</div><table><tr><td>Deuda</td><td><b>${money(p.data.value)}</b></td></tr><tr><td>Empresas</td><td>${p.data.n}</td></tr><tr class="tt-hint"><td colspan="2">Clic para filtrar este cuadrante</td></tr></table></div>` },
      xAxis: { type: 'value', show: false, max: v => v.max * 1.02 || 1 },
      yAxis: { type: 'category', inverse: true, data: vals.map(v => v.q), axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: T.text2, fontFamily: 'Inter', fontSize: 11.5, formatter: q => `${q} · ${CUADRANTES[q].short}` } },
      series: [{
        type: 'bar', barWidth: 12,
        data: vals.map(v => ({ value: v.v, q: v.q, n: v.n, itemStyle: { color: state.f.quad && state.f.quad !== v.q ? 'rgba(29,32,65,.12)' : ['#1D2041', '#454A7A', '#7C81A8', '#B3B7D0'][v.q - 1], borderRadius: [0, 4, 4, 0] } })),
        showBackground: true, backgroundStyle: { color: T.surface2, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: T.text2, fontFamily: 'Inter', fontSize: 11, formatter: p => `${moneyShort(p.value)} · ${p.data.n}` },
      }],
    });
  }

  function renderOverlap(s) {
    const el = $('#overlap');
    if (!s.nAmbos) { el.hidden = true; return; }
    el.hidden = false;
    const suma = s.prov + s.serv;
    el.innerHTML = `
      <div class="notice-icon"><svg viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg></div>
      <div class="notice-body">
        <h3>${s.nAmbos} ${s.nAmbos === 1 ? 'empresa figura' : 'empresas figuran'} como proveedor <u>y</u> prestador de servicios</h3>
        <p>Su deuda de <b>${money(s.ambos)}</b> está incluida tanto en <b>Total proveedores</b> (${money(s.prov)}) como en <b>Total prestadores</b> (${money(s.serv)}), porque no se especifica qué parte corresponde a cada figura.
        Sumar las dos categorías daría <b>${money(suma)}</b>; la deuda real es <b>${money(s.total)}</b>. <span class="nowrap">No sumar dos veces ${money(s.ambos)}.</span></p>
        <div class="chips">${s.ambosList.map(f => `<button class="chip ${state.sel.has(f.id) ? 'on' : ''}" data-id="${f.id}" title="Clic para seleccionar"><i style="background:${T.tipo[TIPOS.AMBOS]}"></i>${esc(f.empresa)} <b>${moneyShort(f.deuda)}</b></button>`).join('')}</div>
      </div>`;
  }

  /** Leyenda de tamaños con montos reales de deuda. */
  function sizeLegend() {
    const max = state.data.maxDeudaAll || 1, W = main ? main.getWidth() : 1200;
    const nice = v => { const p = Math.pow(10, Math.floor(Math.log10(v))); return Math.round(v / p) * p; };
    const vals = [...new Set([nice(max * 0.1), nice(max * 0.4), nice(max)])];
    return `<span class="lg-size"><span class="lg-size-t">Tamaño = deuda vigente</span>${vals.map(v => {
      const s = Math.round(bubbleSize(v, W));
      return `<span class="lg-bub"><i style="width:${s}px;height:${s}px"></i>${moneyShort(v)}</span>`;
    }).join('')}</span>`;
  }

  function renderCriteria() {
    const d = state.data, n = d.filas.length;
    const card = (icon, title, highTxt, lowTxt, note) => `
      <div class="crit">
        <div class="crit-icon">${icon}</div>
        <div class="crit-body">
          <span class="crit-title">${title}</span>
          <div class="crit-rows">
            <span class="crit-tag hi">Alto</span><b>${highTxt}</b>
            <span class="crit-tag lo">Bajo</span><b>${lowTxt}</b>
          </div>
          <span class="crit-note">${note}</span>
        </div>
      </div>`;
    const ico = {
      deuda: '<svg viewBox="0 0 24 24"><path d="M3 6h18v12H3zM3 10h18M7 15h3"/></svg>',
      hist: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 7v5l3 2"/></svg>',
      imp: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.8 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg>',
    };
    const divX = d.divisoriaX;
    $('#criteria').innerHTML =
      `<div class="crit-head"><h2>¿Desde cuándo se considera alto o bajo?</h2><span class="hint">Valores en dólares (${C.CFG.moneda || 'USD'}) · calculados sobre las ${n} empresas del archivo · no cambian con los filtros</span></div>` +
      (d.tieneHistorico ? card(ico.hist, 'Histórico pagado · eje vertical', `desde ${money(d.promHist)}`, `menos de ${money(d.promHist)}`, 'Divisoria = promedio del histórico. Es la línea punteada horizontal y define los cuadrantes 1 a 4.') : '') +
      card(ico.deuda, 'Deuda vigente · tamaño de la burbuja', `desde ${money(d.promDeuda)}`, `menos de ${money(d.promDeuda)}`, 'Divisoria = promedio de la deuda. A mayor deuda, más grande la burbuja.') +
      card(ico.imp, 'Importancia operativa · eje horizontal', `mayor que ${divX}`, `${divX} o menos`, `Escala 1 a 10 definida en mesa de trabajo entre <b>Operaciones</b>, <b>Tesorería (Dir. Finanzas)</b> y <b>Procura</b>.`);
  }

  function renderDQ() {
    const d = state.data, el = $('#dq');
    const sinTipo = d.filas.filter(f => f.tipo === TIPOS.NA).length;
    const items = [];
    if (d.duplicados.length) items.push(`<b>Posibles nombres repetidos:</b> ${d.duplicados.map(g => esc(g.join(' / '))).join(' · ')}. Verifica si se trata de la misma empresa para no duplicar su deuda.`);
    if (d.sinImportancia.length) items.push(`<b>${d.sinImportancia.length} empresas sin importancia operativa:</b> aparecen en el ranking, la tabla y los totales, pero no en la matriz.`);
    if (sinTipo) items.push(`<b>${sinTipo} empresas sin tipo</b> (Proveedor / Prestador de servicios / Ambos). Se cuentan en el total, pero no en los totales por categoría.`);
    el.hidden = !items.length;
    el.innerHTML = items.length ? `<h3>Calidad de datos</h3><ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>` : '';
  }

  /* ---------------- Tabla ---------------- */
  function renderTable() {
    const ts = state.tableSort || { key: state.f.sort, dir: state.f.dir };
    const rows = sortList(state.list.slice(), ts.key, ts.dir);
    const tot = state.summary.total || 1;
    $$('#grid th[data-s]').forEach(th => { th.classList.toggle('sorted', th.dataset.s === ts.key); th.dataset.dir = th.dataset.s === ts.key ? ts.dir : ''; });
    $('#grid tbody').innerHTML = rows.map(f => `
      <tr data-id="${f.id}" class="${state.sel.has(f.id) ? 'sel' : ''}">
        <td class="c-chk"><input type="checkbox" ${state.sel.has(f.id) ? 'checked' : ''} aria-label="Seleccionar ${esc(f.empresa)}"></td>
        <td class="c-name">${esc(f.empresa)}</td>
        <td><span class="tag" style="--c:${T.tipo[f.tipo]}">${esc(C.TIPO_CORTO[f.tipo])}</span></td>
        <td class="num">${f.importancia ?? '—'}</td>
        <td class="num"><b>${money(f.deuda)}</b>${f.aFavor ? `<span class="favor-tag" title="Saldo a favor de Colven">+${moneyShort(f.aFavor)} a favor</span>` : ''}</td>
        <td class="num"><span class="pbar"><i style="width:${Math.min(100, f.deuda / tot * 100 * 4)}%"></i></span>${pct(f.deuda / tot)}</td>
        <td class="num">${f.historico != null ? money(f.historico) : '—'}</td>
        <td><span class="q q${f.cuadrante}">${f.cuadrante}</span> ${CUADRANTES[f.cuadrante].short}</td>
      </tr>`).join('') || `<tr><td colspan="8" class="empty">No hay empresas con estos filtros.</td></tr>`;
    const visibleSel = state.list.filter(f => state.sel.has(f.id)).length;
    $('#chkAll').checked = state.list.length > 0 && visibleSel === state.list.length;
    $('#chkAll').indeterminate = visibleSel > 0 && visibleSel < state.list.length;
  }

  /* ---------------- Selección ---------------- */
  function renderSelection() {
    const n = state.sel.size;
    $('#selCount').textContent = n;
    $('#btnCompare').disabled = n === 0;
    $('#selBar').hidden = false;
    $('#selText').innerHTML = n ? `<b>${n}</b> ${n === 1 ? 'empresa seleccionada' : 'empresas seleccionadas'} · ${money(C.summarize(state.data.filas.filter(f => state.sel.has(f.id))).total)}` : 'Sin selección — haz clic en los puntos, barras o casillas para elegir empresas';
  }
  function toggleSel(id, force) {
    const on = force != null ? force : !state.sel.has(id);
    on ? state.sel.add(id) : state.sel.delete(id);
  }
  function refreshSelection() {
    // Quitar cualquier resaltado/atenuado del ratón ANTES de redibujar: si no,
    // la fila sobre la que estaba el cursor (la recién marcada) quedaba atenuada.
    main.dispatchAction({ type: 'downplay', seriesId: 'main' });
    main.dispatchAction({ type: 'hideTip' });
    hoverRow = null;
    main.setOption(buildMain(T), { replaceMerge: ['series'] });
    renderTable(); renderSelection(); renderOverlap(state.summary);
  }

  /* ---------------- Ciclo de actualización ---------------- */
  function update(fresh) {
    state.list = filtered();
    renderSummary();
    renderMain(fresh);
    renderLegend();
    renderTable();
    renderSelection();
  }

  /* ---------------- Exportación ---------------- */
  function exportMain(theme) {
    const s = state.summary;
    const kpis = [
      { label: 'Cantidad de empresas', value: int(s.n) },
      { label: 'Total deuda', value: money(s.total) },
      { label: 'Total prestadores de servicios', value: money(s.serv), color: THEMES[theme === 'light' ? 'light' : 'dark'].tipo[TIPOS.SERV] },
      { label: 'Total proveedores', value: money(s.prov), color: THEMES[theme === 'light' ? 'light' : 'dark'].tipo[TIPOS.PROV] },
    ];
    const h = state.view === 'ranking' ? Math.max(700, state.list.length * 26 + 80) : 1000;
    C.exportChartPNG((TT, o) => buildMain(TT, o), {
      theme, w: 1600, h,
      title: $('#chartTitle').textContent,
      subtitle: filterDescription() + ` · ${s.n} empresas`,
      kpis: theme === 'transparent' ? null : kpis,
      note: [s.nAmbos ? `${s.nAmbos} empresas son proveedor y prestador (${money(s.ambos)}): no se duplican en el total.` : '',
             s.aFavor ? `Saldo a favor de Colven: ${money(s.aFavor)} (no restado de la deuda).` : ''].filter(Boolean).join(' · '),
      fileName: `colven-cxp-${state.view}-${C.stamp()}${theme === 'light' ? '-blanco' : theme === 'transparent' ? '-transparente' : ''}.png`,
    }).then(() => toast('Imagen descargada'));
  }

  function exportCSV() {
    const head = ['Empresa', 'Tipo', 'Importancia', 'Deuda', 'Histórico pagado', 'Cuadrante'];
    const lines = [head.join(';')].concat(state.list.map(f => [
      `"${f.empresa.replace(/"/g, '""')}"`, f.tipo, f.importancia ?? '', f.deuda, f.historico ?? '', CUADRANTES[f.cuadrante].label,
    ].join(';')));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `colven-cxp-${C.stamp()}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------------- Vista de análisis (misma página) ---------------- */
  function openCompare() {
    if (!state.sel.size) return;
    if (location.hash !== '#analisis') location.hash = 'analisis'; // dispara route()
    else route();
  }
  function goHome() {
    if (location.hash) history.pushState(null, '', location.pathname + location.search);
    route();
  }
  /** Muestra la vista correcta según la dirección (#analisis = análisis). */
  function route() {
    if (!state.data) return;
    const wantAnalisis = location.hash === '#analisis' && state.sel.size > 0;
    if (location.hash === '#analisis' && !wantAnalisis) history.replaceState(null, '', location.pathname + location.search);
    state.route = wantAnalisis ? 'analisis' : 'panel';
    $('#viewPanel').hidden = wantAnalisis;
    $('#viewAnalisis').hidden = !wantAnalisis;
    $('#btnCompare').hidden = wantAnalisis;
    window.scrollTo({ top: 0, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
    if (wantAnalisis) {
      main.dispatchAction({ type: 'hideTip' });
      const metric = state.f.sort === 'empresa' ? 'deuda' : state.f.sort;
      window.COLVEN_ANALISIS.show(metric);
    } else {
      requestAnimationFrame(() => {
        main.resize(); quad.resize();
        main.clear(); renderMain(true); renderQuad();
        renderTable(); renderSelection(); renderOverlap(state.summary);
      });
    }
  }
  window.COLVEN_APP = {
    // la vista de análisis avisa cuando agrega o quita empresas
    selectionChanged() { renderSelection(); if (!state.sel.size) goHome(); },
  };

  /* ---------------- Eventos ---------------- */
  function bindUI() {
    let tq;
    $('#fSearch').addEventListener('input', e => { clearTimeout(tq); tq = setTimeout(() => { state.f.q = e.target.value; update(); }, 160); });
    segment('#fTipo', v => { state.f.tipo = v; update(); });
    $('#fQuad').addEventListener('change', e => { state.f.quad = +e.target.value; update(); });
    $('#fImpMin').addEventListener('change', e => { state.f.impMin = +e.target.value; if (state.f.impMin > state.f.impMax) { state.f.impMax = state.f.impMin; $('#fImpMax').value = state.f.impMax; } update(); });
    $('#fImpMax').addEventListener('change', e => { state.f.impMax = +e.target.value; if (state.f.impMax < state.f.impMin) { state.f.impMin = state.f.impMax; $('#fImpMin').value = state.f.impMin; } update(); });
    $('#fSort').addEventListener('change', e => { state.f.sort = e.target.value; state.f.dir = e.target.value === 'empresa' ? 'asc' : 'desc'; state.tableSort = null; syncDir(); update(true); });
    $('#fDir').addEventListener('click', () => { state.f.dir = state.f.dir === 'asc' ? 'desc' : 'asc'; state.tableSort = null; syncDir(); update(); });
    $('#fTop').addEventListener('change', e => { state.f.top = +e.target.value; update(); });
    $('#fReset').addEventListener('click', () => {
      const d = state.data;
      state.f = { ...DEFAULT_F, impMin: Math.floor(d.minImp), impMax: Math.ceil(d.maxImp) };
      state.tableSort = null;
      $('#fSearch').value = ''; $('#fQuad').value = 0; $('#fSort').value = 'deuda'; $('#fTop').value = 0;
      $('#fImpMin').value = state.f.impMin; $('#fImpMax').value = state.f.impMax;
      $$('#fTipo button').forEach(b => b.classList.toggle('on', b.dataset.v === 'all'));
      syncDir(); update(true);
    });
    segment('#vView', v => {
      if (state.view === v) return;
      state.view = v;
      // redibujo limpio: evita que queden burbujas o barras "congeladas" de la vista anterior
      main.dispatchAction({ type: 'downplay', seriesId: 'main' });
      main.dispatchAction({ type: 'hideTip' });
      hoverRow = null;
      main.clear();
      update(true);
    });
    segment('#vScale', v => { state.yScale = v; main.clear(); renderMain(true); });
    window.addEventListener('hashchange', route);
    window.addEventListener('popstate', route);
    $('#homeLink').addEventListener('click', e => { e.preventDefault(); goHome(); });
    $('#aBack').addEventListener('click', goHome);

    $('#legend').addEventListener('click', e => {
      const b = e.target.closest('.lg-item'); if (!b || !b.dataset.f) return;
      const v = state.f.tipo === b.dataset.f ? 'all' : b.dataset.f;
      state.f.tipo = v; $$('#fTipo button').forEach(x => x.classList.toggle('on', x.dataset.v === v)); update();
    });

    main.on('click', p => { if (p.seriesId === 'main' && p.data && p.data.id) { toggleSel(p.data.id); refreshSelection(); } });
    quad.on('click', p => {
      const q = p.data.q; state.f.quad = state.f.quad === q ? 0 : q; $('#fQuad').value = state.f.quad; update();
    });

    $('#selClear').addEventListener('click', () => { state.sel.clear(); refreshSelection(); });
    $('#selVisible').addEventListener('click', () => { state.list.forEach(f => state.sel.add(f.id)); refreshSelection(); });
    $('#btnCompare').addEventListener('click', openCompare);

    // tabla
    $('#grid tbody').addEventListener('change', e => {
      const tr = e.target.closest('tr[data-id]'); if (!tr) return;
      toggleSel(tr.dataset.id, e.target.checked); refreshSelection();
    });
    $('#grid tbody').addEventListener('mouseover', e => {
      const tr = e.target.closest('tr[data-id]'); if (!tr || tr === hoverRow) return;
      hoverRow = tr; const i = state.list.findIndex(f => f.id === tr.dataset.id);
      main.dispatchAction({ type: 'downplay', seriesId: 'main' });
      if (i >= 0) { main.dispatchAction({ type: 'highlight', seriesId: 'main', dataIndex: i }); }
    });
    $('#grid tbody').addEventListener('mouseleave', () => { hoverRow = null; main.dispatchAction({ type: 'downplay', seriesId: 'main' }); });
    $('#chkAll').addEventListener('change', e => { state.list.forEach(f => toggleSel(f.id, e.target.checked)); refreshSelection(); });
    $$('#grid th[data-s]').forEach(th => th.addEventListener('click', () => {
      const ts = state.tableSort || { key: state.f.sort, dir: state.f.dir };
      state.tableSort = { key: th.dataset.s, dir: ts.key === th.dataset.s && ts.dir === 'desc' ? 'asc' : (th.dataset.s === 'empresa' && ts.key !== 'empresa' ? 'asc' : 'desc') };
      renderTable();
    }));
    $('#btnCsv').addEventListener('click', exportCSV);

    $('#overlap').addEventListener('click', e => {
      const c = e.target.closest('.chip'); if (!c) return; toggleSel(c.dataset.id); refreshSelection();
    });

    // exportar
    $('#btnExport').addEventListener('click', e => { e.stopPropagation(); $('#exportMenu').hidden = !$('#exportMenu').hidden; });
    document.addEventListener('click', () => $('#exportMenu').hidden = true);
    $('#exportMenu').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { $('#exportMenu').hidden = true; exportMain(b.dataset.e); } });

    // archivo local
    $('#fileInput').addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const buf = await file.arrayBuffer();
        setData(C.prepare(C.parseWorkbook(buf), file.name + ' (local)'));
        toast(`Cargado ${file.name}: ${state.data.filas.length} empresas`);
      } catch (err) { toast('No se pudo leer el archivo: ' + err.message, true); }
      e.target.value = '';
    });
  }
  let hoverRow = null;

  function syncDir() { $('#fDir').classList.toggle('asc', state.f.dir === 'asc'); $('#fDir').title = state.f.dir === 'asc' ? 'Orden ascendente' : 'Orden descendente'; }
  function segment(sel, fn) {
    $(sel).addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      $$(sel + ' button').forEach(x => x.classList.toggle('on', x === b));
      fn(b.dataset.v);
    });
  }
  let tt;
  function toast(msg, err) {
    const el = $('#toast'); el.textContent = msg; el.classList.toggle('err', !!err); el.classList.add('show');
    clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), 3800);
  }

  init();
})();
