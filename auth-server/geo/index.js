// Índice geográfico compacto (carga perezosa).
// 250 países / 5308 estados / ~152k ciudades en memoria (~30 MB pico).
const fs = require('fs');
const path = require('path');

const DIR = __dirname;

let cache = null;

function fold(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function load() {
  if (cache) return cache;
  const countries = JSON.parse(fs.readFileSync(path.join(DIR, 'countries.json'), 'utf8'));
  const states = JSON.parse(fs.readFileSync(path.join(DIR, 'states.json'), 'utf8'));
  const cities = JSON.parse(fs.readFileSync(path.join(DIR, 'cities.json'), 'utf8'));

  const byCountry = new Map();
  for (const st of states) {
    if (!byCountry.has(st.cc)) byCountry.set(st.cc, []);
    byCountry.get(st.cc).push({ code: st.code, name: st.name });
  }
  for (const list of byCountry.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const byState = new Map();
  for (const c of cities) {
    const key = `${c.cc}|${c.sc}`;
    if (!byState.has(key)) byState.set(key, []);
    byState.get(key).push(c.n);
  }
  for (const list of byState.values()) {
    list.sort((a, b) => a.localeCompare(b));
  }

  cache = { countries, byCountry, byState };
  return cache;
}

function listCountries() {
  return load().countries;
}

function listStates(countryCode) {
  const { byCountry } = load();
  return byCountry.get(String(countryCode || '').toUpperCase()) || [];
}

// Búsqueda por prefijo (con plegado de acentos), máx `limit` resultados.
function searchCities(countryCode, stateCode, q, limit = 50) {
  const { byState } = load();
  const key = `${String(countryCode || '').toUpperCase()}|${String(stateCode || '').toUpperCase()}`;
  const list = byState.get(key);
  if (!list) return [];
  const needle = fold(q).trim();
  if (!needle) return list.slice(0, limit);
  const out = [];
  for (const name of list) {
    if (fold(name).startsWith(needle)) {
      out.push(name);
      if (out.length >= limit) break;
    }
  }
  if (out.length < limit) {
    for (const name of list) {
      if (out.length >= limit) break;
      if (out.includes(name)) continue;
      if (fold(name).includes(needle)) out.push(name);
    }
  }
  return out;
}

module.exports = { listCountries, listStates, searchCities };
