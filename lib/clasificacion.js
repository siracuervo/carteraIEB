// Taxonomía a propósito chica, por ahora: CEDEARs, Bonos, Acciones (mercado
// argentino) y Efectivo (pesos, dólares y cauciones, todo junto). Se puede abrir
// más adelante si hace falta, pero mientras menos categorías, más fácil de leer.
export const CLASES = {
  CEDEAR: "CEDEARs",
  ACCION_LOCAL: "Acciones",
  BONO_SOBERANO: "Bonos",
  EFECTIVO: "Efectivo",
  MOVIMIENTO: "Movimiento de cuenta (no es tenencia)",
  OTRO: "Otro / sin clasificar",
};

// Nombre corto para mostrar y sector aproximado por ticker, para los instrumentos
// vistos en los exports de IEB. El sector no pretende ser una clasificación GICS
// estricta, solo una primera foto de diversificación que el usuario puede corregir
// desde la UI.
export const INFO_POR_TICKER = {
  AAPL: { nombre: "Apple", sector: "Tecnología" },
  MSFT: { nombre: "Microsoft", sector: "Tecnología" },
  GOOGL: { nombre: "Alphabet (Google)", sector: "Tecnología" },
  IBM: { nombre: "IBM", sector: "Tecnología" },
  HPQ: { nombre: "HP", sector: "Tecnología" },
  CSCO: { nombre: "Cisco", sector: "Tecnología" },
  INTC: { nombre: "Intel", sector: "Tecnología" },
  QCOM: { nombre: "Qualcomm", sector: "Tecnología" },
  TXN: { nombre: "Texas Instruments", sector: "Tecnología" },
  AVGO: { nombre: "Broadcom", sector: "Tecnología" },
  MRVL: { nombre: "Marvell", sector: "Tecnología" },
  MU: { nombre: "Micron", sector: "Tecnología" },
  SNDK: { nombre: "SanDisk", sector: "Tecnología" },
  AMAT: { nombre: "Applied Materials", sector: "Tecnología" },
  WDC: { nombre: "Western Digital", sector: "Tecnología" },
  CRWD: { nombre: "CrowdStrike", sector: "Tecnología" },
  PANW: { nombre: "Palo Alto Networks", sector: "Tecnología" },
  NOW: { nombre: "ServiceNow", sector: "Tecnología" },
  PATH: { nombre: "UiPath", sector: "Tecnología" },
  TWLO: { nombre: "Twilio", sector: "Tecnología" },
  TEAM: { nombre: "Atlassian", sector: "Tecnología" },
  ARM: { nombre: "Arm Holdings", sector: "Tecnología" },
  TSM: { nombre: "Taiwan Semiconductor", sector: "Tecnología" },
  ALAB: { nombre: "Astera Labs", sector: "Tecnología" },
  NBIS: { nombre: "Nebius", sector: "Tecnología" },
  NVDA: { nombre: "Nvidia", sector: "Tecnología" },
  AMZN: { nombre: "Amazon", sector: "Consumo discrecional" },
  TSLA: { nombre: "Tesla", sector: "Consumo discrecional" },
  SE: { nombre: "Sea Ltd", sector: "Consumo discrecional" },
  TCOM: { nombre: "Trip.com", sector: "Consumo discrecional" },
  BABA: { nombre: "Alibaba", sector: "Consumo discrecional" },
  META: { nombre: "Meta", sector: "Comunicación" },
  NFLX: { nombre: "Netflix", sector: "Comunicación" },
  SPOT: { nombre: "Spotify", sector: "Comunicación" },
  OKLO: { nombre: "Oklo", sector: "Energía" },
  CEG: { nombre: "Constellation Energy", sector: "Energía" },
  GEV: { nombre: "GE Vernova", sector: "Energía" },
  SPCX: { nombre: "SpaceX", sector: "Industriales" },
  RKLB: { nombre: "Rocket Lab", sector: "Industriales" },
  ASTS: { nombre: "AST SpaceMobile", sector: "Comunicación" },
  MP: { nombre: "MP Materials", sector: "Materiales" },
  MOS: { nombre: "Mosaic", sector: "Materiales" },
  NVO: { nombre: "Novo Nordisk", sector: "Salud" },
  MRNA: { nombre: "Moderna", sector: "Salud" },
  MRK: { nombre: "Merck", sector: "Salud" },
  LRCX: { nombre: "Lam Research", sector: "Tecnología" },
  XP: { nombre: "XP Inc.", sector: "Financiero" },
  NU: { nombre: "Nu Holdings", sector: "Financiero" },
  BBD: { nombre: "Banco Bradesco", sector: "Financiero" },
  PAGS: { nombre: "PagSeguro", sector: "Financiero" },
  STNE: { nombre: "StoneCo", sector: "Financiero" },
  HOOD: { nombre: "Robinhood", sector: "Financiero" },
  SPGI: { nombre: "S&P Global", sector: "Financiero" },
  BMA: { nombre: "Banco Macro", sector: "Financiero" },
  BYMA: { nombre: "Bolsas y Mercados Argentinos", sector: "Financiero" },
  TQQQ: { nombre: "ProShares UltraPro QQQ", sector: "Índice apalancado" },
  AUSO: { nombre: "Autopista del Sol", sector: "Infraestructura" },
  ECOG: { nombre: "Ecogas", sector: "Energía" },
  KEEL: { nombre: "Keel Infrastructure", sector: "Tecnología" },
  S30S6: { nombre: "Letra del Tesoro S30S6", sector: "Renta fija soberana" },
  AO27: { nombre: "Bono AO27", sector: "Renta fija soberana" },
  AO28: { nombre: "Bono AO28", sector: "Renta fija soberana" },
  AO29: { nombre: "Bono AO29", sector: "Renta fija soberana" },
  AE38: { nombre: "Bono AE38", sector: "Renta fija soberana" },
  AL35: { nombre: "Bono AL35", sector: "Renta fija soberana" },
  DICP: { nombre: "Bono DICP", sector: "Renta fija soberana" },
  DIP0: { nombre: "Bono DIP0", sector: "Renta fija soberana" },
  BA37D: { nombre: "Bono BA37D", sector: "Renta fija provincial" },
  BB37D: { nombre: "Bono BB37D", sector: "Renta fija provincial" },
  GBAN: { nombre: "Naturgy Ban", sector: "Energía" },
  METR: { nombre: "Metrogas", sector: "Energía" },
  COME: { nombre: "Comercial del Plata", sector: "Industrial" },
  MSFT: { nombre: "Microsoft", sector: "Tecnología" },
  SNOW: { nombre: "Snowflake", sector: "Tecnología" },
  ASML: { nombre: "ASML Holding", sector: "Tecnología" },
  CRWV: { nombre: "CoreWeave", sector: "Tecnología" },
  IREN: { nombre: "Iren", sector: "Tecnología" },
  ANET: { nombre: "Arista Networks", sector: "Tecnología" },
  ADI: { nombre: "Analog Devices", sector: "Tecnología" },
  AMD: { nombre: "Advanced Micro Devices", sector: "Tecnología" },
  GLW: { nombre: "Corning", sector: "Materiales" },
  ORCL: { nombre: "Oracle", sector: "Tecnología" },
  MELI: { nombre: "MercadoLibre", sector: "Consumo discrecional" },
  BIDU: { nombre: "Baidu", sector: "Tecnología" },
  JD: { nombre: "JD.com", sector: "Consumo discrecional" },
  VIST: { nombre: "Vista Energy", sector: "Energía" },
  SHOP: { nombre: "Shopify", sector: "Tecnología" },
  COIN: { nombre: "Coinbase", sector: "Financiero" },
  UBER: { nombre: "Uber", sector: "Consumo discrecional" },
  IBIT: { nombre: "iShares Bitcoin Trust", sector: "Criptoactivos" },
  CLS: { nombre: "Celestica", sector: "Tecnología" },
  BBAR: { nombre: "BBVA Argentina", sector: "Financiero" },
  VALO: { nombre: "Banco de Valores", sector: "Financiero" },
  PAMP: { nombre: "Pampa Energía", sector: "Energía" },
  EDN: { nombre: "Edenor", sector: "Energía" },
  GGAL: { nombre: "Grupo Financiero Galicia", sector: "Financiero" },
  YPFD: { nombre: "YPF", sector: "Energía" },
  A3: { nombre: "A3 Mercados", sector: "Financiero" },
  IEBC: { nombre: "IEB Construcciones", sector: "Infraestructura" },

  // ---- CEDEARs agregados en bloque desde el listado BYMA (feed data912) ----
  // Sin nombre/sector curado todavía: se clasifican como CEDEAR “Sin clasificar”.
  // Si comprás uno nuevo, ya se reconoce solo; después se le puede poner nombre
  // y sector a mano desde la app (overrides) o curarlo acá arriba.
  AAL: { nombre: "AAL", sector: "Sin clasificar" },
  AAP: { nombre: "AAP", sector: "Sin clasificar" },
  ABBV: { nombre: "ABBV", sector: "Sin clasificar" },
  ABEV: { nombre: "ABEV", sector: "Sin clasificar" },
  ABEV3: { nombre: "ABEV3", sector: "Sin clasificar" },
  ABNB: { nombre: "ABNB", sector: "Sin clasificar" },
  ABT: { nombre: "ABT", sector: "Sin clasificar" },
  ACN: { nombre: "ACN", sector: "Sin clasificar" },
  ACWI: { nombre: "ACWI", sector: "Sin clasificar" },
  ADBE: { nombre: "ADBE", sector: "Sin clasificar" },
  ADGO: { nombre: "ADGO", sector: "Sin clasificar" },
  ADP: { nombre: "ADP", sector: "Sin clasificar" },
  AEG: { nombre: "AEG", sector: "Sin clasificar" },
  AEM: { nombre: "AEM", sector: "Sin clasificar" },
  AI: { nombre: "AI", sector: "Sin clasificar" },
  AIG: { nombre: "AIG", sector: "Sin clasificar" },
  AKOBD: { nombre: "AKOBD", sector: "Sin clasificar" },
  ALAC: { nombre: "ALAC", sector: "Sin clasificar" },
  ALAD: { nombre: "ALAD", sector: "Sin clasificar" },
  AMGN: { nombre: "AMGN", sector: "Sin clasificar" },
  AMX: { nombre: "AMX", sector: "Sin clasificar" },
  ANF: { nombre: "ANF", sector: "Sin clasificar" },
  ARCO: { nombre: "ARCO", sector: "Sin clasificar" },
  ARKK: { nombre: "ARKK", sector: "Sin clasificar" },
  ASR: { nombre: "ASR", sector: "Sin clasificar" },
  AVY: { nombre: "AVY", sector: "Sin clasificar" },
  AXP: { nombre: "AXP", sector: "Sin clasificar" },
  AZN: { nombre: "AZN", sector: "Sin clasificar" },
  B: { nombre: "B", sector: "Sin clasificar" },
  BA: { nombre: "BA", sector: "Sin clasificar" },
  BAK: { nombre: "BAK", sector: "Sin clasificar" },
  BAYN: { nombre: "BAYN", sector: "Sin clasificar" },
  BB: { nombre: "BB", sector: "Sin clasificar" },
  BBAS3: { nombre: "BBAS3", sector: "Sin clasificar" },
  BBAX: { nombre: "BBAX", sector: "Sin clasificar" },
  BBCA: { nombre: "BBCA", sector: "Sin clasificar" },
  BBDC3: { nombre: "BBDC3", sector: "Sin clasificar" },
  BBV: { nombre: "BBV", sector: "Sin clasificar" },
  BCS: { nombre: "BCS", sector: "Sin clasificar" },
  BHP: { nombre: "BHP", sector: "Sin clasificar" },
  BIIB: { nombre: "BIIB", sector: "Sin clasificar" },
  BIOX: { nombre: "BIOX", sector: "Sin clasificar" },
  BKNG: { nombre: "BKNG", sector: "Sin clasificar" },
  BKR: { nombre: "BKR", sector: "Sin clasificar" },
  BMNR: { nombre: "BMNR", sector: "Sin clasificar" },
  BMY: { nombre: "BMY", sector: "Sin clasificar" },
  BNG: { nombre: "BNG", sector: "Sin clasificar" },
  BNY: { nombre: "BNY", sector: "Sin clasificar" },
  BP: { nombre: "BP", sector: "Sin clasificar" },
  BPA11: { nombre: "BPA11", sector: "Sin clasificar" },
  BRKB: { nombre: "BRKB", sector: "Sin clasificar" },
  BSBR: { nombre: "BSBR", sector: "Sin clasificar" },
  BX: { nombre: "BX", sector: "Sin clasificar" },
  C: { nombre: "C", sector: "Sin clasificar" },
  CAAP: { nombre: "CAAP", sector: "Sin clasificar" },
  CAH: { nombre: "CAH", sector: "Sin clasificar" },
  CAR: { nombre: "CAR", sector: "Sin clasificar" },
  CAT: { nombre: "CAT", sector: "Sin clasificar" },
  CCJ: { nombre: "CCJ", sector: "Sin clasificar" },
  CCL: { nombre: "CCL", sector: "Sin clasificar" },
  CDE: { nombre: "CDE", sector: "Sin clasificar" },
  CIBR: { nombre: "CIBR", sector: "Sin clasificar" },
  CL: { nombre: "CL", sector: "Sin clasificar" },
  COP: { nombre: "COP", sector: "Sin clasificar" },
  COPX: { nombre: "COPX", sector: "Sin clasificar" },
  CORN: { nombre: "CORN", sector: "Sin clasificar" },
  COST: { nombre: "COST", sector: "Sin clasificar" },
  CRM: { nombre: "CRM", sector: "Sin clasificar" },
  CSNA3: { nombre: "CSNA3", sector: "Sin clasificar" },
  CVS: { nombre: "CVS", sector: "Sin clasificar" },
  CVX: { nombre: "CVX", sector: "Sin clasificar" },
  CX: { nombre: "CX", sector: "Sin clasificar" },
  DAL: { nombre: "DAL", sector: "Sin clasificar" },
  DD: { nombre: "DD", sector: "Sin clasificar" },
  DE: { nombre: "DE", sector: "Sin clasificar" },
  DECK: { nombre: "DECK", sector: "Sin clasificar" },
  DELL: { nombre: "DELL", sector: "Sin clasificar" },
  DEO: { nombre: "DEO", sector: "Sin clasificar" },
  DHR: { nombre: "DHR", sector: "Sin clasificar" },
  DIA: { nombre: "DIA", sector: "Sin clasificar" },
  DISN: { nombre: "DISN", sector: "Sin clasificar" },
  DOCU: { nombre: "DOCU", sector: "Sin clasificar" },
  DOW: { nombre: "DOW", sector: "Sin clasificar" },
  E: { nombre: "E", sector: "Sin clasificar" },
  EBAY: { nombre: "EBAY", sector: "Sin clasificar" },
  ECL: { nombre: "ECL", sector: "Sin clasificar" },
  EEM: { nombre: "EEM", sector: "Sin clasificar" },
  EFA: { nombre: "EFA", sector: "Sin clasificar" },
  EFX: { nombre: "EFX", sector: "Sin clasificar" },
  ELPC: { nombre: "ELPC", sector: "Sin clasificar" },
  EMBJ: { nombre: "EMBJ", sector: "Sin clasificar" },
  EQNR: { nombre: "EQNR", sector: "Sin clasificar" },
  ERIC: { nombre: "ERIC", sector: "Sin clasificar" },
  ESGU: { nombre: "ESGU", sector: "Sin clasificar" },
  ETHA: { nombre: "ETHA", sector: "Sin clasificar" },
  ETSY: { nombre: "ETSY", sector: "Sin clasificar" },
  EWJ: { nombre: "EWJ", sector: "Sin clasificar" },
  EWY: { nombre: "EWY", sector: "Sin clasificar" },
  EWZ: { nombre: "EWZ", sector: "Sin clasificar" },
  F: { nombre: "F", sector: "Sin clasificar" },
  FCX: { nombre: "FCX", sector: "Sin clasificar" },
  FDX: { nombre: "FDX", sector: "Sin clasificar" },
  FISV: { nombre: "FISV", sector: "Sin clasificar" },
  FMX: { nombre: "FMX", sector: "Sin clasificar" },
  FNMA: { nombre: "FNMA", sector: "Sin clasificar" },
  FSLR: { nombre: "FSLR", sector: "Sin clasificar" },
  FXI: { nombre: "FXI", sector: "Sin clasificar" },
  GDX: { nombre: "GDX", sector: "Sin clasificar" },
  GE: { nombre: "GE", sector: "Sin clasificar" },
  GFI: { nombre: "GFI", sector: "Sin clasificar" },
  GGB: { nombre: "GGB", sector: "Sin clasificar" },
  GILD: { nombre: "GILD", sector: "Sin clasificar" },
  GLD: { nombre: "GLD", sector: "Sin clasificar" },
  GLNG: { nombre: "GLNG", sector: "Sin clasificar" },
  GLOB: { nombre: "GLOB", sector: "Sin clasificar" },
  GM: { nombre: "GM", sector: "Sin clasificar" },
  GOGLC: { nombre: "GOGLC", sector: "Sin clasificar" },
  GOGLD: { nombre: "GOGLD", sector: "Sin clasificar" },
  GPRK: { nombre: "GPRK", sector: "Sin clasificar" },
  GRMN: { nombre: "GRMN", sector: "Sin clasificar" },
  GS: { nombre: "GS", sector: "Sin clasificar" },
  GSG: { nombre: "GSG", sector: "Sin clasificar" },
  GSK: { nombre: "GSK", sector: "Sin clasificar" },
  GT: { nombre: "GT", sector: "Sin clasificar" },
  HAL: { nombre: "HAL", sector: "Sin clasificar" },
  HAPV3: { nombre: "HAPV3", sector: "Sin clasificar" },
  HD: { nombre: "HD", sector: "Sin clasificar" },
  HDB: { nombre: "HDB", sector: "Sin clasificar" },
  HIMS: { nombre: "HIMS", sector: "Sin clasificar" },
  HL: { nombre: "HL", sector: "Sin clasificar" },
  HMC: { nombre: "HMC", sector: "Sin clasificar" },
  HMY: { nombre: "HMY", sector: "Sin clasificar" },
  HOG: { nombre: "HOG", sector: "Sin clasificar" },
  HON: { nombre: "HON", sector: "Sin clasificar" },
  HSBC: { nombre: "HSBC", sector: "Sin clasificar" },
  HSY: { nombre: "HSY", sector: "Sin clasificar" },
  HUT: { nombre: "HUT", sector: "Sin clasificar" },
  HWM: { nombre: "HWM", sector: "Sin clasificar" },
  IBB: { nombre: "IBB", sector: "Sin clasificar" },
  IBKR: { nombre: "IBKR", sector: "Sin clasificar" },
  IBN: { nombre: "IBN", sector: "Sin clasificar" },
  ICLN: { nombre: "ICLN", sector: "Sin clasificar" },
  IEMG: { nombre: "IEMG", sector: "Sin clasificar" },
  IEUR: { nombre: "IEUR", sector: "Sin clasificar" },
  IFF: { nombre: "IFF", sector: "Sin clasificar" },
  IJH: { nombre: "IJH", sector: "Sin clasificar" },
  ILF: { nombre: "ILF", sector: "Sin clasificar" },
  INFY: { nombre: "INFY", sector: "Sin clasificar" },
  ING: { nombre: "ING", sector: "Sin clasificar" },
  IP: { nombre: "IP", sector: "Sin clasificar" },
  ISRG: { nombre: "ISRG", sector: "Sin clasificar" },
  ITA: { nombre: "ITA", sector: "Sin clasificar" },
  ITUB: { nombre: "ITUB", sector: "Sin clasificar" },
  ITUB3: { nombre: "ITUB3", sector: "Sin clasificar" },
  IVE: { nombre: "IVE", sector: "Sin clasificar" },
  IVV: { nombre: "IVV", sector: "Sin clasificar" },
  IVW: { nombre: "IVW", sector: "Sin clasificar" },
  IWM: { nombre: "IWM", sector: "Sin clasificar" },
  JCI: { nombre: "JCI", sector: "Sin clasificar" },
  JMIA: { nombre: "JMIA", sector: "Sin clasificar" },
  JNJ: { nombre: "JNJ", sector: "Sin clasificar" },
  JOYY: { nombre: "JOYY", sector: "Sin clasificar" },
  JPM: { nombre: "JPM", sector: "Sin clasificar" },
  KB: { nombre: "KB", sector: "Sin clasificar" },
  KEP: { nombre: "KEP", sector: "Sin clasificar" },
  KGC: { nombre: "KGC", sector: "Sin clasificar" },
  KLAC: { nombre: "KLAC", sector: "Sin clasificar" },
  KMB: { nombre: "KMB", sector: "Sin clasificar" },
  KO: { nombre: "KO", sector: "Sin clasificar" },
  KOFM: { nombre: "KOFM", sector: "Sin clasificar" },
  LAC: { nombre: "LAC", sector: "Sin clasificar" },
  LAR: { nombre: "LAR", sector: "Sin clasificar" },
  LIN: { nombre: "LIN", sector: "Sin clasificar" },
  LLY: { nombre: "LLY", sector: "Sin clasificar" },
  LMT: { nombre: "LMT", sector: "Sin clasificar" },
  LND: { nombre: "LND", sector: "Sin clasificar" },
  LREN3: { nombre: "LREN3", sector: "Sin clasificar" },
  LVS: { nombre: "LVS", sector: "Sin clasificar" },
  LYG: { nombre: "LYG", sector: "Sin clasificar" },
  MA: { nombre: "MA", sector: "Sin clasificar" },
  MCD: { nombre: "MCD", sector: "Sin clasificar" },
  MDLZ: { nombre: "MDLZ", sector: "Sin clasificar" },
  MDT: { nombre: "MDT", sector: "Sin clasificar" },
  MFG: { nombre: "MFG", sector: "Sin clasificar" },
  MGLU3: { nombre: "MGLU3", sector: "Sin clasificar" },
  MMM: { nombre: "MMM", sector: "Sin clasificar" },
  MO: { nombre: "MO", sector: "Sin clasificar" },
  MRSH: { nombre: "MRSH", sector: "Sin clasificar" },
  MS: { nombre: "MS", sector: "Sin clasificar" },
  MSI: { nombre: "MSI", sector: "Sin clasificar" },
  MSTR: { nombre: "MSTR", sector: "Sin clasificar" },
  MUFG: { nombre: "MUFG", sector: "Sin clasificar" },
  MUX: { nombre: "MUX", sector: "Sin clasificar" },
  NAT3D: { nombre: "NAT3D", sector: "Sin clasificar" },
  NATU3: { nombre: "NATU3", sector: "Sin clasificar" },
  NEE: { nombre: "NEE", sector: "Sin clasificar" },
  NEM: { nombre: "NEM", sector: "Sin clasificar" },
  NG: { nombre: "NG", sector: "Sin clasificar" },
  NGG: { nombre: "NGG", sector: "Sin clasificar" },
  NIO: { nombre: "NIO", sector: "Sin clasificar" },
  NKE: { nombre: "NKE", sector: "Sin clasificar" },
  NMR: { nombre: "NMR", sector: "Sin clasificar" },
  NOKA: { nombre: "NOKA", sector: "Sin clasificar" },
  NTES: { nombre: "NTES", sector: "Sin clasificar" },
  NTRA: { nombre: "NTRA", sector: "Sin clasificar" },
  NUE: { nombre: "NUE", sector: "Sin clasificar" },
  NVS: { nombre: "NVS", sector: "Sin clasificar" },
  NXE: { nombre: "NXE", sector: "Sin clasificar" },
  O: { nombre: "O", sector: "Sin clasificar" },
  ONDS: { nombre: "ONDS", sector: "Sin clasificar" },
  ORLY: { nombre: "ORLY", sector: "Sin clasificar" },
  OXY: { nombre: "OXY", sector: "Sin clasificar" },
  PAAS: { nombre: "PAAS", sector: "Sin clasificar" },
  PAC: { nombre: "PAC", sector: "Sin clasificar" },
  PBI: { nombre: "PBI", sector: "Sin clasificar" },
  PBR: { nombre: "PBR", sector: "Sin clasificar" },
  PCAR: { nombre: "PCAR", sector: "Sin clasificar" },
  PDD: { nombre: "PDD", sector: "Sin clasificar" },
  PEP: { nombre: "PEP", sector: "Sin clasificar" },
  PETR3: { nombre: "PETR3", sector: "Sin clasificar" },
  PETRC: { nombre: "PETRC", sector: "Sin clasificar" },
  PETRD: { nombre: "PETRD", sector: "Sin clasificar" },
  PFE: { nombre: "PFE", sector: "Sin clasificar" },
  PG: { nombre: "PG", sector: "Sin clasificar" },
  PHG: { nombre: "PHG", sector: "Sin clasificar" },
  PINS: { nombre: "PINS", sector: "Sin clasificar" },
  PKS: { nombre: "PKS", sector: "Sin clasificar" },
  PLD: { nombre: "PLD", sector: "Sin clasificar" },
  PLTR: { nombre: "PLTR", sector: "Sin clasificar" },
  PM: { nombre: "PM", sector: "Sin clasificar" },
  PRIO3: { nombre: "PRIO3", sector: "Sin clasificar" },
  PSQ: { nombre: "PSQ", sector: "Sin clasificar" },
  PSX: { nombre: "PSX", sector: "Sin clasificar" },
  PYPL: { nombre: "PYPL", sector: "Sin clasificar" },
  QQQ: { nombre: "QQQ", sector: "Sin clasificar" },
  RACE: { nombre: "RACE", sector: "Sin clasificar" },
  RBLX: { nombre: "RBLX", sector: "Sin clasificar" },
  RENT3: { nombre: "RENT3", sector: "Sin clasificar" },
  RGTI: { nombre: "RGTI", sector: "Sin clasificar" },
  RIO: { nombre: "RIO", sector: "Sin clasificar" },
  RIOT: { nombre: "RIOT", sector: "Sin clasificar" },
  ROKU: { nombre: "ROKU", sector: "Sin clasificar" },
  ROST: { nombre: "ROST", sector: "Sin clasificar" },
  RSP: { nombre: "RSP", sector: "Sin clasificar" },
  RTX: { nombre: "RTX", sector: "Sin clasificar" },
  SAN: { nombre: "SAN", sector: "Sin clasificar" },
  SAP: { nombre: "SAP", sector: "Sin clasificar" },
  SATL: { nombre: "SATL", sector: "Sin clasificar" },
  SBS: { nombre: "SBS", sector: "Sin clasificar" },
  SBSP3: { nombre: "SBSP3", sector: "Sin clasificar" },
  SBSPD: { nombre: "SBSPD", sector: "Sin clasificar" },
  SBUX: { nombre: "SBUX", sector: "Sin clasificar" },
  SCCO: { nombre: "SCCO", sector: "Sin clasificar" },
  SCHW: { nombre: "SCHW", sector: "Sin clasificar" },
  SDA: { nombre: "SDA", sector: "Sin clasificar" },
  SH: { nombre: "SH", sector: "Sin clasificar" },
  SHEL: { nombre: "SHEL", sector: "Sin clasificar" },
  SHW: { nombre: "SHW", sector: "Sin clasificar" },
  SID: { nombre: "SID", sector: "Sin clasificar" },
  SIEGY: { nombre: "SIEGY", sector: "Sin clasificar" },
  SKHY: { nombre: "SKHY", sector: "Sin clasificar" },
  SLB: { nombre: "SLB", sector: "Sin clasificar" },
  SLV: { nombre: "SLV", sector: "Sin clasificar" },
  SMH: { nombre: "SMH", sector: "Sin clasificar" },
  SNA: { nombre: "SNA", sector: "Sin clasificar" },
  SNAP: { nombre: "SNAP", sector: "Sin clasificar" },
  SONY: { nombre: "SONY", sector: "Sin clasificar" },
  SOYB: { nombre: "SOYB", sector: "Sin clasificar" },
  SPCE: { nombre: "SPCE", sector: "Sin clasificar" },
  SPHQ: { nombre: "SPHQ", sector: "Sin clasificar" },
  SPXL: { nombre: "SPXL", sector: "Sin clasificar" },
  SPY: { nombre: "SPY", sector: "Sin clasificar" },
  STLA: { nombre: "STLA", sector: "Sin clasificar" },
  SUZ: { nombre: "SUZ", sector: "Sin clasificar" },
  SUZB3: { nombre: "SUZB3", sector: "Sin clasificar" },
  SWKS: { nombre: "SWKS", sector: "Sin clasificar" },
  SYY: { nombre: "SYY", sector: "Sin clasificar" },
  T: { nombre: "T", sector: "Sin clasificar" },
  TEM: { nombre: "TEM", sector: "Sin clasificar" },
  TEN: { nombre: "TEN", sector: "Sin clasificar" },
  TGT: { nombre: "TGT", sector: "Sin clasificar" },
  TIMB: { nombre: "TIMB", sector: "Sin clasificar" },
  TIMS3: { nombre: "TIMS3", sector: "Sin clasificar" },
  TJX: { nombre: "TJX", sector: "Sin clasificar" },
  TLN: { nombre: "TLN", sector: "Sin clasificar" },
  TM: { nombre: "TM", sector: "Sin clasificar" },
  TMO: { nombre: "TMO", sector: "Sin clasificar" },
  TMUS: { nombre: "TMUS", sector: "Sin clasificar" },
  TRIP: { nombre: "TRIP", sector: "Sin clasificar" },
  TRVV: { nombre: "TRVV", sector: "Sin clasificar" },
  TTE: { nombre: "TTE", sector: "Sin clasificar" },
  TV: { nombre: "TV", sector: "Sin clasificar" },
  TXR: { nombre: "TXR", sector: "Sin clasificar" },
  UAL: { nombre: "UAL", sector: "Sin clasificar" },
  UGP: { nombre: "UGP", sector: "Sin clasificar" },
  UL: { nombre: "UL", sector: "Sin clasificar" },
  UNH: { nombre: "UNH", sector: "Sin clasificar" },
  UNP: { nombre: "UNP", sector: "Sin clasificar" },
  UPST: { nombre: "UPST", sector: "Sin clasificar" },
  URA: { nombre: "URA", sector: "Sin clasificar" },
  URBN: { nombre: "URBN", sector: "Sin clasificar" },
  USB: { nombre: "USB", sector: "Sin clasificar" },
  USO: { nombre: "USO", sector: "Sin clasificar" },
  V: { nombre: "V", sector: "Sin clasificar" },
  VAL3C: { nombre: "VAL3C", sector: "Sin clasificar" },
  VAL3D: { nombre: "VAL3D", sector: "Sin clasificar" },
  VALE: { nombre: "VALE", sector: "Sin clasificar" },
  VALE3: { nombre: "VALE3", sector: "Sin clasificar" },
  VEA: { nombre: "VEA", sector: "Sin clasificar" },
  VIG: { nombre: "VIG", sector: "Sin clasificar" },
  VIV: { nombre: "VIV", sector: "Sin clasificar" },
  VIVT3: { nombre: "VIVT3", sector: "Sin clasificar" },
  VOD: { nombre: "VOD", sector: "Sin clasificar" },
  VRSN: { nombre: "VRSN", sector: "Sin clasificar" },
  VRTX: { nombre: "VRTX", sector: "Sin clasificar" },
  VST: { nombre: "VST", sector: "Sin clasificar" },
  VXX: { nombre: "VXX", sector: "Sin clasificar" },
  VZ: { nombre: "VZ", sector: "Sin clasificar" },
  WBO: { nombre: "WBO", sector: "Sin clasificar" },
  WEGE3: { nombre: "WEGE3", sector: "Sin clasificar" },
  WELL: { nombre: "WELL", sector: "Sin clasificar" },
  WFC: { nombre: "WFC", sector: "Sin clasificar" },
  WMT: { nombre: "WMT", sector: "Sin clasificar" },
  XLB: { nombre: "XLB", sector: "Sin clasificar" },
  XLC: { nombre: "XLC", sector: "Sin clasificar" },
  XLE: { nombre: "XLE", sector: "Sin clasificar" },
  XLF: { nombre: "XLF", sector: "Sin clasificar" },
  XLI: { nombre: "XLI", sector: "Sin clasificar" },
  XLK: { nombre: "XLK", sector: "Sin clasificar" },
  XLP: { nombre: "XLP", sector: "Sin clasificar" },
  XLRE: { nombre: "XLRE", sector: "Sin clasificar" },
  XLU: { nombre: "XLU", sector: "Sin clasificar" },
  XLV: { nombre: "XLV", sector: "Sin clasificar" },
  XLY: { nombre: "XLY", sector: "Sin clasificar" },
  XME: { nombre: "XME", sector: "Sin clasificar" },
  XOM: { nombre: "XOM", sector: "Sin clasificar" },
  XPEV: { nombre: "XPEV", sector: "Sin clasificar" },
  XROX: { nombre: "XROX", sector: "Sin clasificar" },
  XYZ: { nombre: "XYZ", sector: "Sin clasificar" },
  YELP: { nombre: "YELP", sector: "Sin clasificar" },
  ZM: { nombre: "ZM", sector: "Sin clasificar" },
};

/**
 * Algunos bonos nunca traen "Referencia" (ticker) en los exports de IEB, ni en
 * histórico de tenencia ni en toda la actividad — quedan identificados solo por su
 * nombre largo. Acá los mapeamos a mano a su ticker de mercado conocido.
 */
export const TICKER_POR_NOMBRE_SIN_TICKER = {
  "BONOS REP ARG C/DESCUENTO $ 5,83% 2033": "DICP",
  "DISCOUNTS $ 2010-2033": "DIP0",
  "BONO TESORO NACIONAL 6% 29/10/27 USD": "AO27",
  "BONO TESORO NACIONAL 6% 31/10/28 USD": "AO28",
  "BONO REP. ARGENTINA USD STEP UP 2038": "AE38",
  "CEDEAR DE MICROSOFT CORP.": "MSFT",
  "CEDEAR SNOWFLAKE INC": "SNOW",
  "CEDEAR ASML HOLDING NV": "ASML",
  "CEDEAR COREWEAVE INC": "CRWV",
  "CEDEAR IREN LTD": "IREN",
  "CEDEAR ARISTA NETWORKS INC.": "ANET",
  "CEDEAR NEBIUS GROUP N.V.": "NBIS",
  "CEDEAR ANALOG DEVICES INC.": "ADI",
  "CEDEAR CORNING": "GLW",
  "ORACLE CORPORATION": "ORCL",
  "CEDEAR BANCO BRADESCO S.A.": "BBD",
  "CEDEAR MERCADOLIBRE INC": "MELI",
  "CEDEAR ADVANCED MICRO DEVICES": "AMD",
  "CEDEAR BAIDU INC": "BIDU",
  "CEDEAR JD.COM, INC": "JD",
  "CEDEAR VISTA OIL & GAS": "VIST",
  "CEDEAR SHOPIFY": "SHOP",
  "CEDEAR COINBASE GLOBAL INC.": "COIN",
  "CEDEAR UBER TECHNOLOGIES INC": "UBER",
  "CEDEAR ISHARES BITCOIN TR (IBIT)": "IBIT",
  "CEDEAR CELESTICA INC": "CLS",
  "BANCO BBVA ARG ESC S 1 V.": "BBAR",
  "BCO DE VALORES ACCIONES ORD. 1 VOTO $ ES": "VALO",
  "PAMPA HOLDING": "PAMP",
  "EDN- EDENOR S.A": "EDN",
  "GRUPO FINAN. GALICIA": "GGAL",
  "YPF": "YPFD",
  "A3 MERCADOS": "A3",
  "IEB CONSTRUCCIONES  B  1 VOTO ESCRITURAL": "IEBC",
  "BONO REP. ARGENTINA USD STEP UP 2035": "AL35",
  "BONO PCIA BS AS REGS NEW U$S 2037 A": "BA37D",
  "BONO PCIA BS AS REGS NEW U$S 2037 B": "BB37D",
  "NATURGY BAN S.A. ORD CLASE B 1 VOTO ESC": "GBAN",
  METROGAS: "METR",
  "COM. DEL PLATA": "COME",
};

const SUFIJOS_SOCIETARIOS_RE =
  /[.,]?\s*\b(INCORPORATED|CORPORATION|COMPANY|HOLDINGS?|GROUP|LIMITED|LTD|INC|CORP|CO|PLC|N\.V\.?|A\/S|S\.A\.?)\.?\s*$/i;

/** Limpieza genérica para instrumentos que todavía no están en INFO_POR_TICKER. */
function limpiarNombreGenerico(nombreCrudo) {
  if (!nombreCrudo) return nombreCrudo;
  let n = nombreCrudo.replace(/^CEDEAR\s+/i, "").trim();
  let anterior;
  do {
    anterior = n;
    n = n.replace(SUFIJOS_SOCIETARIOS_RE, "").trim();
  } while (n !== anterior && n.length > 0);
  n = n.replace(/\s{2,}/g, " ").replace(/[.,]+$/, "").trim();
  if (!n) return nombreCrudo.trim();
  return n
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Nombre corto para mostrar: prioriza la tabla curada por ticker, si no limpia el nombre crudo de IEB. */
export function nombreLimpio(ticker, activoCrudo) {
  const info = ticker ? INFO_POR_TICKER[ticker.toUpperCase()] : null;
  if (info?.nombre) return info.nombre;
  return limpiarNombreGenerico(activoCrudo) || activoCrudo || ticker || "Sin identificar";
}

/** Valores de "Referencia" de IEB que no son instrumentos cotizables (cauciones, movimientos varios). */
export const TICKERS_NO_MERCADO = new Set(["CAUCION", "OTHER"]);

const CAUCION_RE = /CAUCION/i;
const MOVIMIENTO_RE = /(GASTOS|ORDEN\s*DE PAGO|CREDITO DER MERC|NOTA DE DEBITO|MEMBRESIA)/i;

/**
 * Movimientos de cuenta que no son una operación de compra/venta en sí (créditos por
 * derechos de mercado, gastos, notas de débito, etc.) — aunque vengan atados a un
 * activo puntual, son montos chicos y no representan una operación real sobre esa
 * posición, así que no tiene sentido mostrarlos en su historial.
 */
export function esMovimiento(operacion) {
  return MOVIMIENTO_RE.test(operacion || "");
}
// Bonos soberanos argentinos: por nombre (BONO/BONOS, Discount, Par, Boncer, Bopreal,
// título público, Letras/Lecaps del Tesoro "L.T.") o por los tickers cortos más
// comunes (Bonares AL/GD/AE/AO + año, Discount DICA/DICY/DICP, Par PARA/PARY,
// Letras S + vencimiento como S30S6). Todos cotizan "cada 100 de nominal".
const BONO_SOBERANO_RE = /^BONOS? |DISCOUNT|DESCUENTO|T[EÍ]TULO P[UÚ]BLICO|BONCER|BOPREAL|LECAPS?|\bLETRAS?\b|^L\.?T\.?(\s|$)/;
const TICKER_BONO_SOBERANO_RE = /^(AL|GD|AE|AO)\d|^(DICA|DICY|DICP|DIP0|PARA|PARY|PR13|PR15)$|^B[AB]37D$|^S\d{2}[A-Z]\d$/;

/** Los bonos soberanos no tienen logo en los proveedores de íconos que usamos. */
export function esTickerBonoSoberano(ticker) {
  return TICKER_BONO_SOBERANO_RE.test((ticker || "").toUpperCase());
}

// Acciones extranjeras que en el archivo de Portafolio de IEB no vienen con el
// prefijo "CEDEAR" en el nombre (a diferencia del resto), así que sin esta lista
// la heurística las confunde con una acción del mercado local.
const TICKERS_CEDEAR_SIN_PREFIJO = new Set(["KEEL", "ORCL"]);

// Tickers de acciones del mercado local argentino (no CEDEARs). Las operaciones que
// importamos de "Operaciones del día" no traen la sección del portafolio, así que
// solo con el ticker no se puede distinguir un CEDEAR de una acción local: por
// defecto asumimos que un ticker conocido es un CEDEAR, y esta lista rescata las
// pocas acciones locales reales.
const TICKERS_ACCION_LOCAL = new Set([
  "A3", "AUSO", "BBAR", "BMA", "BYMA", "COME", "ECOG", "EDN", "GBAN", "GGAL", "IEBC", "METR", "PAMP", "VALO", "YPFD",
]);

/** Tickers que ya sabemos que no tienen logo en el proveedor externo (parqet.com devuelve 404) — se
 * evita el pedido de red y se muestra directamente la inicial, en vez de depender de `onError`.
 * Mayormente acciones locales argentinas que ese proveedor no cubre, más algún caso suelto como
 * MRVL o KEEL. Si aparece un ticker nuevo sin logo, alcanza con sumarlo acá. */
export const TICKERS_SIN_LOGO = new Set([
  "KEEL", "MRVL", "BYMA", "COME", "GBAN", "METR", "PAMP", "VALO", "YPFD", "A3", "AUSO", "ECOG", "IEBC",
]);

/** Clave de agrupación de un activo: preferimos el ticker corto cuando está disponible. */
export function claveActivo(t) {
  return t.ticker || t.activo || "SIN_IDENTIFICAR";
}

/**
 * Heurística de clase de activo y sector a partir del nombre completo y/o ticker.
 * info: { activo, ticker, operacion }
 */
export function clasificar({ activo, ticker, operacion, seccion }) {
  const nombre = (activo || "").toUpperCase();
  const tick = (ticker || "").toUpperCase();
  const op = (operacion || "").toUpperCase();
  const secc = (seccion || "").toUpperCase();

  if (esCaucion(nombre, op)) {
    return { claseActivo: CLASES.EFECTIVO, sector: "Efectivo y equivalentes" };
  }
  if (tick === "OTHER" || esMovimiento(op)) {
    return { claseActivo: CLASES.MOVIMIENTO, sector: null };
  }
  // La sección que reporta el Portfolio de IEB es más confiable que adivinar por el
  // nombre: el nombre a veces no trae el prefijo "CEDEAR" (ya pasó con KEEL y ORCL).
  if (secc === "CEDEARS" || nombre.startsWith("CEDEAR") || TICKERS_CEDEAR_SIN_PREFIJO.has(tick)) {
    return { claseActivo: CLASES.CEDEAR, sector: INFO_POR_TICKER[tick]?.sector || "Sin clasificar" };
  }
  if (esDivisaEfectivo(nombre)) {
    return { claseActivo: CLASES.EFECTIVO, sector: "Efectivo y equivalentes" };
  }
  if (BONO_SOBERANO_RE.test(nombre) || TICKER_BONO_SOBERANO_RE.test(tick)) {
    return { claseActivo: CLASES.BONO_SOBERANO, sector: "Renta fija soberana" };
  }
  if (INFO_POR_TICKER[tick]?.sector) {
    // Sin la sección del Portafolio no hay forma de distinguir un CEDEAR de una
    // acción local solo por el ticker: los externos (US/ADR) cotizan como CEDEAR,
    // y los locales están en TICKERS_ACCION_LOCAL.
    const claseActivo = TICKERS_ACCION_LOCAL.has(tick) ? CLASES.ACCION_LOCAL : CLASES.CEDEAR;
    return { claseActivo, sector: INFO_POR_TICKER[tick].sector };
  }
  return { claseActivo: CLASES.OTRO, sector: null };
}

/** Cauciones/colocaciones transitorias: se calculan por neteo de flujos, no por cantidad de instrumento. */
export function esCaucion(nombre, operacion) {
  return CAUCION_RE.test(operacion || "") || CAUCION_RE.test(nombre || "");
}

/** Tenencia de dólar billete: misma clase visual "Efectivo", pero se sigue trackeando por cantidad y precio (cotización). */
export function esDivisaEfectivo(nombre) {
  const n = (nombre || "").toUpperCase();
  return n.includes("DOLARES USA") || n.includes("DÓLARES USA");
}

/** Aplica el override manual guardado por el usuario (si existe) sobre la heurística. */
export function aplicarOverride(clave, base, overrides) {
  const o = overrides?.[clave];
  if (!o) return base;
  return {
    claseActivo: o.claseActivo || base.claseActivo,
    sector: o.sector !== undefined ? o.sector : base.sector,
  };
}

/** Nombre para mostrar: el que haya cargado el usuario a mano, si no el que resolvimos solos. */
export function nombrePersonalizado(clave, nombreBase, overrides) {
  return overrides?.[clave]?.nombre || nombreBase;
}
