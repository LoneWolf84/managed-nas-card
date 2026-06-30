# Managed NAS Card

Card Lovelace universale per NAS in Home Assistant — qualsiasi marca, qualsiasi modello, qualsiasi numero di bay.

## Caratteristiche

- Griglia bay configurabile (numero di bay, colonne, etichetta) con LED di stato SMART
- Tooltip al passaggio del mouse su ogni bay: temperatura disco, stato SMART, allarme settori danneggiati, allarme vita residua
- Widget USB opzionale per dischi esterni (numero di sensori configurabile)
- Indicatori STATUS e ALERT con badge lampeggianti in caso di problemi
- Pulsanti reboot e shutdown con conferma
- Editor visivo a 3 step — niente YAML a mano necessario
- Tutti i colori, le etichette e i suffissi entità personalizzabili

## Installazione

### HACS (consigliato)

1. HACS → Frontend → menu (⋮) → Repository personalizzati
2. Aggiungi questo repository come tipo **Dashboard**
3. Cerca **Managed NAS Card** e installa

### Manuale

1. Scarica `managed-nas-card.js` dall'[ultima release](https://github.com/YOUR_USERNAME/managed-nas-card/releases/latest)
2. Copialo in `config/www/managed-nas-card.js`
3. Aggiungi la risorsa in Impostazioni → Dashboard → Risorse:
   ```yaml
   url: /local/managed-nas-card.js
   type: module
   ```

## Configurazione

La card si configura interamente tramite l'editor visivo:

1. **Add card** → cerca **Managed NAS Card**
2. **Step 1 — Struttura**: numero di bay, layout griglia, etichetta bay, opzioni input_select
3. **Step 2 — Sensori**: seleziona i sensori per ogni bay (SMART, temperatura, settori danneggiati, vita residua), i sensori di sistema (temperatura NAS, uptime, sicurezza), i dischi USB esterni e — solo se preferisci non configurare ogni sensore singolarmente — un prefisso comune (sensor base) da cui generare tutto in automatico
4. **Step 3 — Opzioni**: suffissi entità avanzati, colori, funzionalità da mostrare/nascondere

### Esempio YAML minimo

```yaml
type: custom:managed-nas-card
title: NAS
bays: 8
grid_cols: "4"
bay_label: BAY
smart_1: sensor.mynas_disk1_smart_status
temp_1: sensor.mynas_disk1_temperature
life_1: binary_sensor.mynas_disk1_low_life
bad_1: binary_sensor.mynas_disk1_bad_sectors
# ... ripeti per ogni bay
input_select: input_select.nas_selected_bay
bay_option_prefix: "Bay "
```

### Grafici storici

Questa card mostra solo lo stato in tempo reale (LED, badge, tooltip). Per grafici storici di temperatura, spazio disco, CPU, RAM, rete, ecc. si consiglia di usare [apexcharts-card](https://github.com/RomRider/apexcharts-card) in una card separata della tua dashboard, puntando alle stesse entità sensore che hai configurato qui.

## Struttura repository

```
managed-nas-card/
├── managed-nas-card.js    ← la card
├── hacs.json
├── info.md
├── README.md
└── LICENSE
```

## Licenza

MIT
