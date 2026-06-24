/**
 * managed-nas-detail-card  v1.0.0
 * Companion detail card for managed-nas-card.
 *
 * Reads the input_select and shows:
 *  • Bay N selected  → Spazio Volume (donut) · Temperatura Disco (graph) · Stato Volume
 *  • "Status"        → RAM · SWAP · CPU utilizzo · CPU carico · Cache · Rete
 *  • "Alert"         → griglia binary sensor settori/vita per ogni disco
 *  • "Nessuna"       → hidden (no space taken)
 *
 * License: MIT
 */

// ─────────────────────────────────────────────────────────────────────────────
//  DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────
const NAS_DETAIL_DEFAULTS = {
  // input_select to watch
  input_select:      '',           // REQUIRED
  input_select_none: 'Nessuna',
  bay_option_prefix: 'Baia ',      // "Baia 1", "Baia 2", ...

  // Entity base
  sensor_base: '',                 // REQUIRED  e.g. sensor.mynas
  binary_base: '',                 // REQUIRED  e.g. binary_sensor.mynas

  // Number of bays (for Alert grid)
  bays: 8,

  // ── Bay panel suffixes ({N} = bay number) ─────────────────────────────────
  // Volume space
  suffix_vol_used:  '_volume_{N}_spazio_usato',
  suffix_vol_free:  '_volume_{N}_spazio_libero',
  suffix_vol_state: '_volume_{N}_stato',        // e.g. "normal", "attention"
  // Disk temperature
  suffix_temp:      '_drive_{N}_temperatura',
  // Bay-level alerts (binary)
  suffix_bad_sectors: '_drive_{N}_superato_il_numero_massimo_di_settori_danneggiati',
  suffix_low_life:    '_drive_{N}_al_di_sotto_della_vita_residua_minima',

  // ── Status panel suffixes ─────────────────────────────────────────────────
  suffix_ram_pct:      '_utilizzo_memoria',
  suffix_ram_used:     '_memoria_in_uso',
  suffix_ram_free:     '_memoria_disponibile',
  suffix_swap_used:    '_swap_in_uso',
  suffix_swap_free:    '_swap_disponibile',
  suffix_cpu_total:    '_utilizzo_cpu',
  suffix_cpu_sys:      '_utilizzo_cpu_sistema',
  suffix_cpu_user:     '_utilizzo_cpu_utente',
  suffix_cpu_other:    '_utilizzo_cpu_altro',
  suffix_load_1:       '_carico_cpu_1_minuto',
  suffix_load_5:       '_carico_cpu_5_minuti',
  suffix_load_15:      '_carico_cpu_15_minuti',
  suffix_cache:        '_utilizzo_cache',
  suffix_net_up:       '_velocita_di_rete_upload',
  suffix_net_down:     '_velocita_di_rete_download',

  // ── Alert panel ───────────────────────────────────────────────────────────
  // Label shown when binary is off (safe)
  label_safe:      'Sicuro',
  // Label shown when binary is on (alert)
  label_alert_bad: 'Attenzione',
  // Label prefix per sensor title
  label_bad_sectors_prefix: 'Settori Danneggiati Disc.',
  label_low_life_prefix:    'Vita Residua Disco',
  label_no_alarm:           'Nessun Allarme rilevato, tutto nella norma!',

  // ── History ───────────────────────────────────────────────────────────────
  history_hours:    1,
  graph_update_ms:  5000,

  // ── Colors ───────────────────────────────────────────────────────────────
  color_bg:         '#1c1c1c',
  color_card_bg:    '#111',
  color_border:     '#2a2a2a',
  color_text:       '#ffffff',
  color_accent:     '#007bff',
  color_subtext:    '#888',
  color_ok:         '#00ff41',
  color_warn:       '#ff9800',
  color_error:      '#f44336',
  color_donut_used: '#4a90e2',     // blue like screenshot
  color_donut_free: '#444',
  color_temp_line:  '#ff9800',     // orange like screenshot
  color_ram:        '#ff9800',
  color_swap:       '#4a90e2',
  color_cpu_total:  '#ff9800',
  color_cpu_sys:    '#4a90e2',
  color_cpu_user:   '#f44336',
  color_cpu_other:  '#aa44ff',
  color_load_1:     '#ff9800',
  color_load_5:     '#4a90e2',
  color_load_15:    '#f44336',
  color_cache:      '#ff9800',
  color_net_up:     '#ff9800',
  color_net_down:   '#4a90e2',
};

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function _fmtNum(val) {
  if (val === null || val === undefined || val === 'unavailable' || val === 'unknown') return '--';
  const n = parseFloat(val);
  return isNaN(n) ? val : n.toLocaleString('it-IT', { maximumFractionDigits: 2 });
}

function _unit(entityId, hass) {
  return hass?.states?.[entityId]?.attributes?.unit_of_measurement || '';
}

// ─────────────────────────────────────────────────────────────────────────────
//  DETAIL CARD
// ─────────────────────────────────────────────────────────────────────────────
class ManagedNasDetailCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._historyCache = {};   // { entityId: [{t, v}] }
    this._histTimer    = null;
    this._activeView   = null; // 'bay-N' | 'Status' | 'Alert' | null
  }

  static getConfigElement() {
    return document.createElement('managed-nas-detail-card-editor');
  }
  static getStubConfig() {
    return {
      input_select: 'input_select.nas_selected_bay',
      sensor_base:  'sensor.mynas',
      binary_base:  'binary_sensor.mynas',
      bays: 8,
    };
  }

  setConfig(config) {
    if (!config.input_select)  throw new Error('managed-nas-detail-card: "input_select" è obbligatorio.');
    if (!config.sensor_base)   throw new Error('managed-nas-detail-card: "sensor_base" è obbligatorio.');
    if (!config.binary_base)   throw new Error('managed-nas-detail-card: "binary_base" è obbligatorio.');
    this._config = { ...NAS_DETAIL_DEFAULTS, ...config };
    this._config.bays = parseInt(this._config.bays, 10) || 8;
  }

  set hass(hass) {
    this._hass = hass;
    this._resolveView();
    this.render();
  }

  disconnectedCallback() {
    this._clearTimer();
  }

  // ── Resolve active view from input_select ─────────────────────────────────
  _resolveView() {
    const cfg = this._config;
    const val = this._hass?.states?.[cfg.input_select]?.state || cfg.input_select_none;
    let view  = null;

    if (val && val !== cfg.input_select_none) {
      if (val.startsWith(cfg.bay_option_prefix)) {
        const n = parseInt(val.replace(cfg.bay_option_prefix, '').trim(), 10);
        if (!isNaN(n)) view = 'bay-' + n;
      } else if (val === 'Status') {
        view = 'Status';
      } else if (val === 'Alert') {
        view = 'Alert';
      }
    }

    if (view !== this._activeView) {
      this._activeView = view;
      this._historyCache = {};
      this._clearTimer();
      if (view) this._startTimer();
    }
  }

  _clearTimer() {
    if (this._histTimer) { clearInterval(this._histTimer); this._histTimer = null; }
  }

  _startTimer() {
    this._fetchHistory();
    this._histTimer = setInterval(() => this._fetchHistory(), this._config.graph_update_ms);
  }

  // ── History fetch — only entities needed for current view ─────────────────
  async _fetchHistory() {
    if (!this._activeView || !this._hass) return;
    const cfg   = this._config;
    const base  = cfg.sensor_base;
    const start = new Date(Date.now() - cfg.history_hours * 3600 * 1000).toISOString();
    let entities = [];

    if (this._activeView.startsWith('bay-')) {
      const n = parseInt(this._activeView.replace('bay-', ''), 10);
      entities = [
        base + cfg.suffix_temp.replace('{N}', n),
      ];
    } else if (this._activeView === 'Status') {
      entities = [
        base + cfg.suffix_ram_pct,
        base + cfg.suffix_ram_free,
        base + cfg.suffix_swap_used,
        base + cfg.suffix_cpu_total,
        base + cfg.suffix_cpu_sys,
        base + cfg.suffix_cpu_user,
        base + cfg.suffix_cpu_other,
        base + cfg.suffix_load_1,
        base + cfg.suffix_load_5,
        base + cfg.suffix_load_15,
        base + cfg.suffix_cache,
        base + cfg.suffix_net_up,
        base + cfg.suffix_net_down,
      ];
    }

    if (!entities.length) return;

    try {
      const results = await this._hass.callWS({
        type: 'history/history_during_period',
        start_time: start,
        entity_ids: entities,
        no_attributes: true,
        minimal_response: true,
      });

      for (const [id, pts] of Object.entries(results)) {
        this._historyCache[id] = (pts || []).map(p => ({
          t: p.lu * 1000,
          v: parseFloat(p.s) || 0,
        })).slice(-80);
      }
      this._redrawCharts();
    } catch {}
  }

  // ── Canvas chart draw ─────────────────────────────────────────────────────
  _drawChart(canvas, series, colors) {
    // series: [{pts:[{t,v}], color}]  OR  we accept colors array matching series
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);

    const pL = 4, pR = 4, pT = 6, pB = 4;
    const cW = W - pL - pR, cH = H - pT - pB;

    // Compute global min/max across all series
    const allVals = series.flatMap(s => s.pts.map(p => p.v));
    if (!allVals.length) {
      ctx.fillStyle = '#444'; ctx.font = '10px Arial'; ctx.textAlign = 'center';
      ctx.fillText('In attesa di dati...', W / 2, H / 2); return;
    }
    const minV = Math.min(...allVals);
    const maxV = Math.max(...allVals, minV + 0.01);

    // Global time range
    const allTs = series.flatMap(s => s.pts.map(p => p.t));
    const minT  = Math.min(...allTs);
    const maxT  = Math.max(...allTs, minT + 1);

    const xOf = t => pL + ((t - minT) / (maxT - minT)) * cW;
    const yOf = v => pT + cH - ((v - minV) / (maxV - minV)) * cH;

    series.forEach((s, idx) => {
      if (!s.pts.length) return;
      const color = s.color || colors?.[idx] || '#888';

      // Fill only for first series (main metric)
      if (idx === 0) {
        ctx.beginPath();
        ctx.moveTo(xOf(s.pts[0].t), yOf(s.pts[0].v));
        for (let i = 1; i < s.pts.length; i++) ctx.lineTo(xOf(s.pts[i].t), yOf(s.pts[i].v));
        ctx.lineTo(xOf(s.pts[s.pts.length - 1].t), pT + cH);
        ctx.lineTo(xOf(s.pts[0].t), pT + cH);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, pT, 0, pT + cH);
        grad.addColorStop(0, color + '55');
        grad.addColorStop(1, color + '08');
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Line
      ctx.beginPath();
      ctx.moveTo(xOf(s.pts[0].t), yOf(s.pts[0].v));
      for (let i = 1; i < s.pts.length; i++) ctx.lineTo(xOf(s.pts[i].t), yOf(s.pts[i].v));
      ctx.strokeStyle = color;
      ctx.lineWidth   = idx === 0 ? 2 : 1.5;
      ctx.lineJoin    = 'round';
      ctx.stroke();
    });

    // Min/max labels
    ctx.fillStyle   = '#666'; ctx.font = '9px Arial'; ctx.textAlign = 'left';
    ctx.fillText(_fmtNum(maxV), pL + 2, pT + 10);
    ctx.fillText(_fmtNum(minV), pL + 2, pT + cH - 2);
  }

  _drawDonut(canvas, used, free, colorUsed, colorFree) {
    if (!canvas) return;
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);

    const total = parseFloat(used) + parseFloat(free);
    if (!total || isNaN(total)) return;

    const cx = W / 2, cy = H / 2;
    const r  = Math.min(W, H) * 0.42;
    const ri = r * 0.65;
    const usedPct = parseFloat(used) / total;
    const freePct = 1 - usedPct;

    const start = -Math.PI / 2;
    const usedEnd = start + usedPct * 2 * Math.PI;

    // Used arc
    ctx.beginPath();
    ctx.moveTo(cx + r * Math.cos(start), cy + r * Math.sin(start));
    ctx.arc(cx, cy, r, start, usedEnd);
    ctx.arc(cx, cy, ri, usedEnd, start, true);
    ctx.closePath();
    ctx.fillStyle = colorUsed;
    ctx.fill();

    // Free arc
    ctx.beginPath();
    ctx.moveTo(cx + r * Math.cos(usedEnd), cy + r * Math.sin(usedEnd));
    ctx.arc(cx, cy, r, usedEnd, start + 2 * Math.PI);
    ctx.arc(cx, cy, ri, start + 2 * Math.PI, usedEnd, true);
    ctx.closePath();
    ctx.fillStyle = colorFree;
    ctx.fill();

    // Percentages
    const usedDeg = (start + (usedPct * Math.PI)) ;
    const freeDeg = (usedEnd + (freePct * Math.PI));
    const labelR  = (r + ri) / 2;

    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(9, r * 0.18)}px Arial`; ctx.textAlign = 'center';
    const uAngle = start + usedPct * Math.PI;
    ctx.fillText((usedPct * 100).toFixed(2) + ' %', cx + labelR * Math.cos(uAngle), cy + labelR * Math.sin(uAngle) + 4);
    const fAngle = usedEnd + freePct * Math.PI;
    ctx.fillText((freePct * 100).toFixed(2) + ' %', cx + labelR * Math.cos(fAngle), cy + labelR * Math.sin(fAngle) + 4);
  }

  _redrawCharts() {
    // Called after history arrives — redraw without full re-render
    const cfg = this._config;
    if (!this._activeView) return;

    if (this._activeView.startsWith('bay-')) {
      const n      = parseInt(this._activeView.replace('bay-', ''), 10);
      const tempId = cfg.sensor_base + cfg.suffix_temp.replace('{N}', n);
      const tempPts = this._historyCache[tempId] || [];
      const canvas  = this.shadowRoot.querySelector('#chart-temp');
      this._drawChart(canvas, [{ pts: tempPts, color: cfg.color_temp_line }]);
    } else if (this._activeView === 'Status') {
      const b = cfg.sensor_base;
      const series = [
        [{ pts: this._historyCache[b + cfg.suffix_ram_pct] || [], color: cfg.color_ram },
         { pts: this._historyCache[b + cfg.suffix_ram_free] || [], color: cfg.color_swap }],
        [{ pts: this._historyCache[b + cfg.suffix_swap_used] || [], color: cfg.color_swap }],
        [{ pts: this._historyCache[b + cfg.suffix_cpu_total] || [], color: cfg.color_cpu_total },
         { pts: this._historyCache[b + cfg.suffix_cpu_sys]   || [], color: cfg.color_cpu_sys   },
         { pts: this._historyCache[b + cfg.suffix_cpu_user]  || [], color: cfg.color_cpu_user  },
         { pts: this._historyCache[b + cfg.suffix_cpu_other] || [], color: cfg.color_cpu_other }],
        [{ pts: this._historyCache[b + cfg.suffix_load_1]  || [], color: cfg.color_load_1 },
         { pts: this._historyCache[b + cfg.suffix_load_5]  || [], color: cfg.color_load_5 },
         { pts: this._historyCache[b + cfg.suffix_load_15] || [], color: cfg.color_load_15}],
        [{ pts: this._historyCache[b + cfg.suffix_cache]    || [], color: cfg.color_cache }],
        [{ pts: this._historyCache[b + cfg.suffix_net_up]   || [], color: cfg.color_net_up   },
         { pts: this._historyCache[b + cfg.suffix_net_down] || [], color: cfg.color_net_down }],
      ];
      const ids = ['chart-ram','chart-swap','chart-cpu','chart-load','chart-cache','chart-net'];
      ids.forEach((id, i) => this._drawChart(this.shadowRoot.querySelector('#' + id), series[i]));
    }
  }

  // ── Main render ───────────────────────────────────────────────────────────
  render() {
    const cfg = this._config;
    if (!this._activeView) { this.shadowRoot.innerHTML = ''; return; }

    if (this._activeView.startsWith('bay-')) {
      this._renderBay(parseInt(this._activeView.replace('bay-', ''), 10));
    } else if (this._activeView === 'Status') {
      this._renderStatus();
    } else if (this._activeView === 'Alert') {
      this._renderAlert();
    }

    // Draw charts after DOM is ready
    requestAnimationFrame(() => this._redrawCharts());
  }

  // ── CSS base ──────────────────────────────────────────────────────────────
  _baseCSS() {
    const cfg = this._config;
    return `
      :host { display:block; }
      .nd-wrap { font-family:Arial,sans-serif; color:${cfg.color_text}; }
      .nd-title { font-size:12px; color:${cfg.color_subtext}; font-weight:bold;
                  text-transform:uppercase; letter-spacing:0.5px;
                  margin-bottom:10px; display:flex; align-items:center; gap:8px; }
      .nd-grid-3 { display:grid; grid-template-columns:1.5fr 1fr 1fr; gap:10px; }
      .nd-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      .nd-panel { background:${cfg.color_card_bg}; border:1px solid ${cfg.color_border};
                  border-radius:10px; padding:14px 16px; }
      .nd-panel-title { font-size:13px; font-weight:bold; color:${cfg.color_text}; margin-bottom:8px;
                        display:flex; justify-content:space-between; align-items:center; }
      .nd-panel-title ha-icon { --mdc-icon-size:18px; color:${cfg.color_subtext}; }
      .nd-big { font-size:28px; font-weight:300; line-height:1; }
      .nd-unit { font-size:13px; color:${cfg.color_subtext}; margin-left:2px; }
      .nd-sub  { font-size:11px; color:${cfg.color_subtext}; margin-top:2px; }
      .nd-big2 { font-size:20px; font-weight:300; }
      .nd-legend { display:flex; flex-wrap:wrap; gap:10px; font-size:11px;
                   color:${cfg.color_subtext}; margin:6px 0 8px; }
      .nd-leg-dot { width:8px; height:8px; border-radius:50%;
                    display:inline-block; margin-right:4px; flex-shrink:0; }
      canvas { width:100%; display:block; border-radius:4px; }
    `;
  }

  // ── BAY panel ─────────────────────────────────────────────────────────────
  _renderBay(n) {
    const cfg  = this._config;
    const base = cfg.sensor_base;
    const st   = this._hass.states;

    const usedId  = base + cfg.suffix_vol_used.replace('{N}', n);
    const freeId  = base + cfg.suffix_vol_free.replace('{N}', n);
    const stateId = base + cfg.suffix_vol_state.replace('{N}', n);
    const tempId  = base + cfg.suffix_temp.replace('{N}', n);

    const used      = st[usedId]?.state    || '--';
    const free      = st[freeId]?.state    || '--';
    const volState  = st[stateId]?.state   || '--';
    const temp      = st[tempId]?.state    || '--';
    const usedUnit  = _unit(usedId,  this._hass) || 'GB';
    const freeUnit  = _unit(freeId,  this._hass) || 'GB';
    const tempUnit  = _unit(tempId,  this._hass) || '°C';

    // Volume state color
    const vsColor = volState === 'normal' || volState === 'Normale'
      ? cfg.color_ok
      : volState === '--' ? cfg.color_subtext : cfg.color_warn;

    this.shadowRoot.innerHTML = `
      <style>${this._baseCSS()}</style>
      <div class="nd-wrap">
        <div class="nd-title">
          <ha-icon icon="mdi:harddisk" style="--mdc-icon-size:16px;color:${cfg.color_accent}"></ha-icon>
          Stato Baia ${n}
        </div>
        <div class="nd-grid-3">

          <!-- Spazio Volume -->
          <div class="nd-panel">
            <div class="nd-panel-title">
              Spazio Volume ${n}
            </div>
            <div style="display:flex;gap:16px;align-items:flex-start">
              <canvas id="chart-donut" style="width:140px;height:140px;flex-shrink:0"></canvas>
              <div style="padding-top:4px">
                <div style="margin-bottom:10px">
                  <div class="nd-big">${_fmtNum(used)}<span class="nd-unit">${usedUnit}</span></div>
                  <div class="nd-sub" style="color:${cfg.color_accent}">Usato</div>
                </div>
                <div>
                  <div class="nd-big" style="color:${cfg.color_warn}">${_fmtNum(free)}<span class="nd-unit">${freeUnit}</span></div>
                  <div class="nd-sub" style="color:${cfg.color_warn}">Libero</div>
                </div>
                <div class="nd-legend" style="margin-top:14px;flex-direction:column;gap:6px">
                  <div><span class="nd-leg-dot" style="background:${cfg.color_donut_used}"></span>Usato</div>
                  <div><span class="nd-leg-dot" style="background:${cfg.color_donut_free};border:1px solid #666"></span>Libero</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Temperatura Disco -->
          <div class="nd-panel">
            <div class="nd-panel-title">
              Temperatura Disco ${n}
              <ha-icon icon="mdi:thermometer"></ha-icon>
            </div>
            <div class="nd-big">${_fmtNum(temp)}<span class="nd-unit">°${tempUnit.replace('°','')}</span></div>
            <canvas id="chart-temp" style="height:110px;margin-top:10px"></canvas>
          </div>

          <!-- Stato Volume -->
          <div class="nd-panel">
            <div class="nd-panel-title">
              Stato Volume ${n}
              <ha-icon icon="mdi:nas"></ha-icon>
            </div>
            <div style="font-size:24px;font-weight:400;color:${vsColor};margin-top:8px">${volState}</div>
          </div>

        </div>
      </div>`;

    requestAnimationFrame(() => {
      const donutCanvas = this.shadowRoot.querySelector('#chart-donut');
      const usedVal = parseFloat(used);
      const freeVal = parseFloat(free);
      if (donutCanvas && !isNaN(usedVal) && !isNaN(freeVal)) {
        const dpr  = window.devicePixelRatio || 1;
        const size = 140;
        donutCanvas.width  = size * dpr;
        donutCanvas.height = size * dpr;
        donutCanvas.getContext('2d').scale(dpr, dpr);
        this._drawDonut(donutCanvas, usedVal, freeVal, cfg.color_donut_used, cfg.color_donut_free);
      }
      this._redrawCharts();
    });
  }

  // ── STATUS panel ──────────────────────────────────────────────────────────
  _renderStatus() {
    const cfg = this._config;
    const b   = cfg.sensor_base;
    const st  = this._hass.states;

    const g = (suffix) => {
      const id  = b + suffix;
      const raw = st[id]?.state || '--';
      const unit = _unit(id, this._hass);
      return { val: raw, unit, fmt: _fmtNum(raw) };
    };

    const ram     = g(cfg.suffix_ram_pct);
    const ramFree = g(cfg.suffix_ram_free);
    const swapU   = g(cfg.suffix_swap_used);
    const swapF   = g(cfg.suffix_swap_free);
    const cpuT    = g(cfg.suffix_cpu_total);
    const load1   = g(cfg.suffix_load_1);
    const load5   = g(cfg.suffix_load_5);
    const load15  = g(cfg.suffix_load_15);
    const cache   = g(cfg.suffix_cache);
    const netUp   = g(cfg.suffix_net_up);
    const netDown = g(cfg.suffix_net_down);

    this.shadowRoot.innerHTML = `
      <style>${this._baseCSS()}
        .nd-grid-status { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      </style>
      <div class="nd-wrap">
        <div class="nd-title">
          <ha-icon icon="mdi:server" style="--mdc-icon-size:16px;color:${cfg.color_accent}"></ha-icon>
          Status
        </div>
        <div class="nd-grid-status">

          <!-- RAM -->
          <div class="nd-panel">
            <div class="nd-panel-title">Memoria RAM <ha-icon icon="mdi:memory"></ha-icon></div>
            <div style="display:flex;justify-content:space-between;align-items:baseline">
              <span><span class="nd-big">${ram.fmt}</span><span class="nd-unit">%</span></span>
              <span><span class="nd-big2">${ramFree.fmt}</span><span class="nd-unit">${ramFree.unit}</span></span>
            </div>
            <div class="nd-legend">
              <div><span class="nd-leg-dot" style="background:${cfg.color_ram}"></span>In Uso</div>
              <div><span class="nd-leg-dot" style="background:${cfg.color_swap}"></span>Disponibile</div>
            </div>
            <canvas id="chart-ram" style="height:70px"></canvas>
          </div>

          <!-- SWAP -->
          <div class="nd-panel">
            <div class="nd-panel-title">Memoria SWAP <ha-icon icon="mdi:memory"></ha-icon></div>
            <div style="display:flex;justify-content:space-between;align-items:baseline">
              <span><span class="nd-big">${swapU.fmt}</span><span class="nd-unit">${swapU.unit}</span></span>
              <span><span class="nd-big2">${swapF.fmt}</span><span class="nd-unit">${swapF.unit}</span></span>
            </div>
            <canvas id="chart-swap" style="height:70px;margin-top:28px"></canvas>
          </div>

          <!-- CPU utilizzo -->
          <div class="nd-panel">
            <div class="nd-panel-title">Utilizzo CPU <ha-icon icon="mdi:cpu-64-bit"></ha-icon></div>
            <div><span class="nd-big">${cpuT.fmt}</span><span class="nd-unit">%</span></div>
            <div class="nd-legend">
              <div><span class="nd-leg-dot" style="background:${cfg.color_cpu_total}"></span>CPU Totale</div>
              <div><span class="nd-leg-dot" style="background:${cfg.color_cpu_sys}"></span>CPU sistema</div>
              <div><span class="nd-leg-dot" style="background:${cfg.color_cpu_user}"></span>CPU utente</div>
              <div><span class="nd-leg-dot" style="background:${cfg.color_cpu_other}"></span>CPU altro</div>
            </div>
            <canvas id="chart-cpu" style="height:80px"></canvas>
          </div>

          <!-- CPU carico -->
          <div class="nd-panel">
            <div class="nd-panel-title">Carico CPU <ha-icon icon="mdi:cpu-64-bit"></ha-icon></div>
            <div style="display:flex;justify-content:space-between;align-items:baseline">
              <span><span class="nd-big">${load1.fmt}</span><span class="nd-unit">load</span></span>
              <div style="text-align:right;font-size:12px;color:${cfg.color_subtext};line-height:1.6">
                <div>${load5.fmt} load</div>
                <div>${load15.fmt} load</div>
              </div>
            </div>
            <div class="nd-legend">
              <div><span class="nd-leg-dot" style="background:${cfg.color_load_1}"></span>CPU load 1 min.</div>
              <div><span class="nd-leg-dot" style="background:${cfg.color_load_5}"></span>CPU load 5 min.</div>
              <div><span class="nd-leg-dot" style="background:${cfg.color_load_15}"></span>CPU load 15 min.</div>
            </div>
            <canvas id="chart-load" style="height:80px"></canvas>
          </div>

          <!-- Cache -->
          <div class="nd-panel">
            <div class="nd-panel-title">Memoria Cache <ha-icon icon="mdi:layers-triple"></ha-icon></div>
            <div><span class="nd-big">${cache.fmt}</span><span class="nd-unit">${cache.unit}</span></div>
            <canvas id="chart-cache" style="height:70px;margin-top:10px"></canvas>
          </div>

          <!-- Rete -->
          <div class="nd-panel">
            <div class="nd-panel-title">Velocità di Rete <ha-icon icon="mdi:wifi"></ha-icon></div>
            <div style="display:flex;justify-content:space-between;align-items:baseline">
              <span style="color:${cfg.color_net_up}"><span class="nd-big">${netUp.fmt}</span><span class="nd-unit">${netUp.unit}</span></span>
              <span style="color:${cfg.color_net_down}"><span class="nd-big2">${netDown.fmt}</span><span class="nd-unit">${netDown.unit}</span></span>
            </div>
            <div class="nd-legend">
              <div><span class="nd-leg-dot" style="background:${cfg.color_net_up}"></span>Upload</div>
              <div><span class="nd-leg-dot" style="background:${cfg.color_net_down}"></span>Download</div>
            </div>
            <canvas id="chart-net" style="height:70px"></canvas>
          </div>

        </div>
      </div>`;
  }

  // ── ALERT panel ───────────────────────────────────────────────────────────
  _renderAlert() {
    const cfg  = this._config;
    const bin  = cfg.binary_base;
    const st   = this._hass.states;

    let anyAlert = false;
    let cardsHtml = '';

    for (let i = 1; i <= cfg.bays; i++) {
      const badId  = bin + cfg.suffix_bad_sectors.replace('{N}', i);
      const lifeId = bin + cfg.suffix_low_life.replace('{N}', i);

      const badState  = st[badId]?.state;
      const lifeState = st[lifeId]?.state;

      const mkCard = (title, state, icon) => {
        const missing = !state || state === 'unavailable' || state === 'unknown';
        if (missing) return `
          <div class="al-card al-missing">
            <div class="al-title"><ha-icon icon="${icon}" style="--mdc-icon-size:14px"></ha-icon> ${title} ${i}</div>
            <div class="al-warn">⚠ Entità non trovata</div>
          </div>`;
        const isAlert = state === 'on';
        if (isAlert) anyAlert = true;
        return `
          <div class="al-card${isAlert ? ' al-active' : ''}">
            <div class="al-title"><ha-icon icon="${icon}" style="--mdc-icon-size:14px;color:${cfg.color_subtext}"></ha-icon> ${title} ${i}</div>
            <div class="al-val" style="color:${isAlert ? cfg.color_warn : cfg.color_text}">${isAlert ? cfg.label_alert_bad : cfg.label_safe}</div>
          </div>`;
      };

      cardsHtml += mkCard(cfg.label_bad_sectors_prefix, badState,  'mdi:nas');
      cardsHtml += mkCard(cfg.label_low_life_prefix,    lifeState, 'mdi:nas');
    }

    const noAlarmHtml = !anyAlert
      ? `<div class="al-no-alarm">${cfg.label_no_alarm}</div>` : '';

    this.shadowRoot.innerHTML = `
      <style>${this._baseCSS()}
        .al-grid { display:grid; grid-template-columns:repeat(6,1fr); gap:8px; }
        .al-card { background:${cfg.color_card_bg}; border:1px solid ${cfg.color_border};
                   border-radius:8px; padding:10px 12px; }
        .al-card.al-active { border-color:${cfg.color_warn}; background:#1a1200; }
        .al-card.al-missing { border-color:#3a2800; background:#1a1200; }
        .al-title { font-size:11px; color:${cfg.color_subtext}; margin-bottom:6px;
                    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
                    display:flex; align-items:center; gap:4px; }
        .al-val { font-size:20px; font-weight:bold; }
        .al-warn { font-size:11px; color:${cfg.color_warn}; }
        .al-no-alarm { font-size:14px; color:${cfg.color_accent}; font-style:italic;
                       padding:12px 0; }
      </style>
      <div class="nd-wrap">
        <div class="nd-title">
          <ha-icon icon="mdi:alert-circle" style="--mdc-icon-size:16px;color:${cfg.color_warn}"></ha-icon>
          Alert
        </div>
        <div class="al-grid">
          ${cardsHtml}
          ${noAlarmHtml}
        </div>
      </div>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  VISUAL EDITOR
// ─────────────────────────────────────────────────────────────────────────────
class ManagedNasDetailCardEditor extends HTMLElement {
  setConfig(config) { this._config = { ...NAS_DETAIL_DEFAULTS, ...config }; this._render(); }
  set hass(h) { this._hass = h; }

  _fire(cfg) {
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: cfg }, bubbles: true, composed: true,
    }));
  }

  _f(label, key, type = 'text', hint = '') {
    const v = String(this._config?.[key] ?? '');
    return `<div class="row"><label>${label}</label>
      <input type="${type}" value="${v.replace(/"/g,'&quot;')}" data-key="${key}"
             onchange="this.getRootNode().host._ch(event)"/>
      ${hint ? `<small>${hint}</small>` : ''}</div>`;
  }

  _render() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;padding:16px;font-family:Arial,sans-serif;font-size:13px;color:#eee}
        h4{margin:16px 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.6px;
           color:#007bff;border-top:1px solid #333;padding-top:12px}
        h4:first-child{border-top:none;margin-top:0}
        .row{margin-bottom:10px}
        label{display:block;font-size:11px;color:#888;margin-bottom:3px}
        input{width:100%;padding:5px 8px;border-radius:5px;border:1px solid #444;
              background:#1a1a1a;color:#fff;font-size:13px;box-sizing:border-box}
        small{display:block;font-size:10px;color:#555;margin-top:2px}
      </style>

      <h4>Collegamento</h4>
      ${this._f('Input select',       'input_select',       'text', 'stessa entità della managed-nas-card')}
      ${this._f('Sensor base',        'sensor_base',        'text', 'es. sensor.mynas')}
      ${this._f('Binary sensor base', 'binary_base',        'text', 'es. binary_sensor.mynas')}
      ${this._f('Numero bay',         'bays',               'number')}
      ${this._f('Prefisso opzione bay','bay_option_prefix', 'text', 'es. "Baia " → deve corrispondere alla nas-card')}
      ${this._f('Valore nessuna',     'input_select_none')}

      <h4>Suffissi — Bay ({N} = numero bay)</h4>
      ${this._f('Spazio usato volume',   'suffix_vol_used')}
      ${this._f('Spazio libero volume',  'suffix_vol_free')}
      ${this._f('Stato volume',          'suffix_vol_state')}
      ${this._f('Temperatura disco',     'suffix_temp')}
      ${this._f('Settori danneggiati',   'suffix_bad_sectors')}
      ${this._f('Vita residua bassa',    'suffix_low_life')}

      <h4>Suffissi — Status</h4>
      ${this._f('RAM %',              'suffix_ram_pct')}
      ${this._f('RAM disponibile',    'suffix_ram_free')}
      ${this._f('SWAP usato',         'suffix_swap_used')}
      ${this._f('SWAP disponibile',   'suffix_swap_free')}
      ${this._f('CPU totale %',       'suffix_cpu_total')}
      ${this._f('CPU sistema %',      'suffix_cpu_sys')}
      ${this._f('CPU utente %',       'suffix_cpu_user')}
      ${this._f('CPU altro %',        'suffix_cpu_other')}
      ${this._f('CPU load 1 min',     'suffix_load_1')}
      ${this._f('CPU load 5 min',     'suffix_load_5')}
      ${this._f('CPU load 15 min',    'suffix_load_15')}
      ${this._f('Cache',              'suffix_cache')}
      ${this._f('Upload rete',        'suffix_net_up')}
      ${this._f('Download rete',      'suffix_net_down')}

      <h4>Grafico</h4>
      ${this._f('Ore di storico',           'history_hours',   'number')}
      ${this._f('Aggiornamento grafico (ms)','graph_update_ms', 'number')}

      <h4>Colori grafici</h4>
      ${this._f('Temperatura',    'color_temp_line', 'color')}
      ${this._f('Donut usato',    'color_donut_used','color')}
      ${this._f('Donut libero',   'color_donut_free','color')}
      ${this._f('RAM',            'color_ram',       'color')}
      ${this._f('SWAP',           'color_swap',      'color')}
      ${this._f('CPU totale',     'color_cpu_total', 'color')}
      ${this._f('CPU sistema',    'color_cpu_sys',   'color')}
      ${this._f('CPU utente',     'color_cpu_user',  'color')}
      ${this._f('CPU altro',      'color_cpu_other', 'color')}
      ${this._f('Load 1 min',     'color_load_1',    'color')}
      ${this._f('Load 5 min',     'color_load_5',    'color')}
      ${this._f('Load 15 min',    'color_load_15',   'color')}
      ${this._f('Cache',          'color_cache',     'color')}
      ${this._f('Upload',         'color_net_up',    'color')}
      ${this._f('Download',       'color_net_down',  'color')}
    `;
  }

  _ch(e) {
    const key = e.target.dataset.key;
    const val = e.target.value;
    const cfg = { ...this._config };
    if (key === 'bays')            { cfg.bays            = parseInt(val,10)||8;    this._fire(cfg); return; }
    if (key === 'history_hours')   { cfg.history_hours   = parseFloat(val)||1;     this._fire(cfg); return; }
    if (key === 'graph_update_ms') { cfg.graph_update_ms = parseInt(val,10)||5000; this._fire(cfg); return; }
    cfg[key] = val;
    this._fire(cfg);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
customElements.define('managed-nas-detail-card', ManagedNasDetailCard);
customElements.define('managed-nas-detail-card-editor', ManagedNasDetailCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type:             'managed-nas-detail-card',
  name:             'Managed NAS Detail Card',
  description:      'Card dettaglio per managed-nas-card. Mostra spazio/temperatura/stato bay, statistiche sistema e alert dischi.',
  preview:          false,
  documentationURL: 'https://github.com/YOUR_USERNAME/managed-nas-card',
});
