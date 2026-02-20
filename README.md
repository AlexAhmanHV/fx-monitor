# FX Monitor

FX Monitor är ett statiskt portfolio-projekt som visar historiska växelkurser från ECB med KPI-kort och interaktiv linjegraf.

## Funktioner

- Modern, responsiv project page i dark mode
- Dropdown för primär valuta
- Fler valutapar: EUR/SEK, EUR/USD, EUR/GBP, EUR/JPY, EUR/NOK, EUR/CHF
- Datumintervall: 30D, 90D, 365D, All
- Interaktiv linjegraf (Chart.js)
- Jämförelseläge: upp till 3 par samtidigt, normaliserat till index 100
- Extra riskdiagram: rolling volatility (30D), drawdown, returns-histogram
- Regime-bands i huvudgrafen (low/normal/high volatilitet)
- Event-markers i huvudgrafen (makro-/centralbankshandelser)
- Market snapshot-panel med trend, volatilitetsregim och observationsantal
- Tvaspraksstod (SV/EN) med snabb sprakvaxlare i UI
- Dark/Light mode med temavaxlare och sparad preferens i browsern
- KPI: senaste kurs, 1D/1W/1M förändring, MA30, 30D volatilitet, min/max
- Footer med `Last updated (UTC)` och datakälla (ECB)
- Helt statisk site som läser JSON från `site/public/data`
- URL-state för delbara vyer (`pair`, `range`, `mode`, `compare`)

## Projektstruktur

```text
/
  README.md
  pipeline/
    fetch_fx.py
    pyproject.toml
    requirements.txt
    tests/
      test_fetch_fx.py
  site/
    package.json
    vite.config.ts
    src/
      App.tsx
      main.tsx
      styles.css
      components/
      lib/
    public/
      data/
        manifest.json
        fx_EURSEK.json
        fx_EURUSD.json
        fx_EURGBP.json
        fx_EURJPY.json
        fx_EURNOK.json
        fx_EURCHF.json
  .github/workflows/
    update-data.yml
```

## Lokal körning

### 1. Data pipeline (Python 3.11+)

```bash
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r pipeline/requirements.txt
python pipeline/fetch_fx.py --output-dir site/public/data --start-period 2015-01-01
```

Valfritt quality-check:

```bash
ruff check pipeline
pytest pipeline/tests
```

### 2. Frontend (Vite + React + TypeScript)

```bash
cd site
npm install
npm run dev
```

Produktion:

```bash
cd site
npm ci
npm run build
npm run preview
```

## GitHub Actions: daglig auto-uppdatering

Workflow: `.github/workflows/update-data.yml`

- Kör dagligen via cron (`30 4 * * *`) samt manuellt (`workflow_dispatch`)
- Installerar Python + dependencies
- Kör lint + smoke test
- Hämtar senaste ECB-data och uppdaterar JSON-filer
- Commit + push till `main` endast om data ändrats

När JSON-filerna uppdateras på `main` triggas Render auto-deploy.

## Deploy på Render (Static Site)

- Root: repo root
- Build command:
  - `cd site && npm ci && npm run build`
- Publish directory:
  - `site/dist`
- Auto-deploy:
  - Enabled från `main`

## Datakälla

Europeiska centralbanken (ECB), EXR dataset via SDMX Data API:

- https://data-api.ecb.europa.eu/service/data/EXR/D.SEK.EUR.SP00.A?startPeriod=2015-01-01&format=csvdata
- https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?startPeriod=2015-01-01&format=csvdata
- https://data-api.ecb.europa.eu/service/data/EXR/D.GBP.EUR.SP00.A?startPeriod=2015-01-01&format=csvdata
- https://data-api.ecb.europa.eu/service/data/EXR/D.JPY.EUR.SP00.A?startPeriod=2015-01-01&format=csvdata
- https://data-api.ecb.europa.eu/service/data/EXR/D.NOK.EUR.SP00.A?startPeriod=2015-01-01&format=csvdata
- https://data-api.ecb.europa.eu/service/data/EXR/D.CHF.EUR.SP00.A?startPeriod=2015-01-01&format=csvdata

ECB referenskurser publiceras normalt bankdagar (hål för helger/helgdagar hanteras naturligt i serien).

## Tekniska beslut

- **Volatilitet (30D):** standardavvikelse av dagliga log-avkastningar (`ln(P_t / P_{t-1})`) över senaste 30 observationer, rapporterad i procent (ej annualiserad).
- **1D/1W/1M förändring:** procentuell förändring från senaste till närmast tillgängliga datapunkt <= mål-datum (för att hantera ej-bankdagar).
- **MA30:** glidande medelvärde över senaste 30 observationer.
- **Ingen backend/databas:** frontend läser statiska JSON-filer från `public/data`.

## Screenshots (instruktion)

Efter att `npm run dev` körts:

1. Öppna sidan i desktop-läge och ta en helsidesbild.
2. Byt till mobil viewport och ta en bild som visar responsiv layout.
3. Välj jämförelseläge, lägg till två jämförelsepar och ta en bild där indexgrafen visas.
