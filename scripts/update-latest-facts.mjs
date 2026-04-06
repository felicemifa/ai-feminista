import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outputPath = path.join(rootDir, "data", "latest-facts.json");
const endpoint = "https://query.wikidata.org/sparql";

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
  const [primeMinisterBindings, tokyoGovernorBindings] = await Promise.all([
    runSparql(currentPrimeMinisterQuery),
    runSparql(currentTokyoGovernorQuery)
  ]);

  const facts = [];

  if (primeMinisterBindings[0]) {
    facts.push(buildPrimeMinisterFact(primeMinisterBindings[0]));
  }

  if (tokyoGovernorBindings[0]) {
    facts.push(buildTokyoGovernorFact(tokyoGovernorBindings[0]));
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
