import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outputPath = path.join(rootDir, "data", "latest-facts.json");
const endpoint = "https://query.wikidata.org/sparql";
const wefJapanUrl =
  "https://www.weforum.org/publications/global-gender-gap-report-2025/in-full/benchmarking-gender-gaps-2025/";
const wefTopPerformersUrl =
  "https://www.weforum.org/press/2025/06/gender-gap-closes-at-fastest-rate-since-pandemic-but-full-parity-still-over-a-century-away/";
const genderGapYear = "2025";
const genderGapJapanRank = "118";
const genderGapJapanScore = "66.6%";
const genderGapTopTen = [
  { rank: 1, country: "アイスランド", score: "92.6%" },
  { rank: 2, country: "フィンランド", score: "87.9%" },
  { rank: 3, country: "ノルウェー", score: "86.3%" },
  { rank: 4, country: "イギリス", score: "83.8%" },
  { rank: 5, country: "ニュージーランド", score: "82.7%" },
  { rank: 6, country: "スウェーデン", score: "81.7%" },
  { rank: 7, country: "モルドバ", score: "81.3%" },
  { rank: 8, country: "ナミビア", score: "81.1%" },
  { rank: 9, country: "ドイツ", score: "80.3%" },
  { rank: 10, country: "アイルランド", score: "80.1%" }
];

function todayIsoJst() {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(new Date());
}

function updatedAtJst() {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  return `${formatter.format(new Date()).replace(" ", "T")}+09:00`;
}

async function runSparql(query) {
  const url = `${endpoint}?format=json&query=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": "AI-Feminista-LatestFacts/1.0 (https://ai-feminista.onrender.com)"
    }
  });

  if (!response.ok) {
    throw new Error(`Wikidata request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.results.bindings;
}

function bindingValue(binding, key) {
  return binding?.[key]?.value ?? "";
}

function firstNonEmpty(...values) {
  return values.find((value) => typeof value === "string" && value.length > 0) ?? "";
}

function isFemaleGender(genderLabel) {
  return genderLabel.includes("女性") || genderLabel.toLowerCase().includes("female");
}

function buildPrimeMinisterFact(binding) {
  const personLabel = firstNonEmpty(
    bindingValue(binding, "personLabelJa"),
    bindingValue(binding, "personLabelEn")
  );
  const genderLabel = firstNonEmpty(
    bindingValue(binding, "genderLabelJa"),
    bindingValue(binding, "genderLabelEn")
  );
  const asOf = todayIsoJst();

  return {
    id: "jp-prime-minister",
    title: "日本の首相",
    keywords: ["首相", "日本の首相", "総理", personLabel, "女性首相"],
    summary: isFemaleGender(genderLabel)
      ? `${asOf}時点で、日本の首相は${personLabel}で、女性首相です。`
      : `${asOf}時点で、日本の首相は${personLabel}です。`,
    asOf,
    source: "Wikidata",
    sourceUrl: bindingValue(binding, "person") || "https://www.wikidata.org/wiki/Q17",
    notes: "首相や女性政治参加の話題で参照"
  };
}

function buildTokyoGovernorFact(binding) {
  const personLabel = firstNonEmpty(
    bindingValue(binding, "personLabelJa"),
    bindingValue(binding, "personLabelEn")
  );
  const genderLabel = firstNonEmpty(
    bindingValue(binding, "genderLabelJa"),
    bindingValue(binding, "genderLabelEn")
  );
  const asOf = todayIsoJst();

  return {
    id: "tokyo-governor",
    title: "東京都知事",
    keywords: ["東京都知事", "東京の知事", "小池", personLabel, "女性知事"],
    summary: isFemaleGender(genderLabel)
      ? `${asOf}時点で、東京都知事は${personLabel}で、女性知事です。`
      : `${asOf}時点で、東京都知事は${personLabel}です。`,
    asOf,
    source: "Wikidata",
    sourceUrl: bindingValue(binding, "person") || "https://www.wikidata.org/wiki/Q1490",
    notes: "女性首長や政治参加の話題で参照"
  };
}

function buildGenderGapJapanFact({ year, rank, score }) {
  return {
    id: "gender-gap-japan",
    title: "日本のジェンダーギャップ指数",
    keywords: [
      "ジェンダーギャップ",
      "ジェンダーギャップ指数",
      "日本のジェンダーギャップ",
      "日本の順位",
      "最新ランキング"
    ],
    summary: `${year}年のジェンダーギャップ指数で、日本は${rank}位、スコアは${score}です。`,
    asOf: todayIsoJst(),
    source: "World Economic Forum",
    sourceUrl: wefJapanUrl,
    notes: "ジェンダーギャップ指数や日本の順位の話題で参照"
  };
}

function buildGenderGapTopFact({ year, leaders }) {
  const leaderNames = leaders.map((leader) => leader.country);
  const topTen = leaders
    .map((leader) => `${leader.rank}位${leader.country}`)
    .join("、");

  return {
    id: "gender-gap-top-performers",
    title: "ジェンダーギャップ指数の上位国",
    keywords: [
      "ジェンダーギャップ",
      "ジェンダーギャップ指数",
      "上位の国",
      "上位国",
      "トップ10",
      "トップ国",
      "最新ランキング",
      ...leaderNames
    ],
    summary: `${year}年のジェンダーギャップ指数トップ10は、${topTen}です。`,
    asOf: todayIsoJst(),
    source: "World Economic Forum",
    sourceUrl: wefTopPerformersUrl,
    notes: "ジェンダーギャップ指数の上位国や最新ランキングの話題で参照"
  };
}

async function fetchGenderGapFacts() {
  return [
    buildGenderGapJapanFact({
      year: genderGapYear,
      rank: genderGapJapanRank,
      score: genderGapJapanScore
    }),
    buildGenderGapTopFact({
      year: genderGapYear,
      leaders: genderGapTopTen
    })
  ];
}

const currentPrimeMinisterQuery = `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?person ?personLabelJa ?personLabelEn ?genderLabelJa ?genderLabelEn WHERE {
  wd:Q17 wdt:P6 ?person.
  OPTIONAL { ?person rdfs:label ?personLabelJa FILTER(LANG(?personLabelJa) = "ja") }
  OPTIONAL { ?person rdfs:label ?personLabelEn FILTER(LANG(?personLabelEn) = "en") }
  OPTIONAL {
    ?person wdt:P21 ?gender.
    OPTIONAL { ?gender rdfs:label ?genderLabelJa FILTER(LANG(?genderLabelJa) = "ja") }
    OPTIONAL { ?gender rdfs:label ?genderLabelEn FILTER(LANG(?genderLabelEn) = "en") }
  }
}
LIMIT 1
`;

const currentTokyoGovernorQuery = `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?person ?personLabelJa ?personLabelEn ?genderLabelJa ?genderLabelEn WHERE {
  wd:Q1490 wdt:P6 ?person.
  OPTIONAL { ?person rdfs:label ?personLabelJa FILTER(LANG(?personLabelJa) = "ja") }
  OPTIONAL { ?person rdfs:label ?personLabelEn FILTER(LANG(?personLabelEn) = "en") }
  OPTIONAL {
    ?person wdt:P21 ?gender.
    OPTIONAL { ?gender rdfs:label ?genderLabelJa FILTER(LANG(?genderLabelJa) = "ja") }
    OPTIONAL { ?gender rdfs:label ?genderLabelEn FILTER(LANG(?genderLabelEn) = "en") }
  }
}
LIMIT 1
`;

async function main() {
  const facts = [];
  const sourceResults = await Promise.allSettled([
    Promise.all([runSparql(currentPrimeMinisterQuery), runSparql(currentTokyoGovernorQuery)]),
    fetchGenderGapFacts()
  ]);

  const wikidataResult = sourceResults[0];

  if (wikidataResult.status === "fulfilled") {
    const [primeMinisterBindings, tokyoGovernorBindings] = wikidataResult.value;

    if (primeMinisterBindings[0]) {
      facts.push(buildPrimeMinisterFact(primeMinisterBindings[0]));
    }

    if (tokyoGovernorBindings[0]) {
      facts.push(buildTokyoGovernorFact(tokyoGovernorBindings[0]));
    }
  } else {
    console.error("[latest-facts] Wikidata update failed", wikidataResult.reason);
  }

  const genderGapResult = sourceResults[1];

  if (genderGapResult.status === "fulfilled") {
    facts.push(...genderGapResult.value);
  } else {
    console.error("[latest-facts] WEF gender-gap update failed", genderGapResult.reason);
  }

  const payload = {
    updatedAt: updatedAtJst(),
    facts
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`Updated ${facts.length} latest facts at ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
