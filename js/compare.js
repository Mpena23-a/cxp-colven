/* =====================================================================
   COLVEN · Cuentas por pagar — ventana de análisis de selección
   ===================================================================== */
(function () {
  const C = window.COLVEN;
  const { TIPOS, THEMES, money, moneyShort, pct, int, esc } = C;
  const T = THEMES.light;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // Paleta para el radar (una serie por empresa, máx. 8)
  const RADAR_COLORS = ['#FFD84D', '#3D8EF0', '#E8607A', '#4CC9A0', '#B48CF2', '#F29D49', '#7FD3F7', '#E9EAF2'];
  const RADAR_COLORS_LIGHT = ['#D9A300', '#2F6FD0', '#D5455F', '#1F9E77', '#8A5CD6', '#D9771F', '#2B9CC9', '#4A4F75'];

  const st = { data: null, ids: [], metric: 'deuda', type: 'barras' };
  let chart;

  const METRIC = {
    deuda: { label: 'Deuda vigente', money: true },
    historico: { label: 'Histórico pagado', money: true },
    importancia: { label: 'Importancia operativa', money: false },
    vs: { label: 'Deuda vs. histórico pagado', money: true },
  };
  // tipos de gráfico válidos para cada parámetro
  const VALID = {
    deuda: ['barras', 'dona', 'rosa', 'treemap', 'embudo', 'radar'],
    historico: ['barras', 'dona', 'rosa', 'treemap', 'embudo', 'radar'],
    importancia: ['barras', 'rosa', 'embudo', 'radar'],
    vs: ['barras', 'radar'],
  };

  async function init() {
    $('#corte').textContent = 'Corte: ' + C.fechaCorte();
    $('#ribbon').hidden = !C.CFG.datosDeEjemplo;
    $$('.dot[data-t]').forEach(d => d.style.background = T.tipo[d.dataset.t]);
    chart = echarts.init($('#cmpChart'));
    new ResizeObserver(() => chart.resize()).observe(document.body);
    st.data = await getData();
    readHash();
    bind();
    $('#allNames').innerHTML = st.data.filas.map(f => `<option value="${esc(f.empresa)}">`).join('');
    $('#footSrc').textContent = `Fuente: ${st.data.fuente}`;
    render(true);
  }

  async function getData() {
    try {
      const op = window.opener && window.opener.COLVEN_STATE;
      if (op && op.data) return op.data;
    } catch (e) { /* otra ventana / origen */ }
    return C.loadData();
  }

  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    const valid = new Set(st.data.filas.map(f => f.id));
    st.ids = (p.get('ids') || '').split(',').filter(id => valid.has(id));
    const m = p.get('m');
    if (m && METRIC[m]) st.metric = m;
    if (m === 'historico' && !st.data.tieneHistorico) st.metric = 'deuda';
    syncSeg();
  }
  function writeHash() { history.replaceState(null, '', `#ids=${st.ids.join(',')}&m=${st.metric}`); }
  function syncSeg() {
    $$('#pMetric button').forEach(b => { b.classList.toggle('on', b.dataset.v === st.metric); b.classList.toggle('dis', !st.data.tieneHistorico && (b.dataset.v === 'historico' || b.dataset.v === 'vs')); });
    if (!VALID[st.metric].includes(st.type)) st.type = 'barras';
    $$('#pType button').forEach(b => { b.classList.toggle('on', b.dataset.v === st.type); b.classList.toggle('dis', !VALID[st.metric].includes(b.dataset.v)); });
  }

  const selected = () => st.ids.map(id => st.data.filas.find(f => f.id === id)).filter(Boolean);
  function val(f, m) { return m === 'importancia' ? (f.importancia ?? 0) : m === 'historico' ? (f.historico ?? 0) : f.deuda; }
  function fmt(v, m) { return METRIC[m].money ? moneyShort(v) : String(v); }
  function shade(hex, i) {
    // variación ligera de luminosidad dentro del mismo tipo para separar porciones vecinas
    const k = [0, 0.16, -0.12, 0.28, -0.22][i % 5];
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = k > 0 ? 255 : 0, a = Math.abs(k);
    r = Math.round(r + (t - r) * a); g = Math.round(g + (t - g) * a); b = Math.round(b + (t - b) * a);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function colorFor(list, TT) {
    const idx = {}; const out = {};
    list.forEach(f => { idx[f.tipo] = (idx[f.tipo] ?? -1) + 1; out[f.id] = shade(TT.tipo[f.tipo], idx[f.tipo]); });
    return out;
  }

  /* ---------------- Constructores de gráficos ---------------- */
  function build(TT, opts = {}) {
    const m = st.metric, list = selected().sort((a, b) => val(b, m === 'vs' ? 'deuda' : m) - val(a, m === 'vs' ? 'deuda' : m));
    const base = {
      backgroundColor: 'transparent', textStyle: { fontFamily: 'Inter' },
      animationDuration: 800, animationDurationUpdate: 700, animationEasing: 'cubicOut', animationEasingUpdate: 'cubicInOut',
      tooltip: { ...C.tooltipBase(TT), trigger: 'item', formatter: p => { const f = p.data && p.data.f; return f ? C.tooltipHTML(f, TT, shareRow(f)) : ''; } },
    };
    if (!list.length) return { ...base, title: { text: 'Sin empresas seleccionadas', left: 'center', top: 'middle', textStyle: { color: TT.muted, fontSize: 15, fontWeight: 500 } }, series: [] };
    const cols = colorFor(list, TT);
    const ax = {
      axisLine: { lineStyle: { color: TT.axis } }, axisTick: { show: false },
      axisLabel: { color: TT.text2, fontFamily: 'Inter', fontSize: 12 }, splitLine: { lineStyle: { color: TT.grid } },
      nameTextStyle: { color: TT.text2, fontFamily: 'Inter', fontWeight: 600 },
    };
    const lbl = { color: TT.text, fontFamily: 'Inter', fontSize: 12 };
    const ring = { borderColor: TT.surface, borderWidth: 2 };

    switch (st.type) {
      case 'barras': {
        if (m === 'vs') {
          return { ...base,
            tooltip: { ...base.tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(255,255,255,.04)' } },
              formatter: ps => { const f = list[ps[0].dataIndex]; return C.tooltipHTML(f, TT, f.historico ? `<tr><td>Deuda / histórico</td><td><b>${pct(f.deuda / f.historico)}</b></td></tr>` : ''); } },
            legend: { top: 0, right: 0, textStyle: { color: TT.text2, fontFamily: 'Inter' }, icon: 'roundRect', itemWidth: 12, itemHeight: 12 },
            grid: { left: 10, right: 20, top: 44, bottom: 10, containLabel: true },
            xAxis: { type: 'category', data: list.map(f => f.empresa), ...ax, splitLine: { show: false }, axisLabel: { ...ax.axisLabel, interval: 0, rotate: list.length > 6 ? 30 : 0, formatter: v => C.shortName(v, 18) } },
            yAxis: { type: 'value', ...ax, axisLabel: { ...ax.axisLabel, formatter: v => moneyShort(v) } },
            series: [
              { name: 'Histórico pagado', type: 'bar', data: list.map(f => f.historico ?? 0), itemStyle: { color: TT.name === 'dark' ? '#8C91B5' : '#B9BDD8', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 34, barGap: '12%' },
              { name: 'Deuda vigente', type: 'bar', data: list.map(f => f.deuda), itemStyle: { color: TT.tipo[TIPOS.PROV], borderRadius: [4, 4, 0, 0] }, barMaxWidth: 34,
                label: { show: list.length <= 12, position: 'top', ...lbl, fontSize: 11, color: TT.text2, formatter: p => moneyShort(p.value) } },
            ],
          };
        }
        const horiz = list.length > 8;
        const data = list.map(f => ({ value: val(f, m), name: f.empresa, f, itemStyle: { color: TT.tipo[f.tipo], borderRadius: horiz ? [0, 4, 4, 0] : [4, 4, 0, 0] } }));
        const vAxis = { type: 'value', ...ax, max: m === 'importancia' ? Math.ceil(st.data.maxImp) : null, axisLabel: { ...ax.axisLabel, formatter: v => fmt(v, m) } };
        const cAxis = { type: 'category', data: list.map(f => f.empresa), ...ax, splitLine: { show: false }, axisLabel: { ...ax.axisLabel, color: TT.text, interval: 0, formatter: v => C.shortName(v, horiz ? 32 : 16), rotate: !horiz && list.length > 5 ? 25 : 0 } };
        return { ...base,
          grid: { left: 10, right: horiz ? 70 : 20, top: 20, bottom: 10, containLabel: true },
          xAxis: horiz ? vAxis : cAxis, yAxis: horiz ? { ...cAxis, inverse: true } : vAxis,
          series: [{ type: 'bar', data, barMaxWidth: horiz ? 20 : 46, showBackground: true,
            backgroundStyle: { color: TT.name === 'dark' ? 'rgba(255,255,255,.03)' : 'rgba(29,32,65,.03)' },
            label: { show: true, position: horiz ? 'right' : 'top', ...lbl, color: TT.text2, fontSize: 11, formatter: p => fmt(p.value, m) },
            emphasis: { focus: 'self', itemStyle: { borderColor: TT.ring, borderWidth: 2 } }, blur: { itemStyle: { opacity: .3 } },
            universalTransition: { enabled: true } }],
        };
      }
      case 'dona':
      case 'rosa': {
        const tot = list.reduce((a, f) => a + val(f, m), 0);
        const data = list.map(f => ({ value: val(f, m), name: f.empresa, f, itemStyle: { color: cols[f.id], ...ring } }));
        const rose = st.type === 'rosa';
        return { ...base,
          title: rose ? undefined : {
            text: METRIC[m].money ? moneyShort(tot) : int(tot), subtext: METRIC[m].label, left: 'center', top: 'center', itemGap: 6,
            textStyle: { color: TT.text, fontFamily: 'Poppins', fontSize: opts.exporting ? 40 : 30, fontWeight: 700 },
            subtextStyle: { color: TT.text2, fontFamily: 'Inter', fontSize: 13 },
          },
          series: [{
            type: 'pie', radius: rose ? ['14%', '74%'] : ['46%', '72%'], center: ['50%', '52%'], roseType: rose ? 'area' : false,
            data, padAngle: rose ? 0 : 1, minAngle: 2,
            itemStyle: { borderRadius: rose ? 4 : 6 },
            label: { ...lbl, formatter: p => `{n|${C.shortName(p.name, 24)}}\n{v|${fmt(p.value, m)} · ${p.percent.toFixed(1)}%}`,
              rich: { n: { color: TT.text, fontSize: 12, fontWeight: 600, lineHeight: 18 }, v: { color: TT.text2, fontSize: 11 } } },
            labelLine: { lineStyle: { color: TT.axis }, length: 14, length2: 10, smooth: true },
            labelLayout: { hideOverlap: true },
            emphasis: { scale: true, scaleSize: 8, label: { show: true } },
            animationType: 'expansion', universalTransition: { enabled: true },
          }],
        };
      }
      case 'treemap': {
        const groups = C.TIPO_ORDEN.map(t => ({
          name: C.TIPO_CORTO[t], itemStyle: { color: TT.tipo[t], borderColor: TT.surface },
          children: list.filter(f => f.tipo === t).map(f => ({ name: f.empresa, value: val(f, m), f, itemStyle: { color: cols[f.id] } })),
        })).filter(g => g.children.length);
        return { ...base,
          tooltip: { ...base.tooltip, formatter: p => p.data.f ? C.tooltipHTML(p.data.f, TT, shareRow(p.data.f)) : `<div class="tt"><div class="tt-name">${esc(p.name)}</div><table><tr><td>Total</td><td><b>${fmt(p.value, m)}</b></td></tr></table></div>` },
          series: [{
            type: 'treemap', data: groups, roam: false, nodeClick: false, breadcrumb: { show: false },
            top: 6, left: 6, right: 6, bottom: 6, squareRatio: 0.9,
            levels: [
              { itemStyle: { borderWidth: 0, gapWidth: 6, borderColor: TT.surface }, upperLabel: { show: false } },
              { itemStyle: { borderColor: TT.surface, borderWidth: 2, gapWidth: 2, borderRadius: 6 } },
            ],
            label: { show: true, formatter: p => `{n|${C.shortName(p.name, 28)}}\n{v|${fmt(p.value, m)}}`, overflow: 'truncate',
              rich: { n: { color: '#1D2041', fontSize: 12, fontWeight: 700, lineHeight: 17, fontFamily: 'Inter' }, v: { color: '#1D2041', fontSize: 11, fontFamily: 'Inter' } } },
            animationDurationUpdate: 700,
          }],
        };
      }
      case 'embudo': {
        const data = list.map(f => ({ value: val(f, m), name: f.empresa, f, itemStyle: { color: cols[f.id], ...ring } }));
        return { ...base,
          series: [{ type: 'funnel', data, sort: 'descending', left: '18%', right: '18%', top: 16, bottom: 16, gap: 2, minSize: '8%',
            label: { show: true, position: list.length > 10 ? 'right' : 'inside', ...lbl, color: list.length > 10 ? TT.text : '#1D2041', fontWeight: 600, fontSize: 11.5,
              formatter: p => `${C.shortName(p.name, 26)}  ${fmt(p.value, m)}` },
            labelLine: { lineStyle: { color: TT.axis } },
            emphasis: { label: { fontSize: 13 } }, itemStyle: { borderRadius: 4 } }],
        };
      }
      case 'radar': {
        const r = list.slice(0, 8);
        const mx = k => Math.max(...st.data.filas.map(f => k(f) || 0)) || 1;
        const ind = [
          { name: 'Deuda vigente', max: mx(f => f.deuda), k: f => f.deuda, money: true },
          ...(st.data.tieneHistorico ? [{ name: 'Histórico pagado', max: mx(f => f.historico), k: f => f.historico || 0, money: true }] : []),
          { name: 'Importancia', max: Math.ceil(st.data.maxImp), k: f => f.importancia || 0 },
          ...(st.data.tieneHistorico ? [{ name: 'Deuda / histórico', max: Math.min(1, mx(f => f.historico ? f.deuda / f.historico : 0)), k: f => f.historico ? f.deuda / f.historico : 0, pct: true }] : []),
        ];
        const palette = TT.name === 'dark' ? RADAR_COLORS : RADAR_COLORS_LIGHT;
        return { ...base,
          tooltip: { ...base.tooltip, formatter: p => { const f = r[p.dataIndex] || r.find(x => x.empresa === p.name); return f ? C.tooltipHTML(f, TT, '') : ''; } },
          legend: { bottom: 0, type: 'scroll', textStyle: { color: TT.text2, fontFamily: 'Inter' }, icon: 'circle', itemWidth: 10, pageTextStyle: { color: TT.text2 },
            formatter: n => C.shortName(n, 28) },
          radar: {
            indicator: ind.map(i => ({ name: i.name, max: i.max })), center: ['50%', '50%'], radius: '64%', splitNumber: 4, shape: 'polygon',
            axisName: { color: TT.text2, fontFamily: 'Inter', fontWeight: 600, fontSize: 12 },
            splitLine: { lineStyle: { color: TT.grid } }, splitArea: { areaStyle: { color: ['transparent'] } }, axisLine: { lineStyle: { color: TT.grid } },
          },
          series: [{
            type: 'radar', symbol: 'circle', symbolSize: 6,
            data: r.map((f, i) => ({ name: f.empresa, value: ind.map(x => x.k(f)), lineStyle: { color: palette[i], width: 2 }, itemStyle: { color: palette[i] }, areaStyle: { color: palette[i], opacity: 0.12 } })),
            emphasis: { focus: 'self', lineStyle: { width: 3 }, areaStyle: { opacity: 0.3 } },
          }],
        };
      }
    }
  }

  function shareRow(f) {
    const m = st.metric === 'vs' ? 'deuda' : st.metric;
    if (m === 'importancia') return '';
    const tot = selected().reduce((a, x) => a + val(x, m), 0);
    return `<tr><td>% de la selección (${METRIC[m].label.toLowerCase()})</td><td><b>${tot ? pct(val(f, m) / tot) : '—'}</b></td></tr>`;
  }

  /* ---------------- Render ---------------- */
  function titleText() {
    const names = { barras: '', dona: ' · participación', rosa: ' · participación', treemap: ' · por tipo', embudo: ' · escalonado', radar: ' · perfil comparado' };
    return (st.type === 'radar' ? 'Perfil de cada empresa' : (st.metric === 'vs' ? 'Deuda vigente vs. histórico pagado' : METRIC[st.metric].label + ' por empresa')) + (names[st.type] || '');
  }
  function render(fresh) {
    syncSeg();
    chart.setOption(build(T), { notMerge: true });
    $('#cTitle').textContent = titleText();
    const n = st.ids.length;
    $('#cHint').textContent = st.type === 'radar'
      ? `Escala relativa al máximo de todas las empresas${n > 8 ? ' · se muestran las 8 primeras' : ''} · clic en la leyenda para ocultar`
      : st.type === 'treemap' ? 'Área proporcional al parámetro, agrupado por tipo' : 'Pasa el cursor sobre cada elemento para ver el detalle';
    renderSummary();
    renderList();
  }

  function renderSummary() {
    const list = selected(), s = C.summarize(list);
    C.countUp($('#kN'), s.n, v => int(v));
    $('#kNsub').innerHTML = `${s.nSoloProv} proveedores · ${s.nSoloServ} prestadores · <b class="t-ambos">${s.nAmbos} ambos</b>`;
    C.countUp($('#kTotal'), s.total, money);
    const totAll = C.summarize(st.data.filas).total;
    $('#kTotalSub').textContent = `${pct(totAll ? s.total / totAll : 0)} de la deuda total`;
    C.countUp($('#kServ'), s.serv, money);
    $('#kServSub').textContent = `${s.nServ} empresas`;
    C.countUp($('#kProv'), s.prov, money);
    $('#kProvSub').textContent = `${s.nProv} empresas`;
    const el = $('#overlap');
    el.hidden = !s.nAmbos;
    if (s.nAmbos) {
      el.innerHTML = `
        <div class="notice-icon"><svg viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg></div>
        <div class="notice-body">
          <h3>${s.nAmbos} ${s.nAmbos === 1 ? 'empresa de la selección figura' : 'empresas de la selección figuran'} como proveedor <u>y</u> prestador de servicios</h3>
          <p>Su deuda de <b>${money(s.ambos)}</b> está incluida en ambos totales por categoría. Proveedores + prestadores = <b>${money(s.prov + s.serv)}</b>, pero la deuda real de la selección es <b>${money(s.total)}</b>.</p>
          <div class="chips">${s.ambosList.map(f => `<span class="chip"><i style="background:${T.tipo[TIPOS.AMBOS]}"></i>${esc(f.empresa)} <b>${moneyShort(f.deuda)}</b></span>`).join('')}</div>
        </div>`;
    }
    $('#selHint').textContent = `${s.n} seleccionadas`;
  }

  function renderList() {
    const m = st.metric === 'vs' ? 'deuda' : st.metric;
    const list = selected().sort((a, b) => val(b, m) - val(a, m));
    $('#selList').innerHTML = list.length ? list.map(f => `
      <div class="sel-item" data-id="${f.id}">
        <i style="background:${T.tipo[f.tipo]}" title="${esc(C.TIPO_CORTO[f.tipo])}"></i>
        <span class="nm" title="${esc(f.empresa)}">${esc(f.empresa)}</span>
        <span class="vl">${fmt(val(f, m), m)}</span>
        <button aria-label="Quitar ${esc(f.empresa)}" title="Quitar"><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      </div>`).join('') : `<div class="empty-state">Agrega empresas con el buscador o vuelve al panel principal para seleccionarlas.</div>`;
  }

  /* ---------------- Eventos ---------------- */
  function bind() {
    $('#pMetric').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; st.metric = b.dataset.v; writeHash(); render(); });
    $('#pType').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; st.type = b.dataset.v; render(); });
    $('#selList').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const id = b.closest('.sel-item').dataset.id; st.ids = st.ids.filter(x => x !== id); writeHash(); render();
    });
    $('#addInput').addEventListener('change', e => {
      const f = st.data.filas.find(x => x.empresa === e.target.value);
      if (f && !st.ids.includes(f.id)) { st.ids.push(f.id); writeHash(); render(); }
      e.target.value = '';
    });
    window.addEventListener('hashchange', async () => { st.data = await getData(); readHash(); render(); });
    $('#backLink').addEventListener('click', e => {
      try { if (window.opener && !window.opener.closed) { e.preventDefault(); window.opener.focus(); } } catch (_) { }
    });
    $('#btnExport').addEventListener('click', e => { e.stopPropagation(); $('#exportMenu').hidden = !$('#exportMenu').hidden; });
    document.addEventListener('click', () => $('#exportMenu').hidden = true);
    $('#exportMenu').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { $('#exportMenu').hidden = true; exportImg(b.dataset.e); } });
  }

  function exportImg(theme) {
    const list = selected(), s = C.summarize(list);
    const TT = THEMES[theme === 'light' ? 'light' : 'dark'];
    const h = st.type === 'barras' && list.length > 8 && st.metric !== 'vs' ? Math.max(700, list.length * 34 + 60) : 900;
    C.exportChartPNG((tt, o) => build(tt, o), {
      theme, w: 1600, h,
      title: titleText(),
      subtitle: `${s.n} empresas seleccionadas`,
      kpis: theme === 'transparent' ? null : [
        { label: 'Empresas', value: int(s.n) },
        { label: 'Total deuda', value: money(s.total) },
        { label: 'Total prestadores de servicios', value: money(s.serv), color: TT.tipo[TIPOS.SERV] },
        { label: 'Total proveedores', value: money(s.prov), color: TT.tipo[TIPOS.PROV] },
      ],
      note: s.nAmbos ? `${s.nAmbos} empresas son proveedor y prestador (${money(s.ambos)}): no se duplican en el total.` : '',
      fileName: `colven-analisis-${st.type}-${st.metric}-${C.stamp()}${theme === 'light' ? '-blanco' : theme === 'transparent' ? '-transparente' : ''}.png`,
    }).then(() => toast('Imagen descargada'));
  }

  let tt;
  function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), 3000); }

  init();
})();
