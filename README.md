# 🖥️ Managed NAS Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![GitHub release](https://img.shields.io/github/v/release/YOUR_USERNAME/managed-nas-card)](https://github.com/YOUR_USERNAME/managed-nas-card/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Universal Lovelace card for NAS devices in Home Assistant.
Works with any brand and model — all entity names configured privately via the card editor.

---

## ✨ Features

### managed-nas-card (main card)

| | |
|---|---|
| **Drive bays** | SMART LED per bay (green/orange/red), configurable grid |
| **Any bay count** | 4, 6, 8, 12, 16 or any number |
| **Grid layout** | 2 / 4 / 6 / 8 columns or auto |
| **Bay label** | `BAY`, `SLOT`, `DRIVE` or custom text |
| **Alert scan** | Bad sectors + remaining life across all drives — ALERT dot blinks |
| **USB detection** | Detects USB devices, blinks on warning |
| **STATUS dot** | System safety state — blinks when unsafe |
| **ALERT dot** | Aggregated drive alert |
| **Temp + Uptime** | Shown in header |
| **Reboot + Shutdown** | With confirm dialog |
| **Bay selection** | Click updates `input_select` for detail card |
| **3-step visual editor** | No YAML required |

### managed-nas-detail-card (companion card)

Appears **only when a selection is active** — disappears automatically.

| Selection | Content |
|---|---|
| **Bay N** | Volume space (donut chart) · Disk temperature (historical graph) · Volume state |
| **Status** | RAM · SWAP · CPU usage · CPU load · Cache · Network speed |
| **Alert** | Binary sensor grid: bad sectors + remaining life per drive |
| **USB** | (reserved for future extension) |
| **(none)** | Hidden — no space taken |

---

## 📦 Installation

### Via HACS (recommended)

1. HACS → **Frontend** → `⋮` → **Custom repositories**
2. URL: `https://github.com/YOUR_USERNAME/managed-nas-card` — Category: **Lovelace**
3. Install and reload browser

### Manual

1. Download `managed-nas-card.js` and `managed-nas-detail-card.js` from the [latest release](https://github.com/YOUR_USERNAME/managed-nas-card/releases/latest)
2. Copy to `config/www/`
3. HA → **Settings → Dashboard → Resources**:
   ```
   /local/managed-nas-card.js        → JavaScript Module
   /local/managed-nas-detail-card.js → JavaScript Module
   ```

---

## ⚙️ Configuration

All configuration is done **privately inside Home Assistant** through the card's visual editor.
No sensitive data (entity names, device names, IP addresses) is stored in any public file.

### Adding the main card

1. Edit your dashboard → **Add card** → search **Managed NAS Card**
2. The editor opens with 3 steps:
   - **Step 1 · Structure** — title, model, bay count, grid columns, bay label
   - **Step 2 · Bay sensors** — select entity bases (prefix extracted automatically), actions (input select, reboot, shutdown), USB prefix, per-bay overrides
   - **Step 3 · System & Options** — system sensors, SMART OK values, feature toggles, colors, advanced suffixes

### Adding the detail card

1. **Add card** → search **Managed NAS Detail Card**
2. Configure via its editor: set the same `input_select` entity as the main card, then set entity bases and bay count

### Entity patterns expected

The card builds entity names as `{sensor_base}{suffix}` and `{binary_base}{suffix}`.
All suffixes are configurable in Step 3 → Advanced.

Default suffix patterns:
```
# Per bay N (1..bays):
sensor.{sensor_base}_drive_N_stato_intelligente
binary_sensor.{binary_base}_drive_N_superato_il_numero_massimo_di_settori_danneggiati
binary_sensor.{binary_base}_drive_N_al_di_sotto_della_vita_residua_minima
sensor.{sensor_base}_drive_N_temperatura

# System:
sensor.{sensor_base}_temperatura
sensor.{sensor_base}_ultimo_avvio
binary_sensor.{binary_base}_stato_di_sicurezza

# USB (prefix match — detects all entities starting with usb_prefix):
sensor.{usb_prefix}*
sensor.{usb_prefix}*_status

# Detail card — volume per bay N:
sensor.{sensor_base}_volume_N_spazio_utilizzato
sensor.{sensor_base}_volume_N_spazio_libero (calculated if empty)
sensor.{sensor_base}_volume_N_stato

# Detail card — system status:
sensor.{sensor_base}_utilizzo_della_memoria_reale
sensor.{sensor_base}_memoria_disponibile_reale
sensor.{sensor_base}_memoria_disponibile_scambio
sensor.{sensor_base}_utilizzo_della_cpu_totale
sensor.{sensor_base}_carico_medio_della_cpu_1_min
sensor.{sensor_base}_velocita_di_caricamento
sensor.{sensor_base}_velocita_di_scaricamento
```

---

## 🗂️ Repository structure

```
managed-nas-card/
├── managed-nas-card.js           ← main card
├── managed-nas-detail-card.js    ← companion detail card
├── hacs.json
├── info.md
├── README.md
├── LICENSE
├── .gitignore
└── .github/
    ├── workflows/release.yml
    └── ISSUE_TEMPLATE/
```

---

## 📋 Changelog

### v1.0.0
- Universal card — any NAS brand/model
- 3-step visual editor with `ha-entity-picker`
- Auto-extraction of entity base prefix from selected entity
- Configurable bay grid (columns, label, count)
- Detail card: volume donut, temperature graph, system dashboard, alert grid
- No personal data in public files

---

## 📄 License

MIT — see [LICENSE](LICENSE)
