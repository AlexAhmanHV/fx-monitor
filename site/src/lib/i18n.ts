export type Locale = 'sv' | 'en';

export type Translation = {
  projectPage: string;
  title: string;
  subtitle: string;
  primaryPair: string;
  dateRange: string;
  asOf: string;
  compareMode: string;
  compareHint: string;
  latestRate: string;
  pctChange: string;
  ma30: string;
  ma30Hint: string;
  vol30: string;
  volHint: string;
  min: string;
  max: string;
  selectedRange: string;
  loading: string;
  noData: string;
  source: string;
  lastUpdated: string;
  rateHistory: string;
  relativePerformance: string;
  rollingVol: string;
  drawdown: string;
  returnsHistogram: string;
  langLabel: string;
  themeLabel: string;
  dark: string;
  light: string;
  snapshotTitle: string;
  trend30: string;
  volRegime: string;
  observations: string;
  regimeLow: string;
  regimeNormal: string;
  regimeHigh: string;
};

export const translations: Record<Locale, Translation> = {
  en: {
    projectPage: 'Project Page',
    title: 'FX Monitor - ECB reference rates',
    subtitle:
      'Static fintech dashboard with ECB exchange rates, interactive charting, comparison mode, and range-aware KPI cards.',
    primaryPair: 'Primary currency pair',
    dateRange: 'Date range',
    asOf: 'As of',
    compareMode: 'Compare mode',
    compareHint: 'Normalize to 100 at selected range start',
    latestRate: 'Latest rate',
    pctChange: 'Percent change',
    ma30: 'MA30',
    ma30Hint: '30-day moving average',
    vol30: '30D vol',
    volHint: 'Std dev of daily log returns',
    min: 'Min',
    max: 'Max',
    selectedRange: 'Selected range',
    loading: 'Loading FX data...',
    noData: 'No data available.',
    source: 'Source',
    lastUpdated: 'Last updated (UTC)',
    rateHistory: 'Rate history',
    relativePerformance: 'Relative performance (base = 100)',
    rollingVol: 'Rolling volatility (30D)',
    drawdown: 'Drawdown',
    returnsHistogram: 'Daily log returns histogram',
    langLabel: 'Language',
    themeLabel: 'Theme',
    dark: 'Dark',
    light: 'Light',
    snapshotTitle: 'Market snapshot',
    trend30: '30D trend',
    volRegime: 'Volatility regime',
    observations: 'Observations',
    regimeLow: 'Low',
    regimeNormal: 'Normal',
    regimeHigh: 'High',
  },
  sv: {
    projectPage: 'Projektsida',
    title: 'FX Monitor - ECB referenskurser',
    subtitle:
      'Statisk fintech-dashboard med ECB-v\u00E4xelkurser, interaktiva grafer, j\u00E4mf\u00F6relsel\u00E4ge och KPI-kort f\u00F6r valt intervall.',
    primaryPair: 'Prim\u00E4rt valutapar',
    dateRange: 'Datumintervall',
    asOf: 'Per datum',
    compareMode: 'J\u00E4mf\u00F6relsel\u00E4ge',
    compareHint: 'Normalisera till 100 vid intervallstart',
    latestRate: 'Senaste kurs',
    pctChange: 'Procentuell f\u00F6r\u00E4ndring',
    ma30: 'MA30',
    ma30Hint: '30-dagars glidande medel',
    vol30: '30D vol',
    volHint: 'Stdavvikelse f\u00F6r dagliga log returns',
    min: 'Min',
    max: 'Max',
    selectedRange: 'Valt intervall',
    loading: 'Laddar valutadata...',
    noData: 'Ingen data tillg\u00E4nglig.',
    source: 'K\u00E4lla',
    lastUpdated: 'Senast uppdaterad (UTC)',
    rateHistory: 'Kurshistorik',
    relativePerformance: 'Relativ utveckling (bas = 100)',
    rollingVol: 'Rullande volatilitet (30D)',
    drawdown: 'Nedg\u00E5ng fr\u00E5n topp',
    returnsHistogram: 'Histogram f\u00F6r dagliga log returns',
    langLabel: 'Spr\u00E5k',
    themeLabel: 'Tema',
    dark: 'M\u00F6rk',
    light: 'Ljus',
    snapshotTitle: 'Marknadssnapshot',
    trend30: '30D trend',
    volRegime: 'Volatilitetsregim',
    observations: 'Observationer',
    regimeLow: 'L\u00E5g',
    regimeNormal: 'Normal',
    regimeHigh: 'H\u00F6g',
  },
};
