#!/usr/bin/env node
// Preprocesa countries+states+cities.json (dr5hn) a 3 JSON compactos:
//   geo/countries.json -> [{ code, name }]
//   geo/states.json    -> [{ cc, code, name }]
//   geo/cities.json    -> [{ cc, sc, n }]
// Uso: node scripts/build-geo.js
const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, '..', 'geo', 'raw', 'full.json');
const OUT = path.join(__dirname, '..', 'geo');

const data = JSON.parse(fs.readFileSync(RAW, 'utf8'));

const countries = [];
const states = [];
const cities = [];
const citySeen = new Set();
let skippedStates = 0;
let skippedCities = 0;

for (const country of data) {
  const cc = country.iso2;
  if (!cc) continue;
  countries.push({ code: cc, name: country.name });
  for (const state of country.states || []) {
    let sc = state.iso2 || '';
    if (!sc) {
      const m = /-([A-Z0-9]{1,6})$/.exec(state.iso3166_2 || '');
      sc = m ? m[1] : '';
    }
    if (!sc) {
      skippedStates++;
      continue;
    }
    states.push({ cc, code: sc, name: state.name });
    for (const city of state.cities || []) {
      const n = city.name;
      if (!n) {
        skippedCities++;
        continue;
      }
      const key = `${cc}|${sc}|${n.toLowerCase()}`;
      if (citySeen.has(key)) {
        skippedCities++;
        continue;
      }
      citySeen.add(key);
      cities.push({ cc, sc, n });
    }
  }
}

fs.writeFileSync(path.join(OUT, 'countries.json'), JSON.stringify(countries));
fs.writeFileSync(path.join(OUT, 'states.json'), JSON.stringify(states));
fs.writeFileSync(path.join(OUT, 'cities.json'), JSON.stringify(cities));

console.log(JSON.stringify({
  countries: countries.length,
  states: states.length,
  cities: cities.length,
  skippedStates,
  skippedCities,
  countriesMB: (fs.statSync(path.join(OUT, 'countries.json')).size / 1024 / 1024).toFixed(2),
  statesMB: (fs.statSync(path.join(OUT, 'states.json')).size / 1024 / 1024).toFixed(2),
  citiesMB: (fs.statSync(path.join(OUT, 'cities.json')).size / 1024 / 1024).toFixed(2),
}, null, 2));
