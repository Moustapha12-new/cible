export function locationKey(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

const regions: Record<string, string> = {
  "Île-de-France": "75 77 78 91 92 93 94 95",
  "Provence-Alpes-Côte d’Azur": "04 05 06 13 83 84",
  "Nouvelle-Aquitaine": "16 17 19 23 24 33 40 47 64 79 86 87",
  "Auvergne-Rhône-Alpes": "01 03 07 15 26 38 42 43 63 69 73 74",
  "Occitanie": "09 11 12 30 31 32 34 46 48 65 66 81 82",
  "Pays de la Loire": "44 49 53 72 85",
  "Bretagne": "22 29 35 56",
  "Grand Est": "08 10 51 52 54 55 57 67 68 88",
  "Hauts-de-France": "02 59 60 62 80",
  "Normandie": "14 27 50 61 76",
  "Centre-Val de Loire": "18 28 36 37 41 45",
  "Bourgogne-Franche-Comté": "21 25 39 58 70 71 89 90",
  "Corse": "2A 2B",
};
const cityRegions: Record<string, string[]> = {
  "Île-de-France": ["Paris", "Courbevoie", "La Défense", "Nanterre", "Rueil-Malmaison", "Colombes", "La Garenne-Colombes", "Gennevilliers", "Clichy", "Montreuil", "Bobigny", "Saint-Denis", "Fontenay-aux-Roses", "Saclay", "Palaiseau", "Massy", "Moissy-Cramayel", "Évry-Courcouronnes", "Le Mesnil-Amelot", "Guyancourt", "Poissy", "Versailles", "Le Plessis-Robinson", "Boulogne-Billancourt", "Issy-les-Moulineaux", "Saint-Cloud", "Suresnes", "Malakoff", "Montrouge", "Antony", "Bagneux", "Chatillon", "Clamart", "Meudon", "Vélizy-Villacoublay", "Créteil", "Vincennes", "Ivry-sur-Seine", "Vitry-sur-Seine", "Pantin", "Aubervilliers", "Noisy-le-Grand", "Saint-Ouen", "Saint-Ouen-sur-Seine", "Cergy", "Pontoise", "Argenteuil", "Bezons", "Trappes", "Les Ulis"],
  "Provence-Alpes-Côte d’Azur": ["Marseille", "Aix-en-Provence", "Gardanne", "Nice", "Toulon", "Saint-Tropez", "Cannes", "Antibes", "Avignon", "Marignane"],
  "Nouvelle-Aquitaine": ["Bordeaux", "Mérignac", "Pessac", "Talence", "Pau", "Bayonne", "La Rochelle", "Poitiers", "Limoges"],
  "Auvergne-Rhône-Alpes": ["Lyon", "Grenoble", "Meylan", "Chambéry", "Annecy", "Saint-Priest", "Clermont-Ferrand", "Belley", "Villeurbanne"],
  "Occitanie": ["Toulouse", "Blagnac", "Montpellier", "Nîmes", "Bagnols-sur-Cèze"],
  "Pays de la Loire": ["Nantes", "Carquefou", "Orvault", "Montaigu", "Angers", "Le Mans", "Saint-Nazaire"],
  "Bretagne": ["Rennes", "Quimper", "Brest", "Lorient"],
  "Grand Est": ["Strasbourg", "Geispolsheim", "Metz", "Nancy", "Reims"],
  "Hauts-de-France": ["Lille", "Dunkerque", "Amiens"],
  "Normandie": ["Rouen", "Caen", "Le Havre"],
  "Centre-Val de Loire": ["Tours", "Orléans", "Saint-Cyr-en-Val"],
  "Bourgogne-Franche-Comté": ["Dijon", "Besançon", "Chalon-sur-Saône"],
};

/** Normalize extraction noise without changing the stored offer. */
export function offerLocation(value?: string): { city: string; region: string } {
  const raw = (value ?? "").trim();
  if (!raw || /^(?:ce\b|cette\b|vous\b|nous\b|missions?\b|non pr[eé]cis[eé]|france|recrutement|candidature|publi[eé]|voir|stage|bac\b|hybride|t[eé]l[eé]travail)/i.test(raw)) return { city: "", region: "" };
  const department = raw.match(/\((\d{2}|2[AB])\)/i)?.[1]?.toUpperCase();
  const city = raw.split(/,|\(|\bil y a\b|\d+[,.]\d+\s*€|\bRecrutement\b|\bCandidature\b|\bPublié\b/i)[0].trim().replace(/\s+\d+(?:er|e|ème)?(?:\s+arrondissement)?$/i, "");
  const key = locationKey(city);
  const normalized = locationKey(raw);
  const region = Object.keys(regions).find(name => normalized.includes(locationKey(name)))
    ?? Object.keys(regions).find(name => department && regions[name].split(" ").includes(department))
    ?? Object.keys(cityRegions).find(name => cityRegions[name].some(known => locationKey(known) === key))
    ?? "";
  return { city: city.length <= 60 && city.split(/\s+/).length <= 6 && key !== locationKey(region) && /^[\p{L}][\p{L} ’'–.\-]+$/u.test(city) ? city : "", region };
}
