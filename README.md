# 🖥️ Managed NAS Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![GitHub release](https://img.shields.io/github/v/release/YOUR_USERNAME/managed-nas-card)](https://github.com/YOUR_USERNAME/managed-nas-card/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Card Lovelace universale per NAS in Home Assistant.  
Funziona con **qualsiasi brand e modello** — basta avere le entità giuste in HA.

---

## ✨ Funzionalità

### managed-nas-card (card principale)

| | |
|---|---|
| **Bay drive** | LED SMART per stato disco (verde/arancio/rosso), griglia configurabile (2/4/6/8 colonne) |
| **N bay configurabili** | 4, 6, 8, 12, 16 o qualsiasi numero |
| **Etichetta bay** | `BAY`, `SLOT`, `DRIVE` o testo libero |
| **Alert scan** | Controlla settori danneggiati e vita residua su tutti i dischi — dot ALERT lampeggia |
| **USB detection** | Rileva dispositivi USB collegati, lampeggia in caso di warning |
| **Dot STATUS** | Stato sicurezza sistema (verde = ok, arancio = unsafe, lampeggia) |
| **Dot ALERT** | Alert aggregato dischi (verde = ok, arancio/rosso = problema, lampeggia) |
| **Temperatura + Uptime** | Mostrati nell'header, configurabili |
| **Reboot + Shutdown** | Con confirm dialog, via entità `button` |
| **Selezione bay** | Click aggiorna `input_select` per mostrare dettaglio nella companion card |
| **Tutti i colori configurabili** | Sfondo, porte, LED, accento |
| **Editor visivo Lovelace** | Zero YAML necessario |

### managed-nas-detail-card (companion card)

Appare **solo quando una selezione è attiva** — scompare automaticamente.

| Selezione | Contenuto |
|---|---|
| **Bay N** | Spazio Volume (donut chart usato/libero) · Temperatura disco (grafico storico) · Stato Volume |
| **Status** | RAM · SWAP · CPU utilizzo (multi-linea) · CPU carico (3 valori) · Cache · Velocità rete |
| **Alert** | Griglia binary sensor: settori danneggiati + vita residua per ogni disco |

---

## 📦 Installazione

### Via HACS (consigliato)

1. HACS → **Frontend** → `⋮` → **Repository personalizzati**
2. URL: `https://github.com/YOUR_USERNAME/managed-nas-card` — Categoria: **Lovelace**
3. Installa e ricarica il browser

### Manuale

1. Scarica `managed-nas-card.js` e `managed-nas-detail-card.js` dall'[ultima release](https://github.com/YOUR_USERNAME/managed-nas-card/releases/latest)
2. Copiali entrambi in `config/www/`
3. HA → **Impostazioni → Dashboard → Risorse** — aggiungi entrambi:

   | URL | Tipo |
   |-----|------|
   | `/local/managed-nas-card.js` | JavaScript Module |
   | `/local/managed-nas-detail-card.js` | JavaScript Module |

4. Ricarica la pagina

> **Via HACS** i file vengono copiati in `www/community/managed-nas-card/` e i percorsi diventano `/hacsfiles/managed-nas-card/managed-nas-card.js` — gestiti in automatico.

---

## ⚙️ Configurazione

### input_select (configuration.yaml)

```yaml
input_select:
  nas_selected_bay:
    name: "Selettore Bay NAS"
    options:
      - Nessuna
      - Baia 1
      - Baia 2
      - Baia 3
      - Baia 4
      - Baia 5
      - Baia 6
      - Baia 7
      - Baia 8
      - Status
      - Alert
      - USB
    icon: mdi:nas
```

---

### managed-nas-card — configurazione minima

```yaml
type: custom:managed-nas-card
sensor_base: sensor.mynas
binary_base: binary_sensor.mynas
```

### managed-nas-card — configurazione completa

```yaml
type: custom:managed-nas-card

# Header
title: NAS             # logo testuale in alto a sinistra
model: MyNAS-8Bay      # riga "Modello: X" — lascia vuoto per nascondere

# Bay
bays: 8                # numero totale bay
grid_cols: auto        # auto | 2 | 4 | 6 | 8 (auto = ceil(bays/2))
bay_label: BAY         # etichetta sotto ogni bay: BAY 1, SLOT 1, DRIVE 1...

# Entità
sensor_base: sensor.mynas
binary_base: binary_sensor.mynas
input_select: input_select.nas_selected_bay
reboot_button:   button.mynas_reboot
shutdown_button: button.mynas_shutdown

# Prefissi/opzioni selezione
bay_option_prefix: "Baia "     # deve corrispondere alle opzioni dell'input_select
input_select_none: Nessuna

# USB — lascia usb_prefix vuoto per nascondere il widget
usb_prefix: sensor.mynas_usb_disk

# Suffissi entità bay ({N} = numero bay)
suffix_smart:       _drive_{N}_stato_intelligente
suffix_bad_sectors: _drive_{N}_superato_il_numero_massimo_di_settori_danneggiati
suffix_low_life:    _drive_{N}_al_di_sotto_della_vita_residua_minima
suffix_temp:        _temperatura
suffix_uptime:      _ultimo_avvio
suffix_safety:      _stato_di_sicurezza

# Valori SMART considerati OK (lista)
smart_ok:
  - normal
  - Ottimo

# Funzionalità
show_reboot:   true
show_shutdown: true
show_usb:      true
show_status:   true
show_alert:    true
show_temp:     true
show_uptime:   true

# Colori (tutti opzionali — default = originale)
color_bg:         "#1c1c1c"
color_border:     "#333"
color_text:       "#ffffff"
color_accent:     "#007bff"
color_info:       "#4a90e2"
color_bay_bg:     "#222"
color_bay_border: "#444"
color_bay_sub:    "#555"
color_led_off:    "#333"
color_led_ok:     "#00ff41"
color_led_warn:   "#ff9800"
color_led_error:  "#f44336"
```

---

### managed-nas-detail-card — configurazione completa

```yaml
type: custom:managed-nas-detail-card

# Collegamento con la nas-card
input_select:      input_select.nas_selected_bay
sensor_base:       sensor.mynas
binary_base:       binary_sensor.mynas
bays:              8
bay_option_prefix: "Baia "
input_select_none: Nessuna

# Suffissi bay ({N} = numero bay)
suffix_vol_used:    _volume_{N}_spazio_usato
suffix_vol_free:    _volume_{N}_spazio_libero
suffix_vol_state:   _volume_{N}_stato
suffix_temp:        _drive_{N}_temperatura
suffix_bad_sectors: _drive_{N}_superato_il_numero_massimo_di_settori_danneggiati
suffix_low_life:    _drive_{N}_al_di_sotto_della_vita_residua_minima

# Suffissi Status
suffix_ram_pct:   _utilizzo_memoria
suffix_ram_free:  _memoria_disponibile
suffix_swap_used: _swap_in_uso
suffix_swap_free: _swap_disponibile
suffix_cpu_total: _utilizzo_cpu
suffix_cpu_sys:   _utilizzo_cpu_sistema
suffix_cpu_user:  _utilizzo_cpu_utente
suffix_cpu_other: _utilizzo_cpu_altro
suffix_load_1:    _carico_cpu_1_minuto
suffix_load_5:    _carico_cpu_5_minuti
suffix_load_15:   _carico_cpu_15_minuti
suffix_cache:     _utilizzo_cache
suffix_net_up:    _velocita_di_rete_upload
suffix_net_down:  _velocita_di_rete_download

# Grafico storico
history_hours:   1      # ore di storico nel grafico
graph_update_ms: 5000   # ms tra un aggiornamento e l'altro

# Colori grafici
color_donut_used: "#4a90e2"
color_donut_free: "#444"
color_temp_line:  "#ff9800"
color_ram:        "#ff9800"
color_swap:       "#4a90e2"
color_cpu_total:  "#ff9800"
color_cpu_sys:    "#4a90e2"
color_cpu_user:   "#f44336"
color_cpu_other:  "#aa44ff"
color_net_up:     "#ff9800"
color_net_down:   "#4a90e2"
```

---

### Layout dashboard completo

```yaml
views:
  - title: NAS
    cards:
      # Card principale — bay + header
      - type: custom:managed-nas-card
        title: NAS
        model: MyNAS-8Bay
        bays: 8
        grid_cols: auto        # 4 colonne × 2 righe per 8 bay
        sensor_base: sensor.mynas
        binary_base: binary_sensor.mynas
        input_select: input_select.nas_selected_bay
        reboot_button:   button.mynas_reboot
        shutdown_button: button.mynas_shutdown
        usb_prefix: sensor.mynas_usb_disk

      # Detail card — appare solo quando qualcosa è selezionato
      - type: custom:managed-nas-detail-card
        input_select:  input_select.nas_selected_bay
        sensor_base:   sensor.mynas
        binary_base:   binary_sensor.mynas
        bays: 8
```

---

## 🗂️ Struttura repository

```
managed-nas-card/
├── managed-nas-card.js         ← card principale
├── managed-nas-detail-card.js  ← companion card dettaglio
├── hacs.json
├── info.md
├── README.md
├── LICENSE
├── .gitignore
├── docs/
└── .github/
    ├── workflows/release.yml
    └── ISSUE_TEMPLATE/
        ├── bug_report.yml
        └── feature_request.yml
```

---

## 🏠 Entità attese

### Card principale

```
# Per ogni bay N (1..bays):
binary_sensor.{binary_base}_drive_{N}_stato_intelligente        → smart status
binary_sensor.{binary_base}_drive_{N}_superato_il_numero...     → binary on/off
binary_sensor.{binary_base}_drive_{N}_al_di_sotto_della_vita... → binary on/off

# Sistema:
sensor.{sensor_base}_temperatura
sensor.{sensor_base}_ultimo_avvio        → ISO timestamp
binary_sensor.{binary_base}_stato_di_sicurezza

# USB (prefix match):
sensor.{usb_prefix}*                     → qualsiasi entità che inizia con usb_prefix
sensor.{usb_prefix}*_status              → entità per warning USB
```

### Detail card — bay

```
sensor.{sensor_base}_volume_{N}_spazio_usato
sensor.{sensor_base}_volume_{N}_spazio_libero
sensor.{sensor_base}_volume_{N}_stato
sensor.{sensor_base}_drive_{N}_temperatura
```

### Detail card — Status

```
sensor.{sensor_base}_utilizzo_memoria
sensor.{sensor_base}_memoria_disponibile
sensor.{sensor_base}_swap_in_uso
sensor.{sensor_base}_swap_disponibile
sensor.{sensor_base}_utilizzo_cpu
sensor.{sensor_base}_utilizzo_cpu_sistema
sensor.{sensor_base}_utilizzo_cpu_utente
sensor.{sensor_base}_utilizzo_cpu_altro
sensor.{sensor_base}_carico_cpu_1_minuto
sensor.{sensor_base}_carico_cpu_5_minuti
sensor.{sensor_base}_carico_cpu_15_minuti
sensor.{sensor_base}_utilizzo_cache
sensor.{sensor_base}_velocita_di_rete_upload
sensor.{sensor_base}_velocita_di_rete_download
```

---

## 📋 Changelog

### v1.0.0
- Rilascio iniziale — card universale NAS
- Griglia bay configurabile (colonne, etichetta, numero)
- Detail card con 3 viste: Bay, Status, Alert
- Donut chart spazio volume con percentuali
- Grafico storico temperatura disco
- Dashboard Status: RAM, SWAP, CPU (multi-linea), carico CPU, cache, rete
- Griglia Alert: binary sensor per ogni disco
- Tutti i suffissi entità configurabili
- Editor visivo Lovelace completo
- Nessun riferimento a brand specifici

---

## 📄 Licenza

MIT — vedi [LICENSE](LICENSE)
