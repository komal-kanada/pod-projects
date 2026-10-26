/**
 * World Bank regions and economies, with the aliases reports actually use.
 * Used twice: deterministic metadata tagging at ingest (extract.ts), and
 * validating the filters the LLM proposes at query time (validate.ts) — an
 * unknown region or country is dropped instead of silently hiding results.
 */

export const REGIONS: Record<string, { name: string; aliases: string[] }> = {
  EAP: { name: "East Asia and Pacific", aliases: ["East Asia and the Pacific", "East Asia & Pacific", "EAP"] },
  ECA: { name: "Europe and Central Asia", aliases: ["Europe & Central Asia", "ECA", "Emerging Europe"] },
  LAC: { name: "Latin America and the Caribbean", aliases: ["Latin America and Caribbean", "Latin America & the Caribbean", "Latin America", "LAC"] },
  MNA: { name: "Middle East and North Africa", aliases: ["Middle East, North Africa", "Middle East & North Africa", "MENA", "MNA", "MENAAP"] },
  SAR: { name: "South Asia", aliases: ["South Asia Region", "SAR"] },
  SSA: { name: "Sub-Saharan Africa", aliases: ["Sub Saharan Africa", "SSA", "Africa South of the Sahara"] },
};

export const REGION_CODES = Object.keys(REGIONS);

/** ISO3 | name | aliases… — World Bank economies (alphabetical by code). */
const ECONOMIES = `
AFG|Afghanistan
AGO|Angola
ALB|Albania
ARE|United Arab Emirates|UAE
ARG|Argentina
ARM|Armenia
ATG|Antigua and Barbuda
AUS|Australia
AUT|Austria
AZE|Azerbaijan
BDI|Burundi
BEL|Belgium
BEN|Benin
BFA|Burkina Faso
BGD|Bangladesh
BGR|Bulgaria
BHR|Bahrain
BHS|Bahamas|The Bahamas|Bahamas, The
BIH|Bosnia and Herzegovina
BLR|Belarus
BLZ|Belize
BOL|Bolivia
BRA|Brazil
BRB|Barbados
BRN|Brunei Darussalam|Brunei
BTN|Bhutan
BWA|Botswana
CAF|Central African Republic
CAN|Canada
CHE|Switzerland
CHL|Chile
CHN|China|People's Republic of China
CIV|Côte d'Ivoire|Cote d'Ivoire|Ivory Coast
CMR|Cameroon
COD|Democratic Republic of Congo|Democratic Republic of the Congo|Congo, Dem. Rep.|DRC
COG|Republic of Congo|Congo, Rep.
COL|Colombia
COM|Comoros
CPV|Cabo Verde|Cape Verde
CRI|Costa Rica
CYP|Cyprus
CZE|Czechia|Czech Republic
DEU|Germany
DJI|Djibouti
DMA|Dominica
DNK|Denmark
DOM|Dominican Republic
DZA|Algeria
ECU|Ecuador
EGY|Egypt|Arab Republic of Egypt|Egypt, Arab Rep.
ERI|Eritrea
ESP|Spain
EST|Estonia
ETH|Ethiopia
FIN|Finland
FJI|Fiji
FRA|France
FSM|Micronesia|Federated States of Micronesia
GAB|Gabon
GBR|United Kingdom|UK|Britain
GEO|Georgia
GHA|Ghana
GIN|Guinea
GMB|The Gambia|Gambia|Gambia, The
GNB|Guinea-Bissau
GNQ|Equatorial Guinea
GRC|Greece
GRD|Grenada
GTM|Guatemala
GUY|Guyana
HND|Honduras
HRV|Croatia
HTI|Haiti
HUN|Hungary
IDN|Indonesia
IND|India
IRL|Ireland
IRN|Iran|Islamic Republic of Iran|Iran, Islamic Rep.
IRQ|Iraq
ISL|Iceland
ISR|Israel
ITA|Italy
JAM|Jamaica
JOR|Jordan
JPN|Japan
KAZ|Kazakhstan
KEN|Kenya
KGZ|Kyrgyz Republic|Kyrgyzstan
KHM|Cambodia
KIR|Kiribati
KNA|St. Kitts and Nevis|Saint Kitts and Nevis
KOR|Korea|Republic of Korea|South Korea|Korea, Rep.
KWT|Kuwait
LAO|Lao PDR|Lao People's Democratic Republic|Laos
LBN|Lebanon
LBR|Liberia
LBY|Libya
LCA|St. Lucia|Saint Lucia
LKA|Sri Lanka
LSO|Lesotho
LTU|Lithuania
LUX|Luxembourg
LVA|Latvia
MAR|Morocco
MDA|Moldova
MDG|Madagascar
MDV|Maldives
MEX|Mexico
MHL|Marshall Islands
MKD|North Macedonia
MLI|Mali
MLT|Malta
MMR|Myanmar
MNE|Montenegro
MNG|Mongolia
MOZ|Mozambique
MRT|Mauritania
MUS|Mauritius
MWI|Malawi
MYS|Malaysia
NAM|Namibia
NER|Niger
NGA|Nigeria
NIC|Nicaragua
NLD|Netherlands
NOR|Norway
NPL|Nepal
NRU|Nauru
NZL|New Zealand
OMN|Oman
PAK|Pakistan
PAN|Panama
PER|Peru
PHL|Philippines
PLW|Palau
PNG|Papua New Guinea
POL|Poland
PRT|Portugal
PRY|Paraguay
PSE|West Bank and Gaza
QAT|Qatar
ROU|Romania
RUS|Russian Federation|Russia
RWA|Rwanda
SAU|Saudi Arabia
SDN|Sudan
SEN|Senegal
SGP|Singapore
SLB|Solomon Islands
SLE|Sierra Leone
SLV|El Salvador
SOM|Somalia
SRB|Serbia
SSD|South Sudan
STP|São Tomé and Príncipe|Sao Tome and Principe
SUR|Suriname
SVK|Slovak Republic|Slovakia
SVN|Slovenia
SWE|Sweden
SWZ|Eswatini|Swaziland
SYC|Seychelles
SYR|Syrian Arab Republic|Syria
TCD|Chad
TGO|Togo
THA|Thailand
TJK|Tajikistan
TKM|Turkmenistan
TLS|Timor-Leste|East Timor
TON|Tonga
TTO|Trinidad and Tobago
TUN|Tunisia
TUR|Türkiye|Turkiye|Turkey
TUV|Tuvalu
TZA|Tanzania
UGA|Uganda
UKR|Ukraine
URY|Uruguay
USA|United States|U.S.|US economy|United States of America
UZB|Uzbekistan
VCT|St. Vincent and the Grenadines|Saint Vincent and the Grenadines
VEN|Venezuela|República Bolivariana de Venezuela
VNM|Viet Nam|Vietnam
VUT|Vanuatu
WSM|Samoa
YEM|Yemen|Republic of Yemen|Yemen, Rep.
ZAF|South Africa
ZMB|Zambia
ZWE|Zimbabwe
`;

export const COUNTRIES: Record<string, { name: string; aliases: string[] }> = Object.fromEntries(
  ECONOMIES.trim()
    .split("\n")
    .map((line) => {
      const [code, name, ...aliases] = line.split("|");
      return [code, { name, aliases }];
    }),
);

export const COUNTRY_CODES = Object.keys(COUNTRIES);

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compiled matchers: whole-phrase, case-insensitive. Short all-caps aliases
 * (UAE, DRC, SAR) match case-sensitively so "sar" or "us" in prose don't fire.
 */
function matcher(names: string[]): RegExp[] {
  return names.map((name) => {
    const caseSensitive = /^[A-Z.]{2,5}$/.test(name);
    return new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, caseSensitive ? "u" : "iu");
  });
}

export const REGION_MATCHERS = Object.entries(REGIONS).map(([code, r]) => ({
  code,
  patterns: matcher([r.name, ...r.aliases]),
}));

export const COUNTRY_MATCHERS = Object.entries(COUNTRIES).map(([code, c]) => ({
  code,
  patterns: matcher([c.name, ...c.aliases]),
}));
