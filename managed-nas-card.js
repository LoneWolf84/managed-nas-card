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
//  All values here are neutral starting points.
//  Suffixes, labels and option strings are configured per-user in the card
//  editor or via YAML — nothing here is specific to any brand or installation.
// ─────────────────────────────────────────────────────────────────────────────
const NAS_DEFAULTS = {
  // ── Header ───────────────────────────────────────────────────────────────
  title: 'NAS',
  model: '',              // shown as "Modello: X" — leave empty to hide

  // ── Entity bases — always empty; user fills via editor ───────────────────
  sensor_base: '',        // optional — set via editor or per-entity pickers
  binary_base: '',        // optional — set via editor or per-entity pickers

  // ── Bay configuration ─────────────────────────────────────────────────────
  bays:      1,           // blank canvas default; user sets actual bay count
  grid_cols: 'auto',      // 'auto' | 2 | 3 | 4 | 6 | 8
  bay_label: 'BAY',       // text under each bay: "BAY 1", "SLOT 1", "DRIVE 1"

  // ── input_select ──────────────────────────────────────────────────────────
  input_select:               '',
  input_select_none:          'None',    // the "no selection" option value — match your HA config
  bay_option_prefix:          'Bay ',    // prefix of option values — match your HA config

  // ── Action buttons ────────────────────────────────────────────────────────
  reboot_button:   '',
  shutdown_button: '',

  // ── Entity suffixes ───────────────────────────────────────────────────────
  // Generic placeholders — override in YAML to match your integration's naming.
  // {N} is replaced by the bay number at runtime.
  suffix_smart:       '_drive_{N}_smart_status',
  suffix_bad_sectors: '_drive_{N}_bad_sectors_exceeded',
  suffix_low_life:    '_drive_{N}_below_min_remaining_life',
  suffix_temp:        '_temperature',
  suffix_uptime:      '_last_boot',       // expects ISO timestamp
  suffix_safety:      '_system_safety',   // binary: on = unsafe

  // ── USB detection ─────────────────────────────────────────────────────────
  usb_prefix:     '',      // leave empty to hide USB widget; set e.g. 'sensor.mynas_usb'
  usb_safe_states: ['normal', 'unavailable', 'unknown'],

  // ── SMART ok values ───────────────────────────────────────────────────────
  smart_ok: ['normal'],   // add your integration's "healthy" status strings

  // ── Feature flags ─────────────────────────────────────────────────────────
  show_reboot:   true,
  show_shutdown: true,
  show_usb:      true,
  show_status:   true,
  show_alert:    true,
  show_temp:     true,
  show_uptime:   true,
  show_tooltip:  true,

  // ── Colors ────────────────────────────────────────────────────────────────
  color_bg:          '#1c1c1c',
  color_border:      '#333',
  color_text:        '#ffffff',
  color_accent:      '#007bff',
  color_info:        '#4a90e2',
  color_sep:         '#444',
  color_bay_bg:      '#222',
  color_bay_border:  '#444',
  color_bay_sub:     '#555',
  color_led_off:     '#333',
  color_led_ok:      '#00ff41',
  color_led_warn:    '#ff9800',
  color_led_error:   '#f44336',
  color_status_ok:   '#00ff41',
  color_status_warn: '#ff9800',

  // ── Labels — localise these in your YAML to match your language ───────────
  label_temp:             'Temp:',
  label_uptime:           'Uptime:',
  label_status:           'STATUS',
  label_alert:            'ALERT',
  label_confirm_reboot:   'Reboot?',
  label_confirm_shutdown: 'Shutdown?',
};

// ─────────────────────────────────────────────────────────────────────────────
//  CARD
// ─────────────────────────────────────────────────────────────────────────────
class ManagedNasCard extends HTMLElement {

  setConfig(config) {
    this._config = { ...NAS_DEFAULTS, ...config };
    this._config.bays = parseInt(this._config.bays, 10) || 8;
  }

  getCardSize() { return 3; }

  static getConfigElement() {
    return document.createElement('managed-nas-card-editor');
  }

  static getStubConfig() {
    // Minimal blank canvas — user fills everything via the card editor.
    // No bay count, no entity names, no language-specific strings.
    return {
      title:       'NAS',
      model:       '',
      bays:        1,
      grid_cols:   'auto',
      sensor_base: '',
      binary_base: '',
    };
  }

  // ── connectedCallback ─────────────────────────────────────────────────────
  // Original: reset server-side only if _hass already available.
  // Also resets _firstRender so next mount starts with a local "none" state.
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
    // First render of the session: force local selection to none
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

  // ── Entity resolution helpers ─────────────────────────────────────────────
  // Returns override entity if configured, else builds from base+suffix.
  // {N} in suffix is replaced with n (bay/port number).
  _ent(base, suffix, n) {
    const s = n !== undefined ? suffix.replace('{N}', n) : suffix;
    return base + s;
  }
  _entOr(overrideKey, base, suffix, n) {
    // Check per-bay/per-port override first, then fall back to base+suffix
    const ov = this._config[overrideKey];
    if (ov) return ov;
    if (!base) return null; // no base configured and no override → entity unknown
    return this._ent(base, suffix, n);
  }

  // ── _render ───────────────────────────────────────────────────────────────
  _render(hass) {
    const cfg      = this._config;
    const base     = cfg.sensor_base  || '';
    const bin      = cfg.binary_base  || '';
    const selected = this._selectedLocal;
    const st       = hass.states;

    // ── System readings — per-entity picker wins, then base+suffix, then blank
    const tempSysEnt = cfg.temp_sys || (base ? base + (cfg.suffix_temp_sys || cfg.suffix_temp) : null);
    const uptimeEnt  = cfg.uptime   || (base ? base + cfg.suffix_uptime : null);
    const safetyEnt  = cfg.safety   || (bin  ? bin  + cfg.suffix_safety  : null);

    const nasTemp = (tempSysEnt ? st[tempSysEnt]?.state : null) || '--';
    const uptime  = this._formatUptime(uptimeEnt ? st[uptimeEnt]?.state : null);

    // ── Alert scan — per-bay picker (bad_N, life_N) or base+suffix ────────
    let hasBadSectors = false;
    let hasLowLife    = false;
    for (let i = 1; i <= cfg.bays; i++) {
      const badEnt  = cfg[`bad_${i}`]  || (bin ? this._ent(bin, cfg.suffix_bad_sectors, i) : null);
      const lifeEnt = cfg[`life_${i}`] || (bin ? this._ent(bin, cfg.suffix_low_life, i)    : null);
      if (badEnt  && st[badEnt]?.state  === 'on') hasBadSectors = true;
      if (lifeEnt && st[lifeEnt]?.state === 'on') hasLowLife    = true;
    }

    // Alert color — original exact logic
    let alertColor = cfg.color_led_off;
    let alertBlink = false;
    if (hasBadSectors)   { alertColor = cfg.color_led_error; alertBlink = true; }
    else if (hasLowLife) { alertColor = cfg.color_led_warn;  alertBlink = true; }

    // ── USB detection — individual entities (usb_entity_N) or legacy prefix ─
    const usbCount    = parseInt(cfg.usb_sensor_count, 10) || 0;
    const usbEntities = Array.from({length: usbCount}, (_, i) =>
      cfg[`usb_entity_${i+1}`]).filter(Boolean);
    const usbPrefix   = cfg.usb_prefix || '';
    const allEntities = Object.keys(st);

    const usbConnectedFinal = usbEntities.length > 0
      ? usbEntities.some(id => st[id])
      : (usbPrefix ? allEntities.some(id => id.startsWith(usbPrefix)) : false);
    const usbWarningFinal = usbEntities.length > 0
      ? usbEntities.some(id => st[id] && !cfg.usb_safe_states.includes(st[id]?.state))
      : (usbPrefix ? allEntities.some(id =>
          id.startsWith(usbPrefix) && id.endsWith('_status') &&
          !cfg.usb_safe_states.includes(st[id]?.state)) : false);

    // ── Safety / Status ───────────────────────────────────────────────────
    const isUnsafe    = safetyEnt ? st[safetyEnt]?.state === 'on' : false;
    const statusColor = isUnsafe ? cfg.color_status_warn : cfg.color_status_ok;

    // ── Bay grid columns ──────────────────────────────────────────────────
    const cols = cfg.grid_cols === 'auto' || cfg.grid_cols === 0
      ? Math.ceil(cfg.bays / 2)
      : parseInt(cfg.grid_cols, 10) || Math.ceil(cfg.bays / 2);

    // ── Bay HTML ──────────────────────────────────────────────────────────
    let baysHtml = '';
    for (let i = 1; i <= cfg.bays; i++) {
      // Override entity wins; fall back to base+suffix if base is set
      const smartEnt = cfg[`smart_${i}`] || (base ? this._ent(base, cfg.suffix_smart, i) : null);
      const lifeEnt  = cfg[`life_${i}`]  || (bin  ? this._ent(bin,  cfg.suffix_low_life, i) : null);
      const badEnt   = cfg[`bad_${i}`]   || (bin  ? this._ent(bin,  cfg.suffix_bad_sectors, i) : null);
      const tempEnt  = cfg[`temp_${i}`]  || (base ? this._ent(base, cfg.suffix_temp, i) : null);

      const smartStatus = smartEnt ? st[smartEnt]?.state : undefined;
      const lowLife      = lifeEnt ? st[lifeEnt]?.state === 'on' : false;
      const badSectors   = badEnt  ? st[badEnt]?.state  === 'on' : false;
      const diskTemp     = tempEnt ? st[tempEnt]?.state : null;
      const isSelected   = selected === cfg.bay_option_prefix + i;

      // LED color — original exact logic
      let ledColor = cfg.color_led_off;
      if (smartStatus && !['unavailable', 'unknown'].includes(smartStatus)) {
        if (cfg.smart_ok.includes(smartStatus)) {
          ledColor = lowLife ? cfg.color_led_warn : cfg.color_led_ok;
        } else {
          ledColor = cfg.color_led_error;
        }
      }

      const ledShadow = ledColor !== cfg.color_led_off ? `0 0 5px ${ledColor}` : 'none';

      // Tooltip data: bay number, smart status, disk temp, bad sectors, low life
      const tipData = cfg.show_tooltip
        ? `data-tip="${i}|${smartStatus || ''}|${diskTemp || ''}|${badSectors}|${lowLife}"`
        : '';

      baysHtml += `
        <div class="selectable-item" data-value="${cfg.bay_option_prefix}${i}" ${tipData}>
          <div class="bay-handle${isSelected ? ' selected' : ''}">
            <div class="bay-led" style="background:${ledColor}; box-shadow:${ledShadow}"></div>
            <div class="lock-icon"></div>
          </div>
          <div class="bay-sub">${cfg.bay_label} ${i}</div>
        </div>`;
    }

    // ── USB widget ────────────────────────────────────────────────────────
    const hasUsb = usbEntities.length > 0 || !!usbPrefix;
    const usbHtml = (cfg.show_usb && hasUsb) ? `
      <div class="usb-container selectable-item" data-value="USB">
        <ha-icon class="usb-icon${usbWarningFinal ? ' blink' : ''}" icon="mdi:harddisk"
                 style="color:${selected === 'USB'
                   ? cfg.color_accent
                   : (usbConnectedFinal ? (usbWarningFinal ? cfg.color_led_warn : cfg.color_led_ok) : cfg.color_led_off)};"></ha-icon>
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
        ${(cfg.show_usb && (usbEntities.length > 0 || cfg.usb_prefix)) ? '.usb-container { cursor:pointer; }' : ''}
        .blink { animation:blinker 1.5s linear infinite; }
        @keyframes blinker { 50% { opacity:0.2; } }
        .drive-grid { display:grid; grid-template-columns:repeat(${cols},minmax(0,1fr)); gap:10px 8px; }
        .bay-handle { height:50px; background:${cfg.color_bay_bg}; border:1px solid ${cfg.color_bay_border}; border-radius:3px; display:flex; align-items:center; justify-content:space-around; padding:0 5px; transition:0.2s; cursor:pointer; }
        .bay-handle.selected { border-color:${cfg.color_accent}; background:#2d2d2d; box-shadow:0 0 8px ${cfg.color_accent}55; }
        .bay-led { width:4px; height:18px; }
        .lock-icon { width:8px; height:8px; border-radius:50%; border:1px solid ${cfg.color_bay_border}; background:#111; }
        .bay-sub { font-size:11px; color:${cfg.color_bay_sub}; text-align:center; margin-top:6px; font-weight:bold; letter-spacing:0.5px; }

        /* ── Bay hover tooltip ──────────────────────────────────────────── */
        .nas-tip {
          position: fixed; z-index: 9999;
          background: #2a2a2a; border: 1px solid #444;
          border-radius: 8px; padding: 10px 14px;
          font-size: 12px; color: #fff; pointer-events: none;
          min-width: 155px; box-shadow: 0 4px 18px rgba(0,0,0,0.4);
          line-height: 1.65; font-family: Arial, sans-serif;
        }
        .nas-tip .nt-title { font-weight: bold; font-size: 13px; color: ${cfg.color_accent}; margin-bottom: 5px; }
        .nas-tip .nt-row { display: flex; justify-content: space-between; gap: 10px; }
        .nas-tip .nt-lbl { color: #888; }
        .nas-tip .nt-val { font-weight: bold; }
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

    // Bay hover tooltip listeners (only elements with data-tip — i.e. bays)
    this.content.querySelectorAll('[data-tip]').forEach(el => {
      el.onmouseenter = (e) => this._onBayEnter(e, el);
      el.onmouseleave = () => this._onBayLeave();
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

  // ── Bay tooltip — hover shows temperature, SMART status, alerts ───────────
  _onBayEnter(event, el) {
    if (!this._config.show_tooltip) return;
    const raw = el.getAttribute('data-tip');
    if (!raw) return;
    const [i, smartStatus, diskTemp, badSectors, lowLife] = raw.split('|');
    const cfg = this._config;

    const existing = this.content.querySelector('.nas-tip');
    if (existing) existing.remove();

    const smartHtml = smartStatus
      ? (cfg.smart_ok.includes(smartStatus)
          ? `<span style="color:${cfg.color_led_ok}">● ${smartStatus}</span>`
          : `<span style="color:${cfg.color_led_error}">● ${smartStatus}</span>`)
      : `<span style="color:#555">○ N/D</span>`;

    const tempRow = diskTemp
      ? `<div class="nt-row"><span class="nt-lbl">🌡 Temp</span><span class="nt-val">${diskTemp}°C</span></div>`
      : '';
    const badRow = badSectors === 'true'
      ? `<div class="nt-row"><span class="nt-lbl">⚠ Settori</span><span class="nt-val" style="color:${cfg.color_led_error}">Danneggiati</span></div>`
      : '';
    const lifeRow = lowLife === 'true'
      ? `<div class="nt-row"><span class="nt-lbl">⚠ Vita</span><span class="nt-val" style="color:${cfg.color_led_warn}">Residua bassa</span></div>`
      : '';

    const tip = document.createElement('div');
    tip.className = 'nas-tip';
    tip.innerHTML = `
      <div class="nt-title">${cfg.bay_label} ${i}</div>
      <div class="nt-row"><span class="nt-lbl">SMART</span><span class="nt-val">${smartHtml}</span></div>
      ${tempRow}${badRow}${lifeRow}`;

    this.content.appendChild(tip);

    let x = event.clientX + 14;
    let y = event.clientY + 14;
    if (x + 175 > window.innerWidth)  x = event.clientX - 175;
    if (y + 130 > window.innerHeight) y = event.clientY - 130;
    tip.style.left = x + 'px';
    tip.style.top  = y + 'px';
    this._tooltip = tip;
  }

  _onBayLeave() {
    if (this._tooltip) { this._tooltip.remove(); this._tooltip = null; }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  VISUAL EDITOR
// ─────────────────────────────────────────────────────────────────────────────
class ManagedNasCardEditor extends HTMLElement {

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._step = 1; // 1=struttura, 2=sensori bay, 3=sistema+opzioni
  }

  setConfig(config) {
    this._config = { ...NAS_DEFAULTS, ...config };
    if ((this._config.bays > 1 || Object.keys(config).length > 2) && this._step === 1) this._step = 2;
    this._render();
  }

  set hass(h) {
    this._hass = h;
    if (this.shadowRoot) {
      this.shadowRoot.querySelectorAll('ha-entity-picker').forEach(p => p.hass = h);
      // Attach any pending pickers that were waiting for hass
      this._attachPickers();
    }
  }

  _fire(cfg) {
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: cfg }, bubbles: true, composed: true,
    }));
  }

  _goStep(n) { this._step = n; this._render(); }

  // ── CSS ───────────────────────────────────────────────────────────────────
  _css() {
    return `<style>
      :host { display:block; font-family:Arial,sans-serif; font-size:13px; color:#eee; }
      .steps { display:flex; gap:0; margin-bottom:18px; border-radius:8px; overflow:hidden; }
      .step-btn {
        flex:1; padding:8px 4px; text-align:center; font-size:11px; font-weight:bold;
        text-transform:uppercase; letter-spacing:.5px; cursor:pointer; border:none;
        background:#1e1e1e; color:#555; transition:.2s; border-right:1px solid #333;
      }
      .step-btn:last-child { border-right:none; }
      .step-btn.active { background:#007bff; color:#fff; }
      .step-btn.done   { background:#0a1f0a; color:#00ff41; }
      h4 { margin:16px 0 8px; font-size:11px; text-transform:uppercase; letter-spacing:.6px;
            color:#007bff; border-top:1px solid #2a2a2a; padding-top:12px; }
      h4.first, h4:first-child { border-top:none; margin-top:0; }
      .row { margin-bottom:10px; }
      label { display:block; font-size:11px; color:#888; margin-bottom:3px; }
      input, select {
        width:100%; padding:6px 8px; border-radius:6px; border:1px solid #444;
        background:#1a1a1a; color:#fff; font-size:13px; box-sizing:border-box;
      }
      small { display:block; font-size:10px; color:#555; margin-top:3px; }
      .picker-row { margin-bottom:12px; }
      .picker-row label { margin-bottom:4px; }
      ha-entity-picker { display:block; }
      details { margin:6px 0 10px; }
      summary { font-size:11px; color:#007bff; cursor:pointer; user-select:none; margin-bottom:8px; }
      .nav { display:flex; gap:8px; margin-top:16px; }
      .nav-btn { flex:1; padding:8px; border-radius:6px; border:none; cursor:pointer; font-size:13px; font-weight:bold; }
      .nav-btn.prev { background:#2a2a2a; color:#aaa; }
      .nav-btn.next { background:#007bff; color:#fff; }
      .color-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
      .color-row { display:flex; align-items:center; gap:8px; }
      .color-row label { flex:1; margin:0; }
      .color-row input[type=color] { width:36px; height:28px; padding:2px; border-radius:4px; flex-shrink:0; }
      .toggle-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
      .toggle-row label { margin:0; }
      .toggle-row select { width:auto; }
      .hint { font-size:11px; color:#555; margin:0 0 12px; line-height:1.5; }
      code { background:#222; padding:1px 5px; border-radius:3px; font-size:10px; }
    </style>`;
  }

  _stepBar() {
    const c = this._config;
    const done1 = !!(c.bays > 0 || c.bay_label);
    const labels = ['1 · Struttura', '2 · Sensori bay', '3 · Sistema & Opzioni'];
    return `<div class="steps">` + labels.map((l, i) => {
      const n = i + 1;
      const cls = this._step === n ? 'active' : (n < this._step || (n === 1 && done1) ? 'done' : '');
      return `<button class="step-btn ${cls}" onclick="this.getRootNode().host._goStep(${n})">${l}</button>`;
    }).join('') + `</div>`;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  _picker(label, key, domain, hint) {
    // Placeholder div — real ha-entity-picker is created in _attachPickers()
    return `<div class="picker-row" data-picker-key="${key}" data-picker-domain="${domain||''}" data-picker-hint="${hint||''}">
      <label>${label}</label>
      <div class="picker-slot" id="picker-${key}"></div>
      ${hint ? `<small>${hint}</small>` : ''}
    </div>`;
  }

  _attachPickers() {
    if (!this.shadowRoot) return;
    this.shadowRoot.querySelectorAll('[data-picker-key]').forEach(row => {
      const key    = row.dataset.pickerKey;
      const domain = row.dataset.pickerDomain;
      const slot   = row.querySelector('.picker-slot');
      if (!slot || slot.querySelector('ha-entity-picker')) return;

      const picker = document.createElement('ha-entity-picker');
      picker.setAttribute('allow-custom-entity', '');
      if (domain) picker.includeDomains = [domain];
      if (this._hass) picker.hass = this._hass;
      const current = this._config?.[key] || '';
      if (current) picker.value = current;

      picker.addEventListener('value-changed', (e) => {
        const val = e.detail?.value ?? '';
        if (val === (this._config?.[key] || '')) return;
        this._config = { ...this._config, [key]: val };
        this._fire(this._config);
        picker.value = val;
      });

      slot.appendChild(picker);
    });
  }

  _input(label, key, type = 'text', hint = '') {
    const v = String(this._config?.[key] ?? '');
    return `<div class="row"><label>${label}</label>
      <input type="${type}" value="${v.replace(/"/g,'&quot;')}" data-key="${key}"
             onchange="this.getRootNode().host._inputChange(event)"/>
      ${hint ? `<small>${hint}</small>` : ''}</div>`;
  }

  _sel(label, key, opts) {
    const cur = String(this._config?.[key] ?? opts[0].v);
    const os = opts.map(o => `<option value="${o.v}"${cur===String(o.v)?' selected':''}>${o.l}</option>`).join('');
    return `<div class="row"><label>${label}</label>
      <select data-key="${key}" onchange="this.getRootNode().host._inputChange(event)">${os}</select></div>`;
  }

  _color(label, key) {
    const v = this._config?.[key] || '#000000';
    return `<div class="color-row">
      <label>${label}</label>
      <input type="color" value="${v}" data-key="${key}" onchange="this.getRootNode().host._inputChange(event)"/>
    </div>`;
  }

  _toggle(label, key) {
    const v = String(this._config?.[key] ?? 'true');
    return `<div class="toggle-row">
      <label>${label}</label>
      <select data-key="${key}" onchange="this.getRootNode().host._inputChange(event)" style="width:auto">
        <option value="true"${v==='true'?' selected':''}>Sì</option>
        <option value="false"${v==='false'?' selected':''}>No</option>
      </select>
    </div>`;
  }

  // ── STEP 1: Struttura ─────────────────────────────────────────────────────
  _renderStep1() {
    return `${this._css()}<div style="padding:16px">
      ${this._stepBar()}

      <h4 class="first">Dispositivo</h4>
      ${this._input('Titolo (logo)', 'title')}
      ${this._input('Modello', 'model', 'text', 'es. RS1221+, TS-464 — lascia vuoto per nascondere')}

      <h4>Bay drive</h4>
      ${this._input('Numero bay', 'bays', 'number')}
      ${this._sel('Colonne griglia', 'grid_cols', [
        {v:'auto', l:'Auto — ceil(bay/2) colonne per riga'},
        {v:'2',    l:'2 colonne (stack verticale)'},
        {v:'3',    l:'3 colonne'},
        {v:'4',    l:'4 colonne'},
        {v:'6',    l:'6 colonne'},
        {v:'8',    l:'8 colonne (riga singola)'},
      ])}
      ${this._input('Etichetta bay', 'bay_label', 'text', 'es. BAY · SLOT · DRIVE')}

      <h4>Input select bay</h4>
      <p style="font-size:11px;color:#888;margin:0 0 10px">
        Deve corrispondere esattamente alle opzioni del tuo input_select in HA.<br>
        Prefisso opzione: es. <b>Baia </b> → genera "Baia 1", "Baia 2" (includi lo spazio finale).<br>
        Valore nessuna: es. <b>Nessuna</b> → valore quando nessuna bay è selezionata.
      </p>
      ${this._input('Prefisso opzione bay', 'bay_option_prefix', 'text', 'es. Baia  (con spazio finale)')}
      ${this._input('Valore nessuna selezione', 'input_select_none', 'text', 'es. Nessuna')}

      <div class="nav">
        <button class="nav-btn next" onclick="this.getRootNode().host._goStep(2)">Avanti → Sensori bay →</button>
      </div>
    </div>`;
  }

  // ── STEP 2: Sensori bay ───────────────────────────────────────────────────
  _renderStep2() {
    const c    = this._config;
    const bays = parseInt(c.bays, 10) || 1;
    const lbl  = c.bay_label || 'BAY';

    // Bay pickers — one collapsible section per bay
    const bayPickersHtml = Array.from({length: bays}, (_, i) => i + 1).map(n => `
      <details>
        <summary>${lbl} ${n}</summary>
        ${this._picker(`SMART status`, `smart_${n}`, 'sensor',
            'Stato intelligente del disco — es. normal, attention')}
        ${this._picker(`Settori danneggiati`, `bad_${n}`, 'binary_sensor',
            'Binary: on = settori danneggiati rilevati')}
        ${this._picker(`Vita residua bassa`, `life_${n}`, 'binary_sensor',
            'Binary: on = vita residua sotto soglia minima')}
        ${this._picker(`Temperatura`, `temp_${n}`, 'sensor',
            'Temperatura del disco in °C')}
      </details>`).join('');

    // USB — numero dinamico di sensori
    const usbCount = parseInt(c.usb_sensor_count, 10) || 0;
    const usbPickersHtml = usbCount > 0
      ? Array.from({length: usbCount}, (_, i) => i + 1).map(n => `
          ${this._picker(`Sensore USB ${n}`, `usb_entity_${n}`, 'sensor',
              'es. sensor.mynas_usb_disk_1_status')}`).join('')
      : `<p style="font-size:11px;color:#555;margin:4px 0">
           Imposta il numero di sensori USB sopra per aggiungere i picker.
         </p>`;

    return `${this._css()}<div style="padding:16px">
      ${this._stepBar()}

      <h4 class="first">Sensori per ogni bay</h4>
      <p class="hint">
        Seleziona i sensori di ogni bay. Se usi i <b>sensori base</b> (step successivo)
        puoi lasciare vuoto quello che segue il pattern automatico.
      </p>
      ${bayPickersHtml}

      <h4>Sensori sistema NAS</h4>
      ${this._picker('Temperatura NAS', 'temp_sys', 'sensor',
          'Temperatura generale del NAS')}
      ${this._picker('Ultimo avvio', 'uptime', 'sensor',
          "Timestamp ISO dell'ultimo avvio — usato per calcolare l'uptime")}
      ${this._picker('Stato sicurezza', 'safety', 'binary_sensor',
          'Binary: on = sistema in stato non sicuro')}

      <h4>Disco esterno USB</h4>
      <p class="hint">
        Hai un disco esterno collegato via USB? Inserisci quanti sensori espone il tuo NAS
        per quel dispositivo, poi seleziona ogni entità.
      </p>
      ${this._input('Numero sensori USB (0 = nessuno)', 'usb_sensor_count', 'number')}
      ${usbPickersHtml}

      <h4>Azioni</h4>
      ${this._picker('Input select selezione bay', 'input_select', 'input_select')}
      ${this._picker('Pulsante reboot', 'reboot_button', 'button')}
      ${this._picker('Pulsante shutdown', 'shutdown_button', 'button')}

      <h4>Sensori base (opzionale)</h4>
      <p class="hint">
        Se tutti i tuoi sensori seguono un pattern comune, inserisci il prefisso qui
        e la card li configurerà in automatico. Lascia vuoto se hai già selezionato
        tutto manualmente sopra.
      </p>
      ${this._input('Prefisso sensori (sensor base)', 'sensor_base', 'text',
          'es. sensor.mynas → genera sensor.mynas_temperatura, sensor.mynas_drive_1_temperatura...')}
      ${this._input('Prefisso binary sensori (binary base)', 'binary_base', 'text',
          'es. binary_sensor.mynas')}

      <div class="nav">
        <button class="nav-btn prev" onclick="this.getRootNode().host._goStep(1)">← Struttura</button>
        <button class="nav-btn next" onclick="this.getRootNode().host._goStep(3)">→ Suffissi & Opzioni</button>
      </div>
    </div>`;
  }

  // ── STEP 3: Sensori base & Opzioni ────────────────────────────────────────
  _renderStep3() {
    return `${this._css()}<div style="padding:16px">
      ${this._stepBar()}

      <h4 class="first">Sensori base (opzionale)</h4>
      <p class="hint">
        Se tutti i tuoi sensori seguono un pattern comune, inserisci il prefisso e configura
        i suffissi sotto. Lascia vuoto se hai già configurato ogni bay singolarmente nello step 2.
      </p>
      ${this._input('Sensor base', 'sensor_base', 'text', 'es. sensor.mynas')}
      ${this._input('Binary sensor base', 'binary_base', 'text', 'es. binary_sensor.mynas')}

      <details open>
        <summary>⚙ Suffissi entità</summary>
        ${this._input('SMART status ({N})',        'suffix_smart')}
        ${this._input('Settori danneggiati ({N})', 'suffix_bad_sectors')}
        ${this._input('Vita residua bassa ({N})',  'suffix_low_life')}
        ${this._input('Temperatura bay ({N})',     'suffix_temp')}
        ${this._input('Temperatura NAS sistema',  'suffix_temp_sys',  'text', 'es. _temperatura')}
        ${this._input('Ultimo avvio',             'suffix_uptime')}
        ${this._input('Stato sicurezza',          'suffix_safety')}
      </details>

      <h4>Valori SMART OK</h4>
      ${this._input('Valori OK (virgola)', 'smart_ok_raw', 'text',
          'es. normal,Ottimo,Good — stati SMART considerati sani')}

      <h4>Funzionalità</h4>
      ${this._toggle('Pulsante reboot',   'show_reboot')}
      ${this._toggle('Pulsante shutdown', 'show_shutdown')}
      ${this._toggle('Widget USB',        'show_usb')}
      ${this._toggle('Dot STATUS',        'show_status')}
      ${this._toggle('Dot ALERT',         'show_alert')}
      ${this._toggle('Temperatura',       'show_temp')}
      ${this._toggle('Uptime',            'show_uptime')}
      ${this._toggle('Tooltip hover bay',  'show_tooltip')}

      <details>
        <summary>⚙ Testi personalizzati</summary>
        ${this._input('Etichetta Temp',       'label_temp')}
        ${this._input('Etichetta Avvio',      'label_uptime')}
        ${this._input('Etichetta STATUS',     'label_status')}
        ${this._input('Etichetta ALERT',      'label_alert')}
        ${this._input('Conferma reboot',      'label_confirm_reboot')}
        ${this._input('Conferma shutdown',    'label_confirm_shutdown')}
      </details>

      <h4>Colori</h4>
      <div class="color-grid">
        ${this._color('Sfondo card',   'color_bg')}
        ${this._color('Bordo card',    'color_border')}
        ${this._color('Testo',         'color_text')}
        ${this._color('Accento',       'color_accent')}
        ${this._color('Info subtitle', 'color_info')}
        ${this._color('Sfondo bay',    'color_bay_bg')}
        ${this._color('Bordo bay',     'color_bay_border')}
        ${this._color('Etichetta bay', 'color_bay_sub')}
        ${this._color('LED spento',    'color_led_off')}
        ${this._color('LED OK',        'color_led_ok')}
        ${this._color('LED warning',   'color_led_warn')}
        ${this._color('LED errore',    'color_led_error')}
      </div>

      <div class="nav">
        <button class="nav-btn prev" onclick="this.getRootNode().host._goStep(2)">← Sensori bay</button>
      </div>
    </div>`;
  }

  // ── Main render ───────────────────────────────────────────────────────────
  _render() {
    if (!this.shadowRoot) return;
    // Save which <details> are currently open (by their summary text)
    const openSummaries = new Set();
    this.shadowRoot.querySelectorAll('details[open] > summary').forEach(s => {
      openSummaries.add(s.textContent.trim());
    });

    this.shadowRoot.innerHTML =
      this._step === 1 ? this._renderStep1() :
      this._step === 2 ? this._renderStep2() :
                         this._renderStep3();

    // Restore open state
    if (openSummaries.size > 0) {
      this.shadowRoot.querySelectorAll('details > summary').forEach(s => {
        if (openSummaries.has(s.textContent.trim())) {
          s.parentElement.setAttribute('open', '');
        }
      });
    }

    requestAnimationFrame(() => this._attachPickers());
  }

  // ── Change handlers ───────────────────────────────────────────────────────
  // Picker changes are handled inline in _attachPickers() per picker.


  _inputChange(e) {
    const key = e.target.dataset.key;
    const val = e.target.value;
    const cfg = { ...this._config };

    if (key === 'bays') { cfg.bays = parseInt(val,10)||1; this._config=cfg; this._fire(cfg); return; }
    if (key === 'usb_sensor_count') {
      cfg.usb_sensor_count = parseInt(val,10)||0;
      this._config=cfg; this._fire(cfg);
      // Re-render step to show/hide USB pickers dynamically
      this._render(); return;
    }
    if (key === 'smart_ok_raw') {
      cfg.smart_ok = val.split(',').map(v=>v.trim()).filter(Boolean);
      this._config=cfg; this._fire(cfg); return;
    }
    const bools = ['show_reboot','show_shutdown','show_usb','show_status','show_alert','show_temp','show_uptime'];
    if (bools.includes(key)) { cfg[key] = val==='true'; this._config=cfg; this._fire(cfg); return; }
    cfg[key] = val;
    this._config = cfg;
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
