/* ============================================================
   KhimVentures 🎲 — a dice roguelite (Capybara Go × Dicero)
   Vanilla JS, no build step. Saves under the kvg.* namespace
   so it never touches the tracker's kv.* data.

   Loop: pick a path → fight with dice (poker combos) → take a
   skill card → go deeper → beat the boss. Earn 🐟 to unlock new
   animal heroes and permanent talents between runs.
   ============================================================ */

/* ---------- storage (separate namespace from the tracker) ---------- */
const KVG = (() => {
  const PREFIX = 'kvg.';
  const get = (k, def) => {
    try { const v = localStorage.getItem(PREFIX + k); return v ? JSON.parse(v) : def; }
    catch { return def; }
  };
  const set = (k, v) => localStorage.setItem(PREFIX + k, JSON.stringify(v));
  const del = (k) => localStorage.removeItem(PREFIX + k);
  return { get, set, del };
})();

/* ---------- tiny helpers ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const rint = (n) => Math.floor(Math.random() * n);                 // 0..n-1
const pick = (arr) => arr[rint(arr.length)];
const chance = (p) => Math.random() < p;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

/* ============================================================
   CONTENT — heroes, talents, cards, enemies, events
   ============================================================ */

/* Heroes (the unlockable roster). `mod` tweaks the run's combat
   modifiers; `flags` carries special-case combat behaviour. */
const HEROES = [
  { id: 'cat',  emoji: '🐱', name: 'Mochi the Cat',   maxHp: 60, cost: 0,
    perk: 'Nine Lives — once per battle, survive a lethal hit at 1 HP.',
    flags: { nineLives: true } },
  { id: 'capy', emoji: '🦫', name: 'Captain Capy',    maxHp: 70, cost: 60,
    perk: 'Zen — start every battle with +1 reroll. Unflappable.',
    mod: (m) => { m.rerolls += 1; } },
  { id: 'fox',  emoji: '🦊', name: 'Rolf the Fox',    maxHp: 52, cost: 130,
    perk: 'Cunning — a single pair scores as three-of-a-kind.',
    flags: { pairAsThree: true } },
  { id: 'frog', emoji: '🐸', name: 'Sir Hops',        maxHp: 58, cost: 220,
    perk: 'Leapfrog — straights deal double damage and heal you 8.',
    flags: { straightSurge: true } },
  { id: 'owl',  emoji: '🦉', name: 'Professor Hoot',  maxHp: 56, cost: 340,
    perk: 'Foresight — +30% gold, and +1 reroll on Elite/Boss fights.',
    mod: (m) => { m.goldMult += 0.30; }, flags: { bossReroll: true } },
];
const heroById = (id) => HEROES.find(h => h.id === id) || HEROES[0];

/* Permanent talents bought with 🐟. Each has levels. */
const TALENTS = [
  { id: 'hearty',  emoji: '❤️', name: 'Hearty',     max: 5, cost: (l) => 40 + l * 30,
    desc: (l) => `+${(l + 1) * 8} max HP at the start of every run`, val: (l) => l * 8 },
  { id: 'greedy',  emoji: '💰', name: 'Greedy',     max: 4, cost: (l) => 50 + l * 40,
    desc: (l) => `+${(l + 1) * 15}% gold from battles`, val: (l) => l * 0.15 },
  { id: 'sharp',   emoji: '🗡️', name: 'Sharpened',  max: 4, cost: (l) => 50 + l * 40,
    desc: (l) => `+${(l + 1)} flat damage on every attack`, val: (l) => l },
  { id: 'prepared',emoji: '🎒', name: 'Prepared',   max: 1, cost: () => 90,
    desc: () => `Start each run already holding a random skill card`, val: (l) => l },
  { id: 'lucky',   emoji: '🍀', name: 'Lucky Start', max: 3, cost: (l) => 45 + l * 35,
    desc: (l) => `Begin each run with +${(l + 1) * 20} gold`, val: (l) => l * 20 },
];

/* Skill cards — collected during a run, stack into a build.
   `mod(m)` adjusts combat modifiers. `onPick(run)` for instant effects. */
const CARDS = [
  { id: 'whetstone', emoji: '🗡️', rarity: 'common', name: 'Whetstone',
    desc: '+4 damage on every attack.', mod: (m) => { m.flat += 4; } },
  { id: 'gambler', emoji: '🎲', rarity: 'common', name: "Gambler's Charm",
    desc: '+1 reroll each battle.', mod: (m) => { m.rerolls += 1; } },
  { id: 'sharpeyes', emoji: '👁️', rarity: 'common', name: 'Sharp Eyes',
    desc: '+3 damage per scoring die.', mod: (m) => { m.perDie += 3; } },
  { id: 'pairup', emoji: '✌️', rarity: 'common', name: 'Pair Up',
    desc: 'Pairs and two-pairs hit for +12.', mod: (m) => { m.combo.pair += 12; m.combo.twopair += 12; } },
  { id: 'bulwark', emoji: '🛡️', rarity: 'common', name: 'Bulwark',
    desc: 'Any pair-or-better grants 6 block.', mod: (m) => { m.blockPair += 6; } },
  { id: 'venom', emoji: '🧪', rarity: 'uncommon', name: 'Venom Dice',
    desc: 'Two-pair or better poisons the enemy for 5.', mod: (m) => { m.poison += 5; } },
  { id: 'vampire', emoji: '🩸', rarity: 'uncommon', name: 'Vampire Fang',
    desc: 'Three-of-a-kind or better heals you 6.', mod: (m) => { m.lifesteal += 6; } },
  { id: 'tristrike', emoji: '🔱', rarity: 'uncommon', name: 'Trident',
    desc: 'Three-of-a-kind hits for +20.', mod: (m) => { m.combo.three += 20; } },
  { id: 'flush', emoji: '🌊', rarity: 'uncommon', name: 'Straight Flush',
    desc: 'Straights hit for +25.', mod: (m) => { m.combo.straight += 25; } },
  { id: 'glasscannon', emoji: '💥', rarity: 'rare', name: 'Glass Cannon',
    desc: '+60% damage, but lose 12 max HP now.', mod: (m) => { m.dmgMult += 0.60; },
    onPick: (run) => { run.maxHp = Math.max(10, run.maxHp - 12); run.hp = Math.min(run.hp, run.maxHp); } },
  { id: 'fullhouse', emoji: '🏠', rarity: 'rare', name: 'Full House Party',
    desc: 'Full house and four-of-a-kind hit for +40.', mod: (m) => { m.combo.full += 40; m.combo.four += 40; } },
  { id: 'overdrive', emoji: '⚡', rarity: 'rare', name: 'Overdrive',
    desc: '+2 reroll and +2 damage per scoring die.', mod: (m) => { m.rerolls += 2; m.perDie += 2; } },
];
const cardById = (id) => CARDS.find(c => c.id === id);
const RARITY_W = { common: 6, uncommon: 3, rare: 1 };
function randomCards(n, exclude = []) {
  const pool = CARDS.filter(c => !exclude.includes(c.id));
  const bag = [];
  pool.forEach(c => { for (let i = 0; i < RARITY_W[c.rarity]; i++) bag.push(c); });
  const out = [];
  while (out.length < n && bag.length) {
    const c = bag.splice(rint(bag.length), 1)[0];
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

/* Enemies scale with depth. */
const FOES = [
  { emoji: '🐀', name: 'Sewer Rat' }, { emoji: '🦇', name: 'Cave Bat' },
  { emoji: '🕷️', name: 'Creepy Spider' }, { emoji: '🐍', name: 'Pit Viper' },
  { emoji: '🦂', name: 'Sand Scorpion' }, { emoji: '👹', name: 'Goblin Brute' },
  { emoji: '🧟', name: 'Shambler' }, { emoji: '🐗', name: 'Wild Boar' },
];
const ELITES = [
  { emoji: '🐲', name: 'Young Drake' }, { emoji: '🦖', name: 'Raptor' },
  { emoji: '🧌', name: 'Troll' }, { emoji: '👺', name: 'Oni Warrior' },
];
const BOSSES = [
  { emoji: '🐉', name: 'Elder Wyrm' }, { emoji: '👾', name: 'The Devourer' },
  { emoji: '💀', name: 'Bone Tyrant' },
];
function makeEnemy(kind, depth) {
  let base, hp, atk;
  if (kind === 'boss')       { base = pick(BOSSES); hp = 120 + depth * 14; atk = 12 + Math.floor(depth * 1.3); }
  else if (kind === 'elite') { base = pick(ELITES); hp = 60 + depth * 10;  atk = 9 + depth; }
  else                       { base = pick(FOES);   hp = 26 + depth * 7;   atk = 5 + Math.floor(depth * 0.9); }
  // theme-only: name the monster after one of your real tasks (if a World is set)
  const themed = themedName(kind);
  return { emoji: base.emoji, name: themed || base.name, hp, maxhp: hp, atk, kind };
}

/* ============================================================
   YOUR WORLD — theme the adventure from your real tasks
   (theme-only: titles just NAME enemies/bosses/biomes; the dice
   game underneath is unchanged. Parses Structured JSON exports,
   .ics calendars, or the tracker's own on-device data.)
   ============================================================ */
const BIOME = {
  health:     { name: 'the Apothecary Depths',   emoji: '💊' },
  body:       { name: 'the Iron Arena',          emoji: '🏋️' },
  home:       { name: 'the Dusthall Warren',     emoji: '🧹' },
  connection: { name: 'the Whispering Village',  emoji: '💬' },
  work:       { name: 'the Paperwork Catacombs', emoji: '📨' },
  admin:      { name: 'the Paperwork Catacombs', emoji: '📨' },
  other:      { name: 'the Tangled Wilds',       emoji: '🌫️' },
};
/* A believable "sample life" so the game is themed out of the box. */
const MOCK_ITEMS = [
  { title: 'Take meds', category: 'health' }, { title: 'Vitamins', category: 'health' },
  { title: 'Dentist appointment', category: 'health' }, { title: 'Gym session', category: 'body' },
  { title: 'Go for a run', category: 'body' }, { title: 'Pile of laundry', category: 'home' },
  { title: 'Clean the litter box', category: 'home' }, { title: 'Meal prep Sunday', category: 'home' },
  { title: 'Water the plants', category: 'home' }, { title: 'Reply to Sam', category: 'connection' },
  { title: 'Call mom', category: 'connection' }, { title: '47 unread emails', category: 'work' },
  { title: 'Finish the slide deck', category: 'work' }, { title: 'Tax return', category: 'work', type: 'project' },
  { title: 'Renew passport', category: 'work', type: 'project' }, { title: 'Read that saved article', category: 'other' },
  { title: 'Side project: KhimVentions', category: 'other', type: 'project' },
];

const dedupe = (arr) => { const seen = new Set(); return arr.filter(s => { const k = s.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); };

/* Tolerant JSON walk: grab strings under title-ish keys, at any depth. */
function collectTitles(node, out, depth = 0) {
  if (depth > 7 || node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(n => collectTitles(n, out, depth + 1)); return; }
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string' && /^(title|name|summary|task|todo|text|label|subject|event)$/i.test(k)) {
      const s = v.trim(); if (s && s.length <= 60) out.push(s);
    } else collectTitles(v, out, depth + 1);
  }
}
function parseJSONTitles(text) { const out = []; collectTitles(JSON.parse(text), out); return dedupe(out); }
function parseICSTitles(text) {
  const out = [];
  text.split(/\r?\n/).forEach(l => { const m = l.match(/^SUMMARY(?:;[^:]*)?:(.+)$/i); if (m) out.push(m[1].trim().replace(/\\,/g, ',').replace(/\\n/gi, ' ')); });
  return dedupe(out);
}
/* Read the tracker's own data straight off this device (same origin). */
function readTrackerItems() {
  const g = (k) => { try { const v = localStorage.getItem('kv.' + k); return v ? JSON.parse(v) : null; } catch { return null; } };
  const tasks = g('tasks') || [], habits = g('habits') || [], people = g('people') || [];
  const items = [];
  tasks.forEach(t => t.title && items.push({ title: t.title, category: 'other', type: t.type }));
  habits.forEach(h => h.name && items.push({ title: h.name, category: h.category }));
  people.forEach(p => p.name && items.push({ title: 'Message ' + p.name, category: 'connection' }));
  return items;
}
/* Turn a list of titles/items into a themed world. */
const BOSS_KW = /(tax|passport|project|deadline|report|presentation|move|file|renew|appointment|exam|interview|launch|review)/i;
function buildWorld(rawItems, source) {
  const items = rawItems.map(it => (typeof it === 'string') ? { title: it } : it).filter(it => it && it.title);
  const titles = dedupe(items.map(i => i.title.trim()).filter(Boolean));
  if (!titles.length) return null;
  let bosses = dedupe(items.filter(i => i.type === 'project' || BOSS_KW.test(i.title)).map(i => i.title));
  if (bosses.length < 2) bosses = dedupe([...bosses, ...[...titles].sort((a, b) => b.length - a.length).slice(0, 3)]);
  const cats = dedupe(items.map(i => i.category).filter(Boolean));
  const biomes = (cats.length ? cats : ['other']).map(c => BIOME[c] || BIOME.other);
  return { source, enemies: titles, bosses, biomes, count: titles.length };
}
function setWorld(world) { WORLD = world; world ? KVG.set('world', world) : KVG.del('world'); }
function themedName(kind) {
  if (!WORLD) return null;
  const pool = (kind === 'boss' && WORLD.bosses.length) ? WORLD.bosses : WORLD.enemies;
  return pool.length ? pick(pool) : null;
}

/* Choose-your-path events (Capybara Go flavour: good / bad / ugly). */
const EVENTS = [
  { id: 'shrine', emoji: '⛩️', title: 'A Mossy Shrine',
    text: 'A weathered shrine hums with old magic. Do you make an offering?',
    choices: [
      { label: 'Pray (lose 10 gold)', run: (run) => {
          if (run.gold < 10) return 'You have nothing worth offering. The shrine stays silent.';
          run.gold -= 10;
          if (chance(0.6)) { const h = 18; run.hp = clamp(run.hp + h, 0, run.maxHp); return `Warm light pours over you. Healed ${h} HP.`; }
          run.maxHp += 6; run.hp += 6; return 'The shrine blesses your vigor. +6 max HP!'; } },
      { label: 'Smash it open', run: (run) => {
          if (chance(0.5)) { const g = 25 + rint(20); run.gold += g; return `Gold spills from the rubble. +${g} gold!`; }
          const d = 8 + rint(8); run.hp -= d; return `A trap! Spikes catch you for ${d} damage.`; } },
      { label: 'Leave it be', run: () => 'You bow respectfully and move on. Nothing ventured.' },
    ] },
  { id: 'merchant', emoji: '🦝', title: 'The Masked Merchant',
    text: 'A raccoon in a velvet cloak offers a mystery box for 20 gold.',
    choices: [
      { label: 'Buy the box (20 gold)', run: (run) => {
          if (run.gold < 20) return 'You can\'t afford it. The raccoon shrugs and vanishes.';
          run.gold -= 20;
          if (chance(0.7)) { const c = randomCards(1)[0]; run.cards.push(c); return `Inside: ${c.emoji} ${c.name}! Added to your build.`; }
          const g = 35; run.gold += g; return `Just old coins — but more than you paid. +${g} gold.`; } },
      { label: 'Pick a pocket', run: (run) => {
          if (chance(0.45)) { const g = 30 + rint(15); run.gold += g; return `Nimble fingers! +${g} gold.`; }
          const d = 10; run.hp -= d; return `Caught! The raccoon bites you for ${d}.`; } },
      { label: 'Decline', run: () => 'You wave the merchant off and keep walking.' },
    ] },
  { id: 'spring', emoji: '💧', title: 'A Hidden Spring',
    text: 'Crystal water bubbles up between the rocks.',
    choices: [
      { label: 'Drink deeply', run: (run) => { const h = 22; run.hp = clamp(run.hp + h, 0, run.maxHp); return `Refreshing! Healed ${h} HP.`; } },
      { label: 'Bathe and rest', run: (run) => { run.maxHp += 4; run.hp = clamp(run.hp + 10, 0, run.maxHp); return 'Restored, body and soul. +4 max HP, +10 HP.'; } },
    ] },
  { id: 'gambler', emoji: '🎰', title: 'The Dice Goblin',
    text: 'A goblin rattles a cup. "Double or nothing on your gold?"',
    choices: [
      { label: 'Roll the bones', run: (run) => {
          if (run.gold < 10) return 'The goblin sniffs your empty pockets and leaves.';
          if (chance(0.5)) { run.gold *= 2; return `Lucky roll! Your gold doubled to ${run.gold}.`; }
          run.gold = Math.floor(run.gold / 2); return `Snake eyes. Half your gold is gone (${run.gold} left).`; } },
      { label: 'Walk away', run: () => 'You know better than to gamble with goblins. Mostly.' },
    ] },
  { id: 'forge', emoji: '🔥', title: 'An Abandoned Forge',
    text: 'Embers still glow. You could temper a die in the heat.',
    choices: [
      { label: 'Temper a card (need 1+)', run: (run) => {
          if (!run.cards.length) return 'You have no skill cards to temper yet.';
          const c = randomCards(1)[0]; run.cards.push(c); return `You forge a new edge: ${c.emoji} ${c.name}!`; } },
      { label: 'Scavenge for scrap', run: (run) => { const g = 15 + rint(12); run.gold += g; return `You pry loose ${g} gold of old fittings.`; } },
    ] },
  { id: 'stray', emoji: '🐕', title: 'A Lost Pup',
    text: 'A scruffy pup whimpers at a fork in the path.',
    choices: [
      { label: 'Share your rations', run: (run) => {
          run.hp = clamp(run.hp - 5, 1, run.maxHp);
          if (chance(0.8)) { const c = randomCards(1)[0]; run.cards.push(c); return `The grateful pup digs up a gift: ${c.emoji} ${c.name}! (-5 HP)`; }
          return 'The pup licks your hand and trots off, happy. (-5 HP)'; } },
      { label: 'Hurry past', run: () => 'You leave the pup behind. It\'ll be fine. Probably.' },
    ] },
];

/* ============================================================
   STATE
   ============================================================ */
const DEFAULT_META = {
  fish: 0, bestDepth: 0, runsWon: 0, runsPlayed: 0,
  heroes: ['cat'], selectedHero: 'cat',
  talents: { hearty: 0, greedy: 0, sharp: 0, prepared: 0, lucky: 0 },
};
let meta = Object.assign({}, DEFAULT_META, KVG.get('meta', {}));
meta.talents = Object.assign({}, DEFAULT_META.talents, meta.talents);
const saveMeta = () => KVG.set('meta', meta);

let run = KVG.get('run', null);        // resumable in-progress run
const saveRun = () => run ? KVG.set('run', run) : KVG.del('run');
let WORLD = KVG.get('world', null);    // themed content from your tasks (see "YOUR WORLD")
const tLevel = (id) => meta.talents[id] || 0;
const tVal = (id) => TALENTS.find(t => t.id === id).val(tLevel(id));

/* ============================================================
   COMBAT MATH (pure — unit-testable)
   ============================================================ */
const COMBO_INFO = {
  high:    { label: 'High Card',       base: 0 },
  pair:    { label: 'Pair',            base: 8 },
  twopair: { label: 'Two Pair',        base: 18 },
  three:   { label: 'Three of a Kind', base: 28 },
  straight:{ label: 'Straight',        base: 38 },
  full:    { label: 'Full House',      base: 50 },
  four:    { label: 'Four of a Kind',  base: 68 },
  five:    { label: 'Five of a Kind',  base: 100 },
};

/* Identify the best poker combo on 5 d6, plus which dice score. */
function evalDice(dice, flags = {}) {
  const counts = {};
  dice.forEach(d => counts[d] = (counts[d] || 0) + 1);
  const entries = Object.entries(counts).map(([v, n]) => ({ v: +v, n }));
  const groups = entries.slice().sort((a, b) => b.n - a.n || b.v - a.v);
  const sum = dice.reduce((a, b) => a + b, 0);
  const sortedKey = [...dice].sort((a, b) => a - b).join('');
  const isStraight = sortedKey === '12345' || sortedKey === '23456';
  const top = groups[0].n, second = groups[1] ? groups[1].n : 0;

  let combo, scoringVals;
  if (top === 5) { combo = 'five'; scoringVals = [groups[0].v]; }
  else if (top === 4) { combo = 'four'; scoringVals = [groups[0].v]; }
  else if (top === 3 && second === 2) { combo = 'full'; scoringVals = [groups[0].v, groups[1].v]; }
  else if (isStraight) { combo = 'straight'; scoringVals = [1, 2, 3, 4, 5, 6]; }
  else if (top === 3) { combo = 'three'; scoringVals = [groups[0].v]; }
  else if (top === 2 && second === 2) { combo = 'twopair'; scoringVals = [groups[0].v, groups[1].v]; }
  else if (top === 2) { combo = 'pair'; scoringVals = [groups[0].v]; }
  else { combo = 'high'; scoringVals = [Math.max(...dice)]; }

  // Fox: a lone pair is treated as three-of-a-kind.
  if (flags.pairAsThree && combo === 'pair') combo = 'three';

  const scoringDice = isStraight ? [...dice] : dice.filter(d => scoringVals.includes(d));
  return { combo, sum, scoringDice, scoringCount: scoringDice.length, isStraight };
}

/* Fresh modifier object, seeded from talents. */
function baseMods() {
  return {
    flat: tVal('sharp'), perDie: 0, rerolls: 3, dmgMult: 1,
    lifesteal: 0, blockPair: 0, poison: 0, goldMult: 1 + tVal('greedy'),
    combo: { high: 0, pair: 0, twopair: 0, three: 0, straight: 0, full: 0, four: 0, five: 0 },
  };
}
/* Aggregate hero + all collected cards into one mods object. */
function computeMods(r) {
  const m = baseMods();
  const hero = heroById(r.heroId);
  hero.mod && hero.mod(m);
  for (const c of r.cards) { const card = (typeof c === 'string') ? cardById(c) : c; card && card.mod && card.mod(m); }
  if (hero.flags?.bossReroll && r.battle && (r.battle.enemy.kind === 'boss' || r.battle.enemy.kind === 'elite')) m.rerolls += 1;
  return m;
}

/* Damage for a roll given the run's mods + hero flags. */
function computeDamage(dice, mods, flags = {}) {
  const ev = evalDice(dice, flags);
  let dmg = COMBO_INFO[ev.combo].base + (mods.combo[ev.combo] || 0);
  dmg += ev.sum;                                  // dice pips always add
  dmg += ev.scoringCount * mods.perDie;           // per scoring die bonus
  dmg += mods.flat;
  if (flags.straightSurge && ev.combo === 'straight') dmg *= 2;   // Frog
  dmg *= mods.dmgMult;
  return { dmg: Math.max(1, Math.round(dmg)), ev };
}

/* ============================================================
   UI SHELL
   ============================================================ */
const app = () => $('#app');
function render(html) { app().innerHTML = html; }

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}
function haptic(ms = 12) { if (navigator.vibrate) navigator.vibrate(ms); }

function confettiBurst(ox, oy, n = 26) {
  const canvas = $('#confetti'); canvas.hidden = false;
  const ctx = canvas.getContext('2d');
  canvas.width = innerWidth; canvas.height = innerHeight;
  const colors = ['#7c9cff', '#b48cff', '#4ade80', '#fbbf24', '#f472b6'];
  const parts = Array.from({ length: n }, () => ({
    x: ox, y: oy, vx: (Math.random() - 0.5) * 9, vy: (Math.random() - 1.1) * 9,
    s: 4 + Math.random() * 5, c: colors[rint(colors.length)], life: 1, rot: Math.random() * 6,
  }));
  let frame = 0;
  (function anim() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    parts.forEach(p => {
      p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.life -= 0.02; p.rot += 0.2;
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); ctx.restore();
    });
    if (++frame < 70) requestAnimationFrame(anim);
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.hidden = true; }
  })();
}
function centerConfetti() { confettiBurst(innerWidth / 2, innerHeight * 0.35); }

/* floating combat number above an element */
function floatText(el, text, cls = '') {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = 'float-num ' + cls; f.textContent = text;
  f.style.left = (r.left + r.width / 2) + 'px'; f.style.top = (r.top + 8) + 'px';
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 850);
}

/* ============================================================
   SCREENS
   ============================================================ */
function go(screen) { saveRun(); screen(); window.scrollTo(0, 0); }

/* ---------- Home / title ---------- */
function screenHome() {
  const hero = heroById(meta.selectedHero);
  const resumable = run && !run.over;
  render(`
    <div class="screen home">
      <div class="title-wrap">
        <div class="title-logo">🎲</div>
        <h1 class="game-title">KhimVentures</h1>
        <p class="game-tag">Roll the dice. Brave the den. A pocket roguelite.</p>
      </div>
      <div class="hero-banner card-lg">
        <div class="hero-face">${hero.emoji}</div>
        <div class="hero-meta">
          <div class="hero-name">${esc(hero.name)}</div>
          <div class="hero-perk">${esc(hero.perk)}</div>
        </div>
      </div>
      <div class="home-actions">
        ${resumable ? `<button class="btn primary big" id="resumeBtn">▶ Resume run · depth ${run.depth}</button>` : ''}
        <button class="btn ${resumable ? 'ghost' : 'primary'} big" id="playBtn">${resumable ? 'New run' : '▶ Start a run'}</button>
        <div class="home-row">
          <button class="btn ghost" id="rosterBtn">🐾 Heroes</button>
          <button class="btn ghost" id="talentsBtn">⭐ Talents</button>
          <button class="btn ghost" id="worldBtn">🌍 World</button>
        </div>
      </div>
      <div class="world-line" id="worldLine">${WORLD
        ? `🌍 Themed by ${WORLD.count} of your tasks · source: ${WORLD.source}`
        : '🌍 Tap World to theme the adventure from your tasks'}</div>
      <div class="meta-strip">
        <span>🐟 ${meta.fish}</span>
        <span>🏆 best depth ${meta.bestDepth}</span>
        <span>👑 ${meta.runsWon} won</span>
      </div>
      <a class="back-tracker" href="index.html">← home</a>
    </div>`);
  if (resumable) $('#resumeBtn').onclick = () => go(screenMap);
  $('#playBtn').onclick = () => { if (resumable && !confirm('Abandon the current run and start fresh?')) return; startRun(); };
  $('#rosterBtn').onclick = () => go(screenRoster);
  $('#talentsBtn').onclick = () => go(screenTalents);
  $('#worldBtn').onclick = () => go(screenImport);
}

/* ---------- World / import screen ---------- */
function screenImport() {
  render(`
    <div class="screen">
      ${topBar('🌍 Your World', '')}
      <p class="hint">Theme-only: your real tasks just name the monsters and biomes — the dice game underneath is the same. Pick a source.</p>
      <div class="list">
        <button class="btn wide primary" id="mockBtn">✨ Use a sample life (mock data)</button>
        <button class="btn wide" id="trackerBtn">🧠 Use my tracker's own tasks</button>
        <label class="btn wide file-btn">📂 Choose a file — Structured JSON or .ics
          <input type="file" id="fileInput" accept=".json,.ics,application/json,text/calendar" hidden /></label>
        <button class="btn wide ghost" id="pasteBtn">📋 Paste text instead</button>
      </div>
      <div id="worldPreview" class="world-preview"></div>
    </div>`);
  $('#backBtn').onclick = () => go(screenHome);
  $('#mockBtn').onclick = () => applyWorld(buildWorld(MOCK_ITEMS, 'mock'), 'Sample life loaded — meet your monsters. ✨');
  $('#trackerBtn').onclick = () => {
    const items = readTrackerItems();
    if (!items.length) return toast('No tasks found in the tracker yet.');
    applyWorld(buildWorld(items, 'tracker'), `Pulled ${items.length} things from your tracker. 🧠`);
  };
  $('#fileInput').onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        const isICS = /\.ics$/i.test(file.name) || /^BEGIN:VCALENDAR/m.test(text);
        const titles = isICS ? parseICSTitles(text) : parseJSONTitles(text);
        const world = buildWorld(titles, isICS ? 'calendar' : 'file');
        if (!world) return toast("Couldn't find any task/event titles in that file 😕");
        applyWorld(world, `Imported ${world.count} titles from ${file.name}. 🌍`);
      } catch { toast("Couldn't read that file — is it a JSON or .ics export?"); }
    };
    reader.readAsText(file);
  };
  $('#pasteBtn').onclick = () => {
    const text = prompt('Paste your tasks/events (one per line, or paste a JSON/.ics export):', '');
    if (!text || !text.trim()) return;
    let titles;
    const t = text.trim();
    if (/^BEGIN:VCALENDAR/m.test(t)) titles = parseICSTitles(t);
    else if (/^[\[{]/.test(t)) { try { titles = parseJSONTitles(t); } catch { titles = null; } }
    if (!titles || !titles.length) titles = dedupe(t.split('\n').map(s => s.replace(/^[-*•\d.\s]+/, '').trim()).filter(Boolean));
    const world = buildWorld(titles, 'pasted');
    if (!world) return toast('No titles found in that text 😕');
    applyWorld(world, `Themed from ${world.count} pasted lines. 🌍`);
  };
  renderWorldPreview();
}
function applyWorld(world, msg) {
  if (!world) return toast('Nothing to theme from there 😕');
  setWorld(world); haptic(14); toast(msg); renderWorldPreview();
}
function renderWorldPreview() {
  const el = $('#worldPreview'); if (!el) return;
  if (!WORLD) { el.innerHTML = '<p class="hint">No world set yet — the game uses default monster names until you pick a source.</p>'; return; }
  const sample = WORLD.enemies.slice(0, 6), bosses = WORLD.bosses.slice(0, 3);
  el.innerHTML = `
    <div class="card-lg world-card">
      <div class="hero-meta">
        <div class="hero-name">Current world · ${esc(WORLD.source)} <span class="pill">${WORLD.count} tasks</span></div>
        <div class="hero-perk"><b>Monsters:</b> ${sample.map(esc).join(' · ')}${WORLD.count > 6 ? ' …' : ''}</div>
        <div class="hero-perk"><b>Bosses 👑:</b> ${bosses.map(esc).join(' · ')}</div>
        <div class="hero-perk"><b>Biomes:</b> ${WORLD.biomes.map(b => b.emoji + ' ' + esc(b.name)).join(' · ')}</div>
      </div>
    </div>
    <button class="btn ghost wide" id="clearWorldBtn">Clear world (use default names)</button>`;
  $('#clearWorldBtn').onclick = () => { setWorld(null); toast('World cleared.'); renderWorldPreview(); };
}

/* ---------- Roster (unlock heroes) ---------- */
function screenRoster() {
  render(`
    <div class="screen">
      ${topBar('🐾 Heroes', `🐟 ${meta.fish}`)}
      <div class="list">
        ${HEROES.map(h => {
          const owned = meta.heroes.includes(h.id);
          const selected = meta.selectedHero === h.id;
          return `<div class="card-lg hero-row ${selected ? 'selected' : ''}">
            <div class="hero-face">${h.emoji}</div>
            <div class="hero-meta">
              <div class="hero-name">${esc(h.name)} ${selected ? '<span class="pill">selected</span>' : ''}</div>
              <div class="hero-perk">${esc(h.perk)}</div>
              <div class="hero-sub">❤️ ${h.maxHp} base HP</div>
            </div>
            <div class="hero-cta">
              ${owned
                ? (selected ? '<span class="owned">✓</span>' : `<button class="btn small" data-select="${h.id}">Select</button>`)
                : `<button class="btn small ${meta.fish >= h.cost ? 'primary' : ''}" data-unlock="${h.id}" ${meta.fish >= h.cost ? '' : 'disabled'}>🐟 ${h.cost}</button>`}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`);
  $('#backBtn').onclick = () => go(screenHome);
  $$('[data-select]').forEach(b => b.onclick = () => { meta.selectedHero = b.dataset.select; saveMeta(); go(screenRoster); });
  $$('[data-unlock]').forEach(b => b.onclick = () => {
    const h = heroById(b.dataset.unlock);
    if (meta.fish < h.cost) return;
    meta.fish -= h.cost; meta.heroes.push(h.id); meta.selectedHero = h.id; saveMeta();
    centerConfetti(); haptic(20); toast(`${h.emoji} ${h.name} joined your roster!`);
    go(screenRoster);
  });
}

/* ---------- Talents (permanent upgrades) ---------- */
function screenTalents() {
  render(`
    <div class="screen">
      ${topBar('⭐ Talents', `🐟 ${meta.fish}`)}
      <p class="hint">Permanent upgrades. They apply to every future run.</p>
      <div class="list">
        ${TALENTS.map(t => {
          const lv = tLevel(t.id), maxed = lv >= t.max, cost = t.cost(lv);
          return `<div class="card-lg talent-row">
            <div class="hero-face small">${t.emoji}</div>
            <div class="hero-meta">
              <div class="hero-name">${esc(t.name)} <span class="pill">Lv ${lv}/${t.max}</span></div>
              <div class="hero-perk">${esc(t.desc(lv))}</div>
            </div>
            <div class="hero-cta">
              ${maxed ? '<span class="owned">MAX</span>'
                : `<button class="btn small ${meta.fish >= cost ? 'primary' : ''}" data-buy="${t.id}" ${meta.fish >= cost ? '' : 'disabled'}>🐟 ${cost}</button>`}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`);
  $('#backBtn').onclick = () => go(screenHome);
  $$('[data-buy]').forEach(b => b.onclick = () => {
    const t = TALENTS.find(x => x.id === b.dataset.buy), lv = tLevel(t.id);
    if (lv >= t.max) return;
    const cost = t.cost(lv);
    if (meta.fish < cost) return;
    meta.fish -= cost; meta.talents[t.id] = lv + 1; saveMeta();
    haptic(16); toast(`${t.emoji} ${t.name} → Lv ${lv + 1}`);
    go(screenTalents);
  });
}

/* ============================================================
   RUN LIFECYCLE
   ============================================================ */
const MAP_LEN = 9;                 // columns before the boss
function genMap() {
  const cols = [];
  for (let i = 0; i < MAP_LEN; i++) {
    if (i === 0) { cols.push([{ type: 'battle' }]); continue; }       // teach combat first
    const n = chance(0.55) ? 2 : 3;
    const opts = [];
    for (let j = 0; j < n; j++) opts.push({ type: nodeType(i) });
    // guarantee a rest option appears in the back half sometimes
    if (i >= 5 && !opts.some(o => o.type === 'rest') && chance(0.5)) opts[0].type = 'rest';
    cols.push(opts);
  }
  cols.push([{ type: 'boss' }]);
  return cols;
}
function nodeType(depth) {
  const bag = [];
  const add = (t, w) => { for (let i = 0; i < w; i++) bag.push(t); };
  add('battle', 5);
  add('event', 3);
  add('treasure', 2);
  add('shop', depth >= 2 ? 2 : 0);
  add('rest', depth >= 3 ? 2 : 0);
  add('elite', depth >= 4 ? 2 : 0);
  return pick(bag);
}

function startRun() {
  const hero = heroById(meta.selectedHero);
  const maxHp = hero.maxHp + tVal('hearty');
  run = {
    heroId: hero.id, hp: maxHp, maxHp,
    gold: tVal('lucky'), depth: 0, col: 0,
    cards: [], map: genMap(), battle: null, over: false,
    nineLivesUsed: false,
  };
  if (tLevel('prepared')) run.cards.push(randomCards(1)[0]);
  run.biome = (WORLD && WORLD.biomes.length) ? pick(WORLD.biomes) : null;   // cosmetic flavour
  meta.runsPlayed++; saveMeta();
  go(screenMap);
}

function bankFish(amount, reason) {
  meta.fish += amount; saveMeta();
  return amount;
}
function endRun(won) {
  run.over = true;
  if (run.depth > meta.bestDepth) meta.bestDepth = run.depth;
  // 🐟 reward: gold carried + depth bonus + big win bonus
  const earned = Math.round(run.gold * 0.5) + run.depth * 6 + (won ? 80 : 0);
  bankFish(earned);
  if (won) meta.runsWon++;
  saveMeta();
  go(() => screenEnd(won, earned));
}

/* ---------- Map / choose-your-path ---------- */
const NODE_INFO = {
  battle:   { emoji: '⚔️', label: 'Battle', sub: 'A foe blocks the path' },
  elite:    { emoji: '💀', label: 'Elite', sub: 'Dangerous — better loot' },
  event:    { emoji: '❓', label: 'Unknown', sub: 'A twist of fate' },
  treasure: { emoji: '🎁', label: 'Treasure', sub: 'Gold & a skill card' },
  shop:     { emoji: '🛒', label: 'Shop', sub: 'Spend your gold' },
  rest:     { emoji: '🔥', label: 'Campfire', sub: 'Heal up' },
  boss:     { emoji: '👑', label: 'BOSS', sub: 'The chapter\'s end' },
};
function screenMap() {
  if (run.col >= run.map.length) { endRun(true); return; }
  const options = run.map[run.col];
  const isBoss = options[0].type === 'boss';
  render(`
    <div class="screen">
      ${runBar()}
      <div class="map-head">
        <div class="map-depth">Depth ${run.col} / ${run.map.length - 1}</div>
        <div class="map-prompt">${isBoss ? 'The path ends here.' : 'Choose your path'}</div>
        ${run.biome ? `<div class="map-biome">${run.biome.emoji} ${esc(run.biome.name)}</div>` : ''}
      </div>
      <div class="path-options">
        ${options.map((o, i) => {
          const info = NODE_INFO[o.type];
          return `<button class="path-node ${o.type}" data-i="${i}">
            <span class="node-emoji">${info.emoji}</span>
            <span class="node-label">${info.label}</span>
            <span class="node-sub">${info.sub}</span>
          </button>`;
        }).join('')}
      </div>
      ${run.cards.length ? `<div class="deck-strip" id="deckStrip">${run.cards.map(c => {
        const card = (typeof c === 'string') ? cardById(c) : c; return `<span class="deck-chip" title="${esc(card.name)}: ${esc(card.desc)}">${card.emoji}</span>`;
      }).join('')}</div>` : ''}
    </div>`);
  $('#quitBtn') && ($('#quitBtn').onclick = confirmQuit);
  $$('.path-node').forEach(b => b.onclick = () => resolveNode(options[+b.dataset.i].type));
}

function resolveNode(type) {
  run.depth = run.col;
  if (type === 'battle') return startBattle(makeEnemy('battle', run.col));
  if (type === 'elite')  return startBattle(makeEnemy('elite', run.col));
  if (type === 'boss')   return startBattle(makeEnemy('boss', run.col));
  if (type === 'treasure') return screenTreasure();
  if (type === 'event')  return screenEvent(pick(EVENTS));
  if (type === 'shop')   return screenShop();
  if (type === 'rest')   return screenRest();
}
function advance() { run.col++; go(screenMap); }

/* ---------- Battle ---------- */
function startBattle(enemy) {
  run.battle = {
    enemy, dice: [1, 1, 1, 1, 1], held: [false, false, false, false, false],
    rerolls: 0, rolledOnce: false, block: 0, turn: 1, log: 'A wild ' + enemy.name + ' appears!',
  };
  const mods = computeMods(run);
  run.battle.rerolls = mods.rerolls;
  rollDice(true);
  go(screenBattle);
}
function rollDice(all = false) {
  const b = run.battle;
  for (let i = 0; i < 5; i++) if (all || !b.held[i]) b.dice[i] = 1 + rint(6);
  if (!all) b.rerolls--;
  b.rolledOnce = true;
}

function screenBattle() {
  const b = run.battle, e = b.enemy;
  const mods = computeMods(run);
  const { dmg, ev } = computeDamage(b.dice, mods, heroById(run.heroId).flags);
  const hpPct = clamp(Math.round((run.hp / run.maxHp) * 100), 0, 100);
  const ePct = clamp(Math.round((e.hp / e.maxhp) * 100), 0, 100);
  render(`
    <div class="screen battle">
      ${runBar()}
      <div class="enemy-stage ${e.kind}">
        <div class="enemy-intent">Intends: ⚔️ ${e.atk}${e.poison ? ` · 🧪 ${e.poison}` : ''}</div>
        <div class="enemy-face" id="enemyFace">${e.emoji}</div>
        <div class="enemy-name">${esc(e.name)} ${e.kind === 'boss' ? '👑' : e.kind === 'elite' ? '💀' : ''}</div>
        <div class="hp-bar enemy"><div class="hp-fill" style="width:${ePct}%"></div><span class="hp-text">${e.hp}/${e.maxhp}</span></div>
      </div>

      <div class="combo-readout">
        <span class="combo-name">${COMBO_INFO[ev.combo].label}</span>
        <span class="combo-dmg" id="dmgPreview">⚔️ ${dmg}</span>
      </div>

      <div class="dice-tray">
        ${b.dice.map((d, i) => `<button class="die ${b.held[i] ? 'held' : ''} ${ev.scoringDice.includes(d) ? 'scoring' : ''}" data-i="${i}">
          <span class="die-face">${DIE[d]}</span>${b.held[i] ? '<span class="lock">🔒</span>' : ''}
        </button>`).join('')}
      </div>
      <div class="dice-hint">${b.rerolls > 0 ? 'Tap dice to hold, then reroll — or attack now.' : 'No rerolls left. Make it count!'}</div>

      <div class="battle-actions">
        <button class="btn ghost" id="rerollBtn" ${b.rerolls > 0 ? '' : 'disabled'}>🎲 Reroll (${b.rerolls})</button>
        <button class="btn primary" id="attackBtn">Attack ⚔️ ${dmg}</button>
      </div>

      <div class="player-stage">
        <div class="hp-bar player"><div class="hp-fill" style="width:${hpPct}%"></div><span class="hp-text">❤️ ${run.hp}/${run.maxHp}${b.block ? ` · 🛡️ ${b.block}` : ''}</span></div>
        <div class="player-foot">${heroById(run.heroId).emoji} ${b.log}</div>
      </div>
    </div>`);
  $('#quitBtn') && ($('#quitBtn').onclick = confirmQuit);
  $$('.die').forEach(d => d.onclick = () => {
    if (b.resolving || b.rerolls <= 0) return;   // holding only matters if you can reroll
    const i = +d.dataset.i; b.held[i] = !b.held[i]; haptic(6); go(screenBattle);
  });
  $('#rerollBtn').onclick = () => { if (b.resolving || b.rerolls <= 0) return; rollDice(false); haptic(8); go(screenBattle); };
  $('#attackBtn').onclick = doAttack;
}
const DIE = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' };

function doAttack() {
  const b = run.battle, e = b.enemy;
  if (b.resolving) return;                 // ignore taps mid-resolution
  b.resolving = true;
  const mods = computeMods(run), flags = heroById(run.heroId).flags || {};
  const { dmg, ev } = computeDamage(b.dice, mods, flags);

  e.hp -= dmg;
  floatText($('#enemyFace'), '-' + dmg, 'dmg');
  haptic(14);
  if (ev.combo !== 'high' && ev.combo !== 'pair') confettiBurst(innerWidth / 2, innerHeight * 0.28, 16);

  // on-hit card effects
  let note = `${COMBO_INFO[ev.combo].label} for ${dmg}.`;
  const tier = ['high', 'pair', 'twopair', 'three', 'straight', 'full', 'four', 'five'].indexOf(ev.combo);
  if (mods.blockPair && tier >= 1) { b.block += mods.blockPair; note += ` 🛡️+${mods.blockPair}.`; }
  if (mods.poison && tier >= 2) { e.poison = (e.poison || 0) + mods.poison; note += ` 🧪+${mods.poison}.`; }
  if (mods.lifesteal && tier >= 3) { const h = Math.min(mods.lifesteal, run.maxHp - run.hp); if (h > 0) { run.hp += h; note += ` 🩸+${h}.`; } }
  if (flags.straightSurge && ev.combo === 'straight') { run.hp = clamp(run.hp + 8, 0, run.maxHp); note += ' 🐸+8.'; }
  b.log = note;

  if (e.hp <= 0) { e.hp = 0; return setTimeout(winBattle, 360); }

  // enemy turn (poison ticks first)
  setTimeout(() => {
    if (e.poison) { e.hp -= e.poison; floatText($('#enemyFace'), '-' + e.poison, 'poison'); if (e.hp <= 0) { e.hp = 0; return setTimeout(winBattle, 320); } }
    let incoming = Math.max(0, e.atk - b.block);
    b.block = 0;
    if (incoming > 0) {
      // Nine Lives (Mochi): survive an otherwise-lethal blow.
      if (run.hp - incoming <= 0 && flags.nineLives && !run.nineLivesUsed) {
        run.nineLivesUsed = true; run.hp = 1; b.log = '🐱 Nine Lives! You cling on at 1 HP.';
      } else {
        run.hp -= incoming; b.log = `${e.name} hits you for ${incoming}.`;
      }
    } else { b.log = `You block ${e.name}'s blow!`; }
    if (run.hp <= 0) { run.hp = 0; return endRun(false); }
    // next turn
    b.turn++; b.held = [false, false, false, false, false]; b.rerolls = computeMods(run).rerolls; b.resolving = false; rollDice(true);
    if (run && run.battle) go(screenBattle);
  }, 520);
  if (run && run.battle) go(screenBattle);   // show the post-attack state (battle may already be won/lost)
}

function winBattle() {
  const e = run.battle.enemy;
  const isBoss = e.kind === 'boss';
  const mods = computeMods(run);
  const baseGold = (e.kind === 'boss' ? 60 : e.kind === 'elite' ? 35 : 15) + run.col * 2;
  const gold = Math.round(baseGold * mods.goldMult);
  run.gold += gold;
  run.battle = null;
  centerConfetti(); haptic(20);
  if (isBoss) { return endRun(true); }
  // pick a skill card (elites offer rarer choices)
  const offer = randomCards(3, run.cards.map(c => (typeof c === 'string') ? c : c.id));
  go(() => screenReward(gold, offer));
}

function screenReward(gold, offer) {
  render(`
    <div class="screen">
      ${runBar()}
      <div class="reward-head">
        <div class="reward-emoji">🎉</div>
        <h2>Victory!</h2>
        <p class="reward-gold">+${gold} gold</p>
        <p class="hint">Pick a skill card for your build:</p>
      </div>
      <div class="card-choices">
        ${offer.map(c => `<button class="skill-card ${c.rarity}" data-id="${c.id}">
          <span class="skill-emoji">${c.emoji}</span>
          <span class="skill-name">${esc(c.name)}</span>
          <span class="skill-rarity">${c.rarity}</span>
          <span class="skill-desc">${esc(c.desc)}</span>
        </button>`).join('')}
      </div>
      <button class="btn ghost wide" id="skipBtn">Skip — take 12 gold instead</button>
    </div>`);
  $('#quitBtn') && ($('#quitBtn').onclick = confirmQuit);
  $$('.skill-card').forEach(b => b.onclick = () => {
    const c = cardById(b.dataset.id); run.cards.push(c);
    c.onPick && c.onPick(run);
    haptic(14); toast(`${c.emoji} ${c.name} added!`); advance();
  });
  $('#skipBtn').onclick = () => { run.gold += 12; advance(); };
}

/* ---------- Treasure ---------- */
function screenTreasure() {
  const gold = 20 + rint(20) + run.col * 2;
  const card = randomCards(1, run.cards.map(c => (typeof c === 'string') ? c : c.id))[0];
  run.gold += gold; if (card) run.cards.push(card);
  centerConfetti(); haptic(16);
  render(`
    <div class="screen">
      ${runBar()}
      <div class="event-card">
        <div class="event-emoji">🎁</div>
        <h2>Treasure!</h2>
        <p class="event-text">You pry open a dusty chest.</p>
        <div class="loot-line">💰 +${gold} gold</div>
        ${card ? `<div class="loot-line">${card.emoji} <b>${esc(card.name)}</b> — ${esc(card.desc)}</div>` : ''}
        <button class="btn primary wide" id="contBtn">Onward →</button>
      </div>
    </div>`);
  $('#contBtn').onclick = advance;
}

/* ---------- Event ---------- */
function screenEvent(evt) {
  render(`
    <div class="screen">
      ${runBar()}
      <div class="event-card">
        <div class="event-emoji">${evt.emoji}</div>
        <h2>${esc(evt.title)}</h2>
        <p class="event-text">${esc(evt.text)}</p>
        <div class="event-choices">
          ${evt.choices.map((c, i) => `<button class="btn wide event-choice" data-i="${i}">${esc(c.label)}</button>`).join('')}
        </div>
      </div>
    </div>`);
  $('#quitBtn') && ($('#quitBtn').onclick = confirmQuit);
  $$('.event-choice').forEach(b => b.onclick = () => {
    const result = evt.choices[+b.dataset.i].run(run);
    haptic(10);
    if (run.hp <= 0) { run.hp = 0; return endRun(false); }
    // show outcome, then continue
    render(`
      <div class="screen">
        ${runBar()}
        <div class="event-card">
          <div class="event-emoji">${evt.emoji}</div>
          <h2>${esc(evt.title)}</h2>
          <p class="event-text result">${esc(result)}</p>
          <button class="btn primary wide" id="contBtn">Onward →</button>
        </div>
      </div>`);
    $('#contBtn').onclick = advance;
  });
}

/* ---------- Shop ---------- */
function screenShop() {
  if (!run.shopStock) {
    const cards = randomCards(3, run.cards.map(c => (typeof c === 'string') ? c : c.id));
    run.shopStock = {
      cards: cards.map(c => ({ id: c.id, price: c.rarity === 'rare' ? 55 : c.rarity === 'uncommon' ? 38 : 25, sold: false })),
      healPrice: 30, healed: false,
    };
  }
  const s = run.shopStock;
  render(`
    <div class="screen">
      ${runBar()}
      <div class="shop-head"><div class="event-emoji">🛒</div><h2>Wandering Shop</h2><p class="hint">💰 ${run.gold} gold to spend</p></div>
      <div class="list">
        ${s.cards.map((it, i) => {
          const c = cardById(it.id);
          return `<div class="shop-item ${it.sold ? 'sold' : ''}">
            <span class="skill-emoji">${c.emoji}</span>
            <div class="shop-info"><div class="hero-name">${esc(c.name)} <span class="pill">${c.rarity}</span></div><div class="hero-perk">${esc(c.desc)}</div></div>
            ${it.sold ? '<span class="owned">sold</span>'
              : `<button class="btn small ${run.gold >= it.price ? 'primary' : ''}" data-card="${i}" ${run.gold >= it.price ? '' : 'disabled'}>💰 ${it.price}</button>`}
          </div>`;
        }).join('')}
        <div class="shop-item ${s.healed ? 'sold' : ''}">
          <span class="skill-emoji">🩹</span>
          <div class="shop-info"><div class="hero-name">Field Medkit</div><div class="hero-perk">Heal 30 HP</div></div>
          ${s.healed ? '<span class="owned">used</span>'
            : `<button class="btn small ${run.gold >= s.healPrice ? 'primary' : ''}" id="buyHeal" ${run.gold >= s.healPrice ? '' : 'disabled'}>💰 ${s.healPrice}</button>`}
        </div>
      </div>
      <button class="btn ghost wide" id="leaveShop">Leave shop →</button>
    </div>`);
  $('#quitBtn') && ($('#quitBtn').onclick = confirmQuit);
  $$('[data-card]').forEach(b => b.onclick = () => {
    const it = s.cards[+b.dataset.card];
    if (it.sold || run.gold < it.price) return;
    run.gold -= it.price; it.sold = true;
    const c = cardById(it.id); run.cards.push(c); c.onPick && c.onPick(run);
    haptic(12); toast(`${c.emoji} ${c.name} bought!`); go(screenShop);
  });
  if ($('#buyHeal')) $('#buyHeal').onclick = () => {
    if (s.healed || run.gold < s.healPrice) return;
    run.gold -= s.healPrice; s.healed = true; run.hp = clamp(run.hp + 30, 0, run.maxHp);
    haptic(12); toast('Patched up! +30 HP'); go(screenShop);
  };
  $('#leaveShop').onclick = () => { run.shopStock = null; advance(); };
}

/* ---------- Rest / campfire ---------- */
function screenRest() {
  render(`
    <div class="screen">
      ${runBar()}
      <div class="event-card">
        <div class="event-emoji">🔥</div>
        <h2>A Warm Campfire</h2>
        <p class="event-text">You catch your breath by the fire.</p>
        <div class="event-choices">
          <button class="btn wide" id="restHeal">😴 Rest — heal 40% of max HP</button>
          <button class="btn wide" id="restTrain">💪 Train — +6 max HP (and heal it)</button>
        </div>
      </div>
    </div>`);
  $('#quitBtn') && ($('#quitBtn').onclick = confirmQuit);
  $('#restHeal').onclick = () => { run.hp = clamp(run.hp + Math.round(run.maxHp * 0.4), 0, run.maxHp); haptic(10); toast('Rested up. ❤️'); advance(); };
  $('#restTrain').onclick = () => { run.maxHp += 6; run.hp += 6; haptic(10); toast('Stronger. +6 max HP'); advance(); };
}

/* ---------- End of run ---------- */
function screenEnd(won, earned) {
  const hero = heroById(run.heroId);
  render(`
    <div class="screen end ${won ? 'won' : 'lost'}">
      <div class="end-emoji">${won ? '👑' : '💀'}</div>
      <h1>${won ? 'Chapter Cleared!' : 'You Fell'}</h1>
      <p class="end-sub">${won
        ? `${hero.emoji} ${esc(hero.name)} conquered the den and lived to tell it.`
        : `${hero.emoji} ${esc(hero.name)} made it to depth ${run.depth}. The den claims another.`}</p>
      <div class="end-stats">
        <div class="stat"><span class="stat-num">${run.depth}</span><span class="stat-lbl">depth reached</span></div>
        <div class="stat"><span class="stat-num">${run.cards.length}</span><span class="stat-lbl">cards collected</span></div>
        <div class="stat"><span class="stat-num">+${earned}</span><span class="stat-lbl">🐟 earned</span></div>
      </div>
      <div class="home-actions">
        <button class="btn primary big" id="againBtn">▶ Run again</button>
        <button class="btn ghost" id="homeBtn">Home</button>
      </div>
    </div>`);
  if (won) centerConfetti();
  run = null; saveRun();
  $('#againBtn').onclick = startRun;
  $('#homeBtn').onclick = () => go(screenHome);
}

/* ============================================================
   SHARED UI PIECES
   ============================================================ */
function topBar(title, right = '') {
  return `<div class="bar">
    <button class="bar-btn" id="backBtn">←</button>
    <div class="bar-title">${esc(title)}</div>
    <div class="bar-right">${right}</div>
  </div>`;
}
function runBar() {
  const hpPct = clamp(Math.round((run.hp / run.maxHp) * 100), 0, 100);
  return `<div class="run-bar">
    <button class="bar-btn" id="quitBtn" title="Abandon run">⏏</button>
    <div class="run-hp"><div class="run-hp-fill" style="width:${hpPct}%"></div><span>❤️ ${run.hp}/${run.maxHp}</span></div>
    <div class="run-gold">💰 ${run.gold}</div>
  </div>`;
}
function confirmQuit() {
  if (confirm('Abandon this run? You\'ll still bank the 🐟 you\'ve earned so far.')) endRun(false);
}

/* ============================================================
   BOOT  (or run self-tests under Node)
   ============================================================ */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    evalDice, computeDamage, baseMods, COMBO_INFO, CARDS, HEROES, TALENTS, EVENTS,
    // test hooks into the live state machine
    _startRun: startRun, _resolveNode: resolveNode, _doAttack: doAttack, _advance: advance,
    _genMap: genMap, _getRun: () => run, _getMeta: () => meta,
    buildWorld, setWorld, readTrackerItems, parseICSTitles, parseJSONTitles, MOCK_ITEMS,
  };
} else {
  document.addEventListener('DOMContentLoaded', () => {
    if (run && run.over) { run = null; saveRun(); }
    if (!WORLD) setWorld(buildWorld(MOCK_ITEMS, 'mock'));   // themed out of the box; swap anytime in World
    go(screenHome);
  });
}
