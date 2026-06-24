/**
 * managed-nas-card  v1.0.0
 * Universal Lovelace card for NAS devices in Home Assistant.
 * Works with any brand/model — all entity names and visual options configurable.
 *
 * Logic and visual DNA faithful to the original NAS rack selector card.
 * License: MIT
 */

// ─────────────────────────────────────────────────────────────────────────────
//  DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────
const NAS_DEFAULTS = {
  // ── Header ──────────────────────────────────────────────────────────────
  title: 'NAS',          // logo text top-left
  model: '',             // shown as "Modello: X" — set '' to hide

  // ── Entity bases (REQUIRED) ──────────────────────────────────────────────
  sensor_base: '',       // e.g. sensor.mynas
  binary_base: '',       // e.g. binary_sensor.mynas

  // ── Bay configuration ────────────────────────────────────────────────────
  bays: 8,               // total number of drive bays
  // grid_cols: how many columns in the bay grid
  //   'auto' → same as original: ceil(bays/2) so 8 bays = 4 cols × 2 rows
  //   2      → 2 columns (tall stack)
  //   4      → 4 columns (original look for 8-bay)
  //   any integer
  grid_cols: 'auto',
  bay_label: 'BAY',      // label shown under each bay  →  "BAY 1", "SLOT 3", etc.

  // ── input_select ────────────────────────────────────────────────────────
  input_select: '',           // e.g. input_select.nas_selected_bay
  input_select_none: 'Nessuna',
  bay_option_prefix: 'Baia ', // option value prefix: "Baia 1", "Baia 2", ...

  // ── Action buttons ───────────────────────────────────────────────────────
  reboot_button:   '',        // e.g. button.mynas_reboot
  shutdown_button: '',        // e.g. button.mynas_shutdown

  // ── Entity suffixes ──────────────────────────────────────────────────────
  // Bay-level (replace {N} with bay number)
  suffix_smart:       '_drive_{N}_stato_intelligente',
  suffix_bad_sectors: '_drive_{N}_superato_il_numero_massimo_di_settori_danneggiati',
  suffix_low_life:    '_drive_{N}_al_di_sotto_della_vita_residua_minima',
  // System-level
  suffix_temp:    '_temperatura',
  suffix_uptime:  '_ultimo_avvio',       // ISO timestamp
  suffix_safety:  '_stato_di_sicurezza', // binary: on = unsafe

  // ── USB detection ────────────────────────────────────────────────────────
  // Prefix-match on entity ids. Leave '' to disable USB widget entirely.
  usb_prefix: '',            // e.g. sensor.mynas_usb_disk
  // States considered "safe" for USB entities ending in _status
  usb_safe_states: ['normal', 'unavailable', 'unknown'],

  // ── SMART ok values ──────────────────────────────────────────────────────
  smart_ok: ['normal', 'Ottimo'],

  // ── Feature flags ────────────────────────────────────────────────────────
  show_reboot:   true,
  show_shutdown: true,
  show_usb:      true,
  show_status:   true,
  show_alert:    true,
  show_temp:     true,
  show_uptime:   true,

  // ── Colors ───────────────────────────────────────────────────────────────
  // All originals are hardcoded here as defaults; user can override any of them
  color_bg:           '#1c1c1c',
  color_border:       '#333',
  color_text:         '#ffffff',
  color_accent:       '#007bff',   // selection highlight, reboot btn, dot selected
  color_info:         '#4a90e2',   // subtitle / info-row text
  color_sep:          '#444',
  color_bay_bg:       '#222',
  color_bay_border:   '#444',
  color_bay_sub:      '#555',
  color_led_off:      '#333',      // original: "#333"
  color_led_ok:       '#00ff41',
  color_led_warn:     '#ff9800',
  color_led_error:    '#f44336',
  color_status_ok:    '#00ff41',
  color_status_warn:  '#ff9800',

  // ── Labels ───────────────────────────────────────────────────────────────
  label_temp:     'Temp:',
  label_uptime:   'Avvio:',
  label_status:   'STATUS',
  label_alert:    'ALERT',
  label_confirm_reboot:   'Riavviare?',
  label_confirm_shutdown: 'Spegnere?',
};

// ─────────────────────────────────────────────────────────────────────────────
//  CARD
// ─────────────────────────────────────────────────────────────────────────────
class ManagedNasCard extends HTMLElement {

  setConfig(config) {
    if (!config.sensor_base) throw new Error('managed-nas-card: "sensor_base" è obbligatorio.');
    if (!config.binary_base) throw new Error('managed-nas-card: "binary_base" è obbligatorio.');
    this._config = { ...NAS_DEFAULTS, ...config };
    this._config.bays = parseInt(this._config.bays, 10) || 8;
  }

  getCardSize() { return 3; }

  static getConfigElement() {
    return document.createElement('managed-nas-card-editor');
  }

  static getStubConfig() {
    return {
      title: 'NAS',
      model: 'MyNAS-8',
      bays: 8,
      grid_cols: 'auto',
      sensor_base: 'sensor.mynas',
      binary_base: 'binary_sensor.mynas',
      input_select: 'input_select.nas_selected_bay',
      reboot_button: 'button.mynas_reboot',
      shutdown_button: 'button.mynas_shutdown',
      usb_prefix: 'sensor.mynas_usb_disk',
    };
  }

  // ── connectedCallback ─────────────────────────────────────────────────────
  // Original: reset server-side only if _hass already available.
  // Also resets _firstRender so next mount starts with a local "Nessuna".
  connectedCallback() {
    this._firstRender = undefined; // reset the first-render flag on (re)mount
    if (this._hass && this._config?.input_select) {
      this._hass.callService('input_select', 'select_option', {
        entity_id: this._config.input_select,
        option: this._config.input_select_none,
      });
    }
  }

  // ── hass setter ───────────────────────────────────────────────────────────
  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;

    // ── ORIGINAL RESET LOGIC ─────────────────────────────────────────────
    // First render of the session: force local selection to "Nessuna"
    // regardless of what the server says (avoids stale state on mount).
    if (this._firstRender === undefined) {
      this._selectedLocal = this._config.input_select_none;
      this._firstRender = false;
    } else {
      this._selectedLocal = this._config.input_select
        ? (hass.states[this._config.input_select]?.state || this._config.input_select_none)
        : this._config.input_select_none;
    }

    // ── Ensure container ─────────────────────────────────────────────────
    // Original pattern: no shadowRoot — write directly into <ha-card>
    if (!this.content) {
      this.innerHTML = `<ha-card></ha-card>`;
      this.content = this.querySelector('ha-card');
    }

    this._render(hass);
  }

  // ── formatUptime — identical to original ─────────────────────────────────
  _formatUptime(timestamp) {
    if (!timestamp || timestamp === 'unavailable' || timestamp === 'unknown') return '--';
    const lastBoot = new Date(timestamp);
    const now      = new Date();
    const diffMs   = now - lastBoot;
    const minutes  = Math.floor(diffMs / 60000);
    const hours    = Math.floor(minutes / 60);
    const days     = Math.floor(hours / 24);
    const years    = Math.floor(days / 365);

    if (years   > 0) return `${years} ann${years   === 1 ? 'o' : 'i'}`;
    if (days    > 0) return `${days} giorn${days    === 1 ? 'o' : 'i'}`;
    if (hours   > 0) return `${hours} or${hours     === 1 ? 'a' : 'e'}`;
    return `${minutes} minut${minutes === 1 ? 'o' : 'i'}`;
  }

  // ── _render ───────────────────────────────────────────────────────────────
  _render(hass) {
    const cfg      = this._config;
    const base     = cfg.sensor_base;
    const bin      = cfg.binary_base;
    const selected = this._selectedLocal;
    const st       = hass.states;

    // ── System readings ───────────────────────────────────────────────────
    const nasTemp = st[base + cfg.suffix_temp]?.state   || '--';
    const uptime  = this._formatUptime(st[base + cfg.suffix_uptime]?.state);

    // ── Alert scan ────────────────────────────────────────────────────────
    let hasBadSectors = false;
    let hasLowLife    = false;
    for (let i = 1; i <= cfg.bays; i++) {
      if (st[bin + cfg.suffix_bad_sectors.replace('{N}', i)]?.state === 'on') hasBadSectors = true;
      if (st[bin + cfg.suffix_low_life.replace('{N}',   i)]?.state === 'on') hasLowLife    = true;
    }

    // Alert color — original exact logic
    let alertColor = cfg.color_led_off;
    let alertBlink = false;
    if (hasBadSectors)   { alertColor = cfg.color_led_error; alertBlink = true; }
    else if (hasLowLife) { alertColor = cfg.color_led_warn;  alertBlink = true; }

    // ── USB detection ─────────────────────────────────────────────────────
    const allEntities = Object.keys(st);
    const usbPrefix   = cfg.usb_prefix;
    const usbConnected = usbPrefix
      ? allEntities.some(id => id.startsWith(usbPrefix))
      : false;
    const usbWarning = usbPrefix
      ? allEntities.some(id =>
          id.startsWith(usbPrefix) &&
          id.endsWith('_status') &&
          !cfg.usb_safe_states.includes(st[id]?.state))
      : false;

    // ── Safety / Status ───────────────────────────────────────────────────
    const isUnsafe    = st[bin + cfg.suffix_safety]?.state === 'on';
    const statusColor = isUnsafe ? cfg.color_status_warn : cfg.color_status_ok;

    // ── Bay grid columns ──────────────────────────────────────────────────
    // 'auto' → ceil(bays/2) — same as original 8-bay = 4 cols
    const cols = cfg.grid_cols === 'auto' || cfg.grid_cols === 0
      ? Math.ceil(cfg.bays / 2)
      : parseInt(cfg.grid_cols, 10) || Math.ceil(cfg.bays / 2);

    // ── Bay HTML ──────────────────────────────────────────────────────────
    let baysHtml = '';
    for (let i = 1; i <= cfg.bays; i++) {
      const smartStatus = st[base + cfg.suffix_smart.replace('{N}', i)]?.state;
      const isSelected  = selected === cfg.bay_option_prefix + i;

      // LED color — original exact logic
      let ledColor = cfg.color_led_off;
      if (smartStatus && !['unavailable', 'unknown'].includes(smartStatus)) {
        if (cfg.smart_ok.includes(smartStatus)) {
          const lowLife = st[bin + cfg.suffix_low_life.replace('{N}', i)]?.state === 'on';
          ledColor = lowLife ? cfg.color_led_warn : cfg.color_led_ok;
        } else {
          ledColor = cfg.color_led_error;
        }
      }

      // Shadow — original: only when ledColor !== '#333' (the hardcoded off color)
      // We generalise: only when ledColor !== cfg.color_led_off
      const ledShadow = ledColor !== cfg.color_led_off ? `0 0 5px ${ledColor}` : 'none';

      baysHtml += `
        <div class="selectable-item" data-value="${cfg.bay_option_prefix}${i}">
          <div class="bay-handle${isSelected ? ' selected' : ''}">
            <div class="bay-led" style="background:${ledColor}; box-shadow:${ledShadow}"></div>
            <div class="lock-icon"></div>
          </div>
          <div class="bay-sub">${cfg.bay_label} ${i}</div>
        </div>`;
    }

    // ── USB widget ────────────────────────────────────────────────────────
    const usbHtml = (cfg.show_usb && usbPrefix) ? `
      <div class="usb-container selectable-item" data-value="USB">
        <ha-icon class="usb-icon${usbWarning ? ' blink' : ''}" icon="mdi:harddisk"
                 style="color:${selected === 'USB'
                   ? cfg.color_accent
                   : (usbConnected ? (usbWarning ? cfg.color_led_warn : cfg.color_led_ok) : cfg.color_led_off)};"></ha-icon>
      </div>` : '';

    // ── Status / Alert dots ───────────────────────────────────────────────
    const statusHtml = cfg.show_status ? `
      <div class="led-group selectable-item${selected === 'Status' ? ' selected' : ''}" data-value="Status">
        <div class="dot${isUnsafe ? ' blink' : ''}" style="background:${statusColor};"></div>
        ${cfg.label_status}
      </div>` : '';

    const alertShadow = alertColor !== cfg.color_led_off ? `0 0 5px ${alertColor}` : 'none';
    const alertHtml = cfg.show_alert ? `
      <div class="led-group selectable-item${selected === 'Alert' ? ' selected' : ''}" data-value="Alert">
        <div class="dot${alertBlink ? ' blink' : ''}" style="background:${alertColor}; box-shadow:${alertShadow}"></div>
        ${cfg.label_alert}
      </div>` : '';

    // ── Action buttons ────────────────────────────────────────────────────
    const rebootHtml = (cfg.show_reboot && cfg.reboot_button)
      ? `<ha-icon id="reboot-btn" class="btn btn-reboot" icon="mdi:restart"></ha-icon>` : '';
    const powerHtml  = (cfg.show_shutdown && cfg.shutdown_button)
      ? `<ha-icon id="power-btn" class="btn btn-power" icon="mdi:power"></ha-icon>` : '';
    const actionHtml = (rebootHtml || powerHtml)
      ? `<div class="action-btns">${rebootHtml}${powerHtml}</div>` : '';

    // ── Info row ──────────────────────────────────────────────────────────
    const modelLine  = cfg.model ? `<div>Modello: ${cfg.model}</div>` : '';
    const infoItems  = [];
    if (cfg.show_temp)   infoItems.push(`<b>${cfg.label_temp}</b> ${nasTemp}°C`);
    if (cfg.show_uptime) infoItems.push(`<b>${cfg.label_uptime}</b> ${uptime}`);
    const infoLine = infoItems.length
      ? `<div>${infoItems.join(`<span class="sep">|</span>`)}</div>`
      : '';

    // ── sys-panel (right side of header) ─────────────────────────────────
    const sysLedsHtml = (statusHtml || alertHtml)
      ? `<div class="sys-leds">${statusHtml}${alertHtml}</div>` : '';
    const sysPanelHtml = (usbHtml || sysLedsHtml)
      ? `<div class="sys-panel">${usbHtml}${sysLedsHtml}</div>` : '';

    // ── CSS — pixel-perfect to original ──────────────────────────────────
    this.content.innerHTML = `
      <style>
        ha-card { background:${cfg.color_bg}; padding:15px; border:1px solid ${cfg.color_border}; font-family:Arial,sans-serif; color:${cfg.color_text}; }
        .header { display:flex; justify-content:space-between; margin-bottom:20px; align-items:center; }
        .brand { display:flex; align-items:center; gap:10px; }
        .logo-box { display:flex; flex-direction:column; }
        .logo { font-weight:800; font-size:20px; text-transform:uppercase; letter-spacing:1px; color:${cfg.color_text}; }
        .info-row { color:${cfg.color_info}; font-size:11px; font-weight:bold; opacity:0.9; line-height:1.2; margin-top:2px; }
        .sep { color:${cfg.color_sep}; margin:0 4px; }
        .action-btns { display:flex; gap:8px; border-left:1px solid ${cfg.color_border}; padding-left:12px; margin-left:5px; align-items:center; }
        .btn { cursor:pointer; --mdc-icon-size:20px; }
        .btn-reboot { color:${cfg.color_accent} !important; }
        .btn-power  { color:${cfg.color_led_error} !important; }
        .sys-panel { display:flex; gap:15px; align-items:center; }
        .sys-leds { display:flex; gap:12px; }
        .led-group { display:flex; flex-direction:column; align-items:center; font-size:8px; color:${cfg.color_bay_sub}; font-weight:bold; cursor:pointer; }
        .led-group.selected { color:${cfg.color_accent}; }
        .dot { width:7px; height:7px; border-radius:50%; margin-bottom:3px; }
        .usb-icon { --mdc-icon-size:22px; }
        ${(cfg.show_usb && cfg.usb_prefix) ? '.usb-container { cursor:pointer; }' : ''}
        .blink { animation:blinker 1.5s linear infinite; }
        @keyframes blinker { 50% { opacity:0.2; } }
        .drive-grid { display:grid; grid-template-columns:repeat(${cols},minmax(0,1fr)); gap:10px 8px; }
        .bay-handle { height:50px; background:${cfg.color_bay_bg}; border:1px solid ${cfg.color_bay_border}; border-radius:3px; display:flex; align-items:center; justify-content:space-around; padding:0 5px; transition:0.2s; cursor:pointer; }
        .bay-handle.selected { border-color:${cfg.color_accent}; background:#2d2d2d; box-shadow:0 0 8px ${cfg.color_accent}55; }
        .bay-led { width:4px; height:18px; }
        .lock-icon { width:8px; height:8px; border-radius:50%; border:1px solid ${cfg.color_bay_border}; background:#111; }
        .bay-sub { font-size:11px; color:${cfg.color_bay_sub}; text-align:center; margin-top:6px; font-weight:bold; letter-spacing:0.5px; }
      </style>

      <div class="header">
        <div class="brand">
          <div class="logo-box">
            <span class="logo">${cfg.title}</span>
            <div class="info-row">
              ${modelLine}
              ${infoLine}
            </div>
          </div>
          ${actionHtml}
        </div>
        ${sysPanelHtml}
      </div>
      <div class="drive-grid">${baysHtml}</div>
    `;

    // ── Listeners — recreated on each render (original pattern) ──────────
    this.content.querySelectorAll('.selectable-item').forEach(el => {
      el.onclick = () => {
        const val = el.getAttribute('data-value');
        if (cfg.input_select) {
          this._hass.callService('input_select', 'select_option', {
            entity_id: cfg.input_select,
            option: (selected === val) ? cfg.input_select_none : val,
          });
        }
      };
    });

    const rebootEl = this.content.querySelector('#reboot-btn');
    if (rebootEl) rebootEl.onclick = (e) => {
      e.stopPropagation();
      if (confirm(cfg.label_confirm_reboot))
        this._hass.callService('button', 'press', { entity_id: cfg.reboot_button });
    };

    const powerEl = this.content.querySelector('#power-btn');
    if (powerEl) powerEl.onclick = (e) => {
      e.stopPropagation();
      if (confirm(cfg.label_confirm_shutdown))
        this._hass.callService('button', 'press', { entity_id: cfg.shutdown_button });
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  VISUAL EDITOR
// ─────────────────────────────────────────────────────────────────────────────
class ManagedNasCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...NAS_DEFAULTS, ...config };
    this._render();
  }
  set hass(h) { this._hass = h; }

  _fire(cfg) {
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: cfg }, bubbles: true, composed: true,
    }));
  }

  _f(label, key, type = 'text', hint = '') {
    const v = String(this._config?.[key] ?? '');
    return `<div class="row">
      <label>${label}</label>
      <input type="${type}" value="${v.replace(/"/g,'&quot;')}" data-key="${key}"
             onchange="this.getRootNode().host._ch(event)"/>
      ${hint ? `<small>${hint}</small>` : ''}
    </div>`;
  }

  _s(label, key, opts) {
    const cur = String(this._config?.[key] ?? opts[0].v);
    const os  = opts.map(o => `<option value="${o.v}"${cur===String(o.v)?' selected':''}>${o.l}</option>`).join('');
    return `<div class="row">
      <label>${label}</label>
      <select data-key="${key}" onchange="this.getRootNode().host._ch(event)">${os}</select>
    </div>`;
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
        input,select{width:100%;padding:5px 8px;border-radius:5px;border:1px solid #444;
                     background:#1a1a1a;color:#fff;font-size:13px;box-sizing:border-box}
        small{display:block;font-size:10px;color:#555;margin-top:2px}
      </style>

      <h4>Dispositivo</h4>
      ${this._f('Titolo (logo)',       'title')}
      ${this._f('Modello',             'model',      'text', 'es. MyNAS-8Bay — lascia vuoto per nascondere')}

      <h4>Bay</h4>
      ${this._f('Numero bay',          'bays',       'number')}
      ${this._s('Colonne griglia',     'grid_cols',  [
          {v:'auto', l:'Auto — metà bay per riga (es. 8 bay = 4 col × 2 righe)'},
          {v:'2',    l:'2 colonne (stack verticale)'},
          {v:'3',    l:'3 colonne'},
          {v:'4',    l:'4 colonne (originale 8-bay)'},
          {v:'6',    l:'6 colonne'},
          {v:'8',    l:'8 colonne (riga singola)'},
        ])}
      ${this._f('Etichetta bay',       'bay_label',  'text', 'es. BAY · SLOT · DRIVE')}

      <h4>Entità — obbligatorie</h4>
      ${this._f('Sensor base',         'sensor_base','text', 'es. sensor.mynas')}
      ${this._f('Binary sensor base',  'binary_base','text', 'es. binary_sensor.mynas')}

      <h4>Entità — opzionali</h4>
      ${this._f('Input select bay',    'input_select',   'text', 'es. input_select.nas_selected_bay')}
      ${this._f('Prefisso opzione bay','bay_option_prefix','text','es. "Baia " → "Baia 1"')}
      ${this._f('Valore nessuna',      'input_select_none')}
      ${this._f('Pulsante reboot',     'reboot_button',  'text', 'es. button.mynas_reboot')}
      ${this._f('Pulsante shutdown',   'shutdown_button','text', 'es. button.mynas_shutdown')}
      ${this._f('Prefisso entità USB', 'usb_prefix',     'text', 'es. sensor.mynas_usb_disk — vuoto = nasconde widget')}

      <h4>Suffissi entità bay (avanzato — {N} = numero bay)</h4>
      ${this._f('SMART status',           'suffix_smart')}
      ${this._f('Settori danneggiati',    'suffix_bad_sectors')}
      ${this._f('Vita residua bassa',     'suffix_low_life')}
      ${this._f('Temperatura',            'suffix_temp')}
      ${this._f('Ultimo avvio (ISO)',     'suffix_uptime')}
      ${this._f('Stato sicurezza (bin)',  'suffix_safety')}

      <h4>Valori SMART OK</h4>
      ${this._f('Valori OK (virgola)',    'smart_ok_raw','text','es. normal,Ottimo,Good,Normal')}

      <h4>Colori</h4>
      ${this._f('Sfondo card',           'color_bg',          'color')}
      ${this._f('Bordo card',            'color_border',      'color')}
      ${this._f('Testo',                 'color_text',        'color')}
      ${this._f('Accento (selezione)',   'color_accent',      'color')}
      ${this._f('Info/subtitle',         'color_info',        'color')}
      ${this._f('Sfondo bay',            'color_bay_bg',      'color')}
      ${this._f('Bordo bay',             'color_bay_border',  'color')}
      ${this._f('Testo etichetta bay',   'color_bay_sub',     'color')}
      ${this._f('LED spento',            'color_led_off',     'color')}
      ${this._f('LED OK',                'color_led_ok',      'color')}
      ${this._f('LED warning',           'color_led_warn',    'color')}
      ${this._f('LED errore',            'color_led_error',   'color')}

      <h4>Funzionalità</h4>
      ${this._s('Pulsante reboot',   'show_reboot',   [{v:'true',l:'Sì'},{v:'false',l:'No'}])}
      ${this._s('Pulsante shutdown', 'show_shutdown', [{v:'true',l:'Sì'},{v:'false',l:'No'}])}
      ${this._s('Widget USB',        'show_usb',      [{v:'true',l:'Sì'},{v:'false',l:'No'}])}
      ${this._s('Dot STATUS',        'show_status',   [{v:'true',l:'Sì'},{v:'false',l:'No'}])}
      ${this._s('Dot ALERT',         'show_alert',    [{v:'true',l:'Sì'},{v:'false',l:'No'}])}
      ${this._s('Temperatura',       'show_temp',     [{v:'true',l:'Sì'},{v:'false',l:'No'}])}
      ${this._s('Uptime',            'show_uptime',   [{v:'true',l:'Sì'},{v:'false',l:'No'}])}

      <h4>Testi</h4>
      ${this._f('Etichetta Temp',    'label_temp')}
      ${this._f('Etichetta Avvio',   'label_uptime')}
      ${this._f('Etichetta STATUS',  'label_status')}
      ${this._f('Etichetta ALERT',   'label_alert')}
      ${this._f('Conferma reboot',   'label_confirm_reboot')}
      ${this._f('Conferma shutdown', 'label_confirm_shutdown')}
    `;
  }

  _ch(e) {
    const key = e.target.dataset.key;
    const val = e.target.value;
    const cfg = { ...this._config };

    if (key === 'bays')        { cfg.bays = parseInt(val, 10) || 8; this._fire(cfg); return; }
    if (key === 'smart_ok_raw'){ cfg.smart_ok = val.split(',').map(v => v.trim()).filter(Boolean); this._fire(cfg); return; }

    const boolKeys = ['show_reboot','show_shutdown','show_usb','show_status','show_alert','show_temp','show_uptime'];
    if (boolKeys.includes(key)) { cfg[key] = val === 'true'; this._fire(cfg); return; }

    cfg[key] = val;
    this._fire(cfg);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  REGISTRATION
// ─────────────────────────────────────────────────────────────────────────────
customElements.define('managed-nas-card', ManagedNasCard);
customElements.define('managed-nas-card-editor', ManagedNasCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type:             'managed-nas-card',
  name:             'Managed NAS Card',
  description:      'Card universale per NAS in Home Assistant. Qualsiasi brand/modello, bay configurabili, LED SMART, USB, stato sicurezza, reboot e shutdown.',
  preview:          true,
  documentationURL: 'https://github.com/YOUR_USERNAME/managed-nas-card',
});
