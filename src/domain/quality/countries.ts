import { stripDiacritics } from "../shared/text";

/**
 * Static ISO 3166-1 table: alpha-2, alpha-3, canonical English short name, aliases.
 *
 * Static on purpose: `Intl.DisplayNames` output depends on the ICU build, so Node and
 * browsers can disagree. A table gives the same answer everywhere and is easy to test.
 */
export interface Country {
  alpha2: string;
  alpha3: string;
  name: string;
}

type Row = readonly [alpha2: string, alpha3: string, name: string, ...aliases: string[]];

// prettier-ignore
const TABLE: readonly Row[] = [
  ["AF", "AFG", "Afghanistan"],
  ["AX", "ALA", "Åland Islands", "Aland"],
  ["AL", "ALB", "Albania", "Shqipëria"],
  ["DZ", "DZA", "Algeria"],
  ["AS", "ASM", "American Samoa"],
  ["AD", "AND", "Andorra"],
  ["AO", "AGO", "Angola"],
  ["AI", "AIA", "Anguilla"],
  ["AQ", "ATA", "Antarctica"],
  ["AG", "ATG", "Antigua and Barbuda", "Antigua"],
  ["AR", "ARG", "Argentina"],
  ["AM", "ARM", "Armenia"],
  ["AW", "ABW", "Aruba"],
  ["AU", "AUS", "Australia"],
  ["AT", "AUT", "Austria", "Österreich", "Osterreich"],
  ["AZ", "AZE", "Azerbaijan"],
  ["BS", "BHS", "Bahamas", "The Bahamas"],
  ["BH", "BHR", "Bahrain"],
  ["BD", "BGD", "Bangladesh"],
  ["BB", "BRB", "Barbados"],
  ["BY", "BLR", "Belarus"],
  ["BE", "BEL", "Belgium", "Belgique", "België", "Belgien"],
  ["BZ", "BLZ", "Belize"],
  ["BJ", "BEN", "Benin"],
  ["BM", "BMU", "Bermuda"],
  ["BT", "BTN", "Bhutan"],
  ["BO", "BOL", "Bolivia", "Plurinational State of Bolivia"],
  ["BQ", "BES", "Bonaire, Sint Eustatius and Saba", "Caribbean Netherlands"],
  ["BA", "BIH", "Bosnia and Herzegovina", "Bosnia", "Bosnia-Herzegovina"],
  ["BW", "BWA", "Botswana"],
  ["BV", "BVT", "Bouvet Island"],
  ["BR", "BRA", "Brazil", "Brasil"],
  ["IO", "IOT", "British Indian Ocean Territory"],
  ["BN", "BRN", "Brunei", "Brunei Darussalam"],
  ["BG", "BGR", "Bulgaria"],
  ["BF", "BFA", "Burkina Faso"],
  ["BI", "BDI", "Burundi"],
  ["CV", "CPV", "Cabo Verde", "Cape Verde"],
  ["KH", "KHM", "Cambodia"],
  ["CM", "CMR", "Cameroon"],
  ["CA", "CAN", "Canada"],
  ["KY", "CYM", "Cayman Islands"],
  ["CF", "CAF", "Central African Republic"],
  ["TD", "TCD", "Chad"],
  ["CL", "CHL", "Chile"],
  ["CN", "CHN", "China", "People's Republic of China", "PRC", "Mainland China"],
  ["CX", "CXR", "Christmas Island"],
  ["CC", "CCK", "Cocos (Keeling) Islands", "Cocos Islands"],
  ["CO", "COL", "Colombia"],
  ["KM", "COM", "Comoros"],
  ["CG", "COG", "Congo", "Republic of the Congo", "Congo-Brazzaville"],
  ["CD", "COD", "Democratic Republic of the Congo", "DR Congo", "DRC", "Congo-Kinshasa"],
  ["CK", "COK", "Cook Islands"],
  ["CR", "CRI", "Costa Rica"],
  ["CI", "CIV", "Côte d'Ivoire", "Ivory Coast"],
  ["HR", "HRV", "Croatia", "Hrvatska"],
  ["CU", "CUB", "Cuba"],
  ["CW", "CUW", "Curaçao"],
  ["CY", "CYP", "Cyprus"],
  ["CZ", "CZE", "Czechia", "Czech Republic", "Česko", "Česká republika"],
  ["DK", "DNK", "Denmark", "Danmark"],
  ["DJ", "DJI", "Djibouti"],
  ["DM", "DMA", "Dominica"],
  ["DO", "DOM", "Dominican Republic"],
  ["EC", "ECU", "Ecuador"],
  ["EG", "EGY", "Egypt"],
  ["SV", "SLV", "El Salvador"],
  ["GQ", "GNQ", "Equatorial Guinea"],
  ["ER", "ERI", "Eritrea"],
  ["EE", "EST", "Estonia", "Eesti"],
  ["SZ", "SWZ", "Eswatini", "Swaziland"],
  ["ET", "ETH", "Ethiopia"],
  ["FK", "FLK", "Falkland Islands"],
  ["FO", "FRO", "Faroe Islands"],
  ["FJ", "FJI", "Fiji"],
  ["FI", "FIN", "Finland", "Suomi"],
  ["FR", "FRA", "France", "Frankreich"],
  ["GF", "GUF", "French Guiana"],
  ["PF", "PYF", "French Polynesia"],
  ["TF", "ATF", "French Southern Territories"],
  ["GA", "GAB", "Gabon"],
  ["GM", "GMB", "Gambia", "The Gambia"],
  ["GE", "GEO", "Georgia"],
  ["DE", "DEU", "Germany", "Deutschland", "Federal Republic of Germany", "Niemcy"],
  ["GH", "GHA", "Ghana"],
  ["GI", "GIB", "Gibraltar"],
  ["GR", "GRC", "Greece", "Hellas"],
  ["GL", "GRL", "Greenland"],
  ["GD", "GRD", "Grenada"],
  ["GP", "GLP", "Guadeloupe"],
  ["GU", "GUM", "Guam"],
  ["GT", "GTM", "Guatemala"],
  ["GG", "GGY", "Guernsey"],
  ["GN", "GIN", "Guinea"],
  ["GW", "GNB", "Guinea-Bissau"],
  ["GY", "GUY", "Guyana"],
  ["HT", "HTI", "Haiti"],
  ["HM", "HMD", "Heard Island and McDonald Islands"],
  ["VA", "VAT", "Holy See", "Vatican", "Vatican City"],
  ["HN", "HND", "Honduras"],
  ["HK", "HKG", "Hong Kong", "Hong Kong SAR"],
  ["HU", "HUN", "Hungary", "Magyarország"],
  ["IS", "ISL", "Iceland"],
  ["IN", "IND", "India"],
  ["ID", "IDN", "Indonesia"],
  ["IR", "IRN", "Iran", "Islamic Republic of Iran"],
  ["IQ", "IRQ", "Iraq"],
  ["IE", "IRL", "Ireland", "Republic of Ireland", "Éire"],
  ["IM", "IMN", "Isle of Man"],
  ["IL", "ISR", "Israel"],
  ["IT", "ITA", "Italy", "Italia", "Włochy"],
  ["JM", "JAM", "Jamaica"],
  ["JP", "JPN", "Japan"],
  ["JE", "JEY", "Jersey"],
  ["JO", "JOR", "Jordan"],
  ["KZ", "KAZ", "Kazakhstan"],
  ["KE", "KEN", "Kenya"],
  ["KI", "KIR", "Kiribati"],
  ["KP", "PRK", "North Korea", "DPRK", "Democratic People's Republic of Korea"],
  ["KR", "KOR", "South Korea", "Republic of Korea", "Korea, Republic of"],
  ["KW", "KWT", "Kuwait"],
  ["KG", "KGZ", "Kyrgyzstan"],
  ["LA", "LAO", "Laos", "Lao PDR", "Lao People's Democratic Republic"],
  ["LV", "LVA", "Latvia", "Latvija"],
  ["LB", "LBN", "Lebanon"],
  ["LS", "LSO", "Lesotho"],
  ["LR", "LBR", "Liberia"],
  ["LY", "LBY", "Libya"],
  ["LI", "LIE", "Liechtenstein"],
  ["LT", "LTU", "Lithuania", "Lietuva"],
  ["LU", "LUX", "Luxembourg"],
  ["MO", "MAC", "Macao", "Macau"],
  ["MG", "MDG", "Madagascar"],
  ["MW", "MWI", "Malawi"],
  ["MY", "MYS", "Malaysia"],
  ["MV", "MDV", "Maldives"],
  ["ML", "MLI", "Mali"],
  ["MT", "MLT", "Malta"],
  ["MH", "MHL", "Marshall Islands"],
  ["MQ", "MTQ", "Martinique"],
  ["MR", "MRT", "Mauritania"],
  ["MU", "MUS", "Mauritius"],
  ["YT", "MYT", "Mayotte"],
  ["MX", "MEX", "Mexico", "México"],
  ["FM", "FSM", "Micronesia", "Federated States of Micronesia"],
  ["MD", "MDA", "Moldova", "Republic of Moldova"],
  ["MC", "MCO", "Monaco"],
  ["MN", "MNG", "Mongolia"],
  ["ME", "MNE", "Montenegro"],
  ["MS", "MSR", "Montserrat"],
  ["MA", "MAR", "Morocco"],
  ["MZ", "MOZ", "Mozambique"],
  ["MM", "MMR", "Myanmar", "Burma"],
  ["NA", "NAM", "Namibia"],
  ["NR", "NRU", "Nauru"],
  ["NP", "NPL", "Nepal"],
  ["NL", "NLD", "Netherlands", "The Netherlands", "Holland", "Nederland"],
  ["NC", "NCL", "New Caledonia"],
  ["NZ", "NZL", "New Zealand"],
  ["NI", "NIC", "Nicaragua"],
  ["NE", "NER", "Niger"],
  ["NG", "NGA", "Nigeria"],
  ["NU", "NIU", "Niue"],
  ["NF", "NFK", "Norfolk Island"],
  ["MK", "MKD", "North Macedonia", "Macedonia", "FYROM"],
  ["MP", "MNP", "Northern Mariana Islands"],
  ["NO", "NOR", "Norway", "Norge"],
  ["OM", "OMN", "Oman"],
  ["PK", "PAK", "Pakistan"],
  ["PW", "PLW", "Palau"],
  ["PS", "PSE", "Palestine", "State of Palestine"],
  ["PA", "PAN", "Panama"],
  ["PG", "PNG", "Papua New Guinea"],
  ["PY", "PRY", "Paraguay"],
  ["PE", "PER", "Peru"],
  ["PH", "PHL", "Philippines"],
  ["PN", "PCN", "Pitcairn"],
  ["PL", "POL", "Poland", "Polska", "Republic of Poland"],
  ["PT", "PRT", "Portugal"],
  ["PR", "PRI", "Puerto Rico"],
  ["QA", "QAT", "Qatar"],
  ["RE", "REU", "Réunion"],
  ["RO", "ROU", "Romania", "România"],
  ["RU", "RUS", "Russia", "Russian Federation"],
  ["RW", "RWA", "Rwanda"],
  ["BL", "BLM", "Saint Barthélemy"],
  ["SH", "SHN", "Saint Helena, Ascension and Tristan da Cunha", "Saint Helena"],
  ["KN", "KNA", "Saint Kitts and Nevis", "St Kitts and Nevis"],
  ["LC", "LCA", "Saint Lucia", "St Lucia"],
  ["MF", "MAF", "Saint Martin (French part)", "Saint Martin"],
  ["PM", "SPM", "Saint Pierre and Miquelon"],
  ["VC", "VCT", "Saint Vincent and the Grenadines", "St Vincent and the Grenadines"],
  ["WS", "WSM", "Samoa"],
  ["SM", "SMR", "San Marino"],
  ["ST", "STP", "Sao Tome and Principe", "São Tomé and Príncipe"],
  ["SA", "SAU", "Saudi Arabia", "KSA"],
  ["SN", "SEN", "Senegal"],
  ["RS", "SRB", "Serbia"],
  ["SC", "SYC", "Seychelles"],
  ["SL", "SLE", "Sierra Leone"],
  ["SG", "SGP", "Singapore"],
  ["SX", "SXM", "Sint Maarten (Dutch part)", "Sint Maarten"],
  ["SK", "SVK", "Slovakia", "Slovensko", "Slovak Republic"],
  ["SI", "SVN", "Slovenia", "Slovenija"],
  ["SB", "SLB", "Solomon Islands"],
  ["SO", "SOM", "Somalia"],
  ["ZA", "ZAF", "South Africa"],
  ["GS", "SGS", "South Georgia and the South Sandwich Islands"],
  ["SS", "SSD", "South Sudan"],
  ["ES", "ESP", "Spain", "España", "Hiszpania"],
  ["LK", "LKA", "Sri Lanka"],
  ["SD", "SDN", "Sudan"],
  ["SR", "SUR", "Suriname"],
  ["SJ", "SJM", "Svalbard and Jan Mayen"],
  ["SE", "SWE", "Sweden", "Sverige"],
  ["CH", "CHE", "Switzerland", "Schweiz", "Suisse", "Svizzera"],
  ["SY", "SYR", "Syria", "Syrian Arab Republic"],
  ["TW", "TWN", "Taiwan", "Taiwan, Province of China"],
  ["TJ", "TJK", "Tajikistan"],
  ["TZ", "TZA", "Tanzania", "United Republic of Tanzania"],
  ["TH", "THA", "Thailand"],
  ["TL", "TLS", "Timor-Leste", "East Timor"],
  ["TG", "TGO", "Togo"],
  ["TK", "TKL", "Tokelau"],
  ["TO", "TON", "Tonga"],
  ["TT", "TTO", "Trinidad and Tobago", "Trinidad"],
  ["TN", "TUN", "Tunisia"],
  ["TR", "TUR", "Türkiye", "Turkey", "Turkiye"],
  ["TM", "TKM", "Turkmenistan"],
  ["TC", "TCA", "Turks and Caicos Islands"],
  ["TV", "TUV", "Tuvalu"],
  ["UG", "UGA", "Uganda"],
  ["UA", "UKR", "Ukraine"],
  ["AE", "ARE", "United Arab Emirates", "UAE", "Emirates"],
  ["GB", "GBR", "United Kingdom", "UK", "U.K.", "Great Britain", "Britain", "England", "Scotland", "Wales", "Northern Ireland", "United Kingdom of Great Britain and Northern Ireland"],
  ["US", "USA", "United States", "U.S.", "U.S.A.", "United States of America", "America"],
  ["UM", "UMI", "United States Minor Outlying Islands"],
  ["UY", "URY", "Uruguay"],
  ["UZ", "UZB", "Uzbekistan"],
  ["VU", "VUT", "Vanuatu"],
  ["VE", "VEN", "Venezuela", "Bolivarian Republic of Venezuela"],
  ["VN", "VNM", "Vietnam", "Viet Nam"],
  ["VG", "VGB", "British Virgin Islands"],
  ["VI", "VIR", "U.S. Virgin Islands", "US Virgin Islands"],
  ["WF", "WLF", "Wallis and Futuna"],
  ["EH", "ESH", "Western Sahara"],
  ["YE", "YEM", "Yemen"],
  ["ZM", "ZMB", "Zambia"],
  ["ZW", "ZWE", "Zimbabwe"],
];

/**
 * Inputs that match a country code but are more likely to mean something else.
 * "NA" in a country column is usually "not available", not Namibia. These are never
 * normalized automatically; the person decides.
 */
const AMBIGUOUS: Record<string, string> = {
  na: "“NA” is the code for Namibia but often means “not available”.",
};

export function countryKey(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.'’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");
}

interface CountryIndex {
  byName: Map<string, Country>;
  byAlpha2: Map<string, Country>;
  byAlpha3: Map<string, Country>;
}

let index: CountryIndex | null = null;

function getIndex(): CountryIndex {
  if (index) return index;
  const byName = new Map<string, Country>();
  const byAlpha2 = new Map<string, Country>();
  const byAlpha3 = new Map<string, Country>();
  for (const [alpha2, alpha3, name, ...aliases] of TABLE) {
    const country: Country = { alpha2, alpha3, name };
    byAlpha2.set(alpha2.toLowerCase(), country);
    byAlpha3.set(alpha3.toLowerCase(), country);
    for (const label of [name, ...aliases]) byName.set(countryKey(label), country);
  }
  index = { byName, byAlpha2, byAlpha3 };
  return index;
}

export type CountryResolution =
  | { status: "match"; country: Country; matchedBy: "name" | "alias" | "alpha2" | "alpha3" }
  | { status: "ambiguous"; reason: string }
  | { status: "unknown" };

/** Resolve free-text country input to a canonical country. Deterministic, case- and accent-insensitive. */
export function resolveCountry(value: string): CountryResolution {
  const key = countryKey(value);
  if (key === "") return { status: "unknown" };

  const ambiguous = AMBIGUOUS[key];
  if (ambiguous) return { status: "ambiguous", reason: ambiguous };

  const { byName, byAlpha2, byAlpha3 } = getIndex();
  const named = byName.get(key);
  if (named) {
    return {
      status: "match",
      country: named,
      matchedBy: countryKey(named.name) === key ? "name" : "alias",
    };
  }
  const compact = key.replace(/ /g, "");
  if (compact.length === 2) {
    const country = byAlpha2.get(compact);
    if (country) return { status: "match", country, matchedBy: "alpha2" };
  }
  if (compact.length === 3) {
    const country = byAlpha3.get(compact);
    if (country) return { status: "match", country, matchedBy: "alpha3" };
  }
  return { status: "unknown" };
}

export function countryCount(): number {
  return TABLE.length;
}
