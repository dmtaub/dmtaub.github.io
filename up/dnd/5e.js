  /*
  ======================================================================
  HOMEBREW EXTENSION
  Set window.HOMEBREW_5E before this script to inject custom content.

  window.HOMEBREW_5E = {
    creatures: [
      {
        name: 'My Monster',
        typeLine: 'Medium humanoid, chaotic neutral',
        cr: '2',
        hp: '45',  hpDice: '(7d8+14)',
        ac: '14',  speed: '30 ft.',
        str:'16 (+3)', dex:'14 (+2)', con:'14 (+2)',
        int:'10 (+0)', wis:'10 (+0)', cha:'8 (-1)',
        traits: 'Optional free-text trait notes.'
      }
    ],
    rollTables: [
      { name:'My Table', die:'d6', entries:['A','B','C','D','E','F'] }
    ]
  };
  ======================================================================
*/

// ─── SRD CONFIG — loaded from 5e-meta.json ───────────────────────────────────
// All source URLs, array indices, and regex patterns live in 5e-meta.json.
// Edit that file to update offsets if the SRD source ever changes.
// The only thing hardcoded here is the path to the metadata file itself.
const META_URL = '5e-meta.json';

// ─── SRD PARSING HELPERS ─────────────────────────────────────────────────────
function elText(el) {
  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}
function tdTexts(row) {
  return [...row.querySelectorAll('td')].map(td => elText(td));
}

// ─── WEAPONS PARSER ──────────────────────────────────────────────────────────
// Expects a parsed HTML Document from DOMParser.
function parseWeapons(doc, meta) {
  const heading = doc.getElementById(meta.weapons.heading_id);
  if (!heading) return [];

  // Collect the first two <table> siblings after the heading
  const tables = [];
  let el = heading.nextElementSibling;
  while (el && tables.length < 2) {
    if (el.tagName === 'TABLE') tables.push(el);
    else if (/^H[123]$/.test(el.tagName)) break;
    el = el.nextElementSibling;
  }
  if (tables.length < 2) return [];

  // First table: header row + initial category label
  let category = 'Simple Melee Weapons';
  const headerRows = tables[0].querySelectorAll('tr');
  if (headerRows.length >= 2) {
    const cells = tdTexts(headerRows[1]);
    if (cells.length === 1 && cells[0]) category = cells[0];
  }

  // Second table: weapon rows (single-cell rows are category dividers)
  const weapons = [];
  tables[1].querySelectorAll('tr').forEach(row => {
    const cells = tdTexts(row);
    if (cells.length === 1 && cells[0]) {
      category = cells[0];
    } else if (cells.length >= 3 && cells[0]) {
      weapons.push({
        name      : cells[0],
        cost      : cells[1] || '—',
        damage    : cells[2] || '—',
        weight    : cells[3] || '—',
        properties: (cells[4] || '').replace(/\s*--\s*/g, '-') || '—',
        category,
      });
    }
  });
  return weapons;
}

// ─── MONSTER PARSER ──────────────────────────────────────────────────────────
// Expects a parsed HTML Document from DOMParser.
function parseMonsters(doc, meta) {
  const cfg       = meta.monsters;
  const typeRe    = new RegExp(cfg.type_line_re, cfg.type_line_re_flags);
  const actionSet = new Set(cfg.action_headings);
  const fp        = cfg.field_patterns;

  // Compile all field regexes from meta
  const fieldRegs = {};
  for (const [key, pat] of Object.entries(fp)) {
    fieldRegs[key] = { re: new RegExp(pat.re, pat.flags), group: pat.group, group2: pat.group2 };
  }

  // Maps action heading text → camelCase key on the monster object
  const sectionKeyMap = {
    'actions': 'actions',
    'legendary actions': 'legendaryActions',
    'reactions': 'reactions',
    'bonus actions': 'bonusActions',
    'lair actions': 'lairActions',
    'regional effects': 'regionalEffects',
  };

  const section = doc.getElementById(cfg.section_id);
  if (!section) return [];

  const monsters = [];
  let el = section.nextElementSibling;

  while (el) {
    if (el.tagName === 'H4') {
      const name = elText(el);
      if (name && name.length <= cfg.name_max_length) {

        // Find first non-empty <p> sibling — should be the type line
        let typeP = el.nextElementSibling;
        while (typeP && typeP.tagName === 'P' && !elText(typeP)) {
          typeP = typeP.nextElementSibling;
        }

        if (typeP && typeP.tagName === 'P') {
          const em = typeP.querySelector('em');
          const typeLine = em ? elText(em) : elText(typeP);

          if (typeRe.test(typeLine)) {
            const m = { name, typeLine };
            let sib = typeP.nextElementSibling;
            let k = 0;
            let currentSection = null; // null = pre-actions phase (traits live here)

            while (sib && k < cfg.lookahead_limit) {
              if (sib.tagName === 'H4') {
                const h4name = elText(sib);
                if (actionSet.has(h4name)) {
                  currentSection = sectionKeyMap[h4name.toLowerCase()] || h4name.toLowerCase().replace(/\s+/g,'');
                } else {
                  break; // new monster starts
                }
              } else if (/^H[123]$/.test(sib.tagName)) {
                break;
              } else if (sib.tagName === 'P') {
                const txt = sib.textContent;

                // Extract each known field (only until first match per field)
                for (const [key, freg] of Object.entries(fieldRegs)) {
                  if (!m[key]) {
                    const r = freg.re.exec(txt);
                    if (r) {
                      m[key] = r[freg.group];
                      if (key === 'hp' && freg.group2 && r[freg.group2]) m.hpDice = r[freg.group2];
                      if (key === 'speed') m[key] = m[key].replace(/\s+/g,' ').trim();
                    }
                  }
                }

                // Trait / action entries: identified by <b><em>Name</em></b> pattern
                const bem = sib.querySelector('b > em');
                if (bem) {
                  const bEl = bem.parentElement;
                  const rawName = elText(bem).replace(/\.\s*$/, '');
                  const entryText = txt.replace(bEl.textContent, '').replace(/^\s*[.\s]+/, '').trim();
                  const secKey = currentSection || 'traits';
                  m[secKey] = m[secKey] || [];
                  m[secKey].push({ name: rawName, text: entryText });
                } else {
                  // Continuation paragraph — append to last entry of current section
                  const secKey = currentSection || 'traits';
                  const arr = m[secKey];
                  if (arr && arr.length) {
                    const line = elText(sib);
                    if (line) arr[arr.length - 1].text += ' ' + line;
                  }
                }
              } else if (sib.tagName === 'TABLE' && !m.str) {
                const rows = sib.querySelectorAll('tr');
                if (rows.length >= 2 && tdTexts(rows[0])[0] === cfg.stat_table_first_header) {
                  [m.str, m.dex, m.con, m.int, m.wis, m.cha] = tdTexts(rows[1]);
                }
              }
              sib = sib.nextElementSibling;
              k++;
            }

            monsters.push(m);
          }
        }
      }
    }
    el = el.nextElementSibling;
  }
  return monsters;
}

// ─── SRD LOADER + CACHE ──────────────────────────────────────────────────────
async function loadSRD(meta) {
  const cached = localStorage.getItem(meta.cache_key);
  if (cached) {
    try { return JSON.parse(cached); } catch(e) { localStorage.removeItem(meta.cache_key); }
  }
  showBanner('Fetching SRD 5.1 (~1.8 MB, first visit only)…');
  const resp = await fetch(meta.srd_url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  showBanner('Parsing monsters and equipment…');
  const html   = await resp.text();
  const doc    = new DOMParser().parseFromString(html, 'text/html');
  const parsed = { weapons: parseWeapons(doc, meta), monsters: parseMonsters(doc, meta) };
  try { localStorage.setItem(meta.cache_key, JSON.stringify(parsed)); } catch(e) { /* storage full */ }
  return parsed;
}

// ─── BANNER ──────────────────────────────────────────────────────────────────
function showBanner(msg, isErr) {
  const el = document.getElementById('loadBanner');
  if (!msg) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.classList.toggle('err', !!isErr);
  document.getElementById('loadMsg').textContent = msg;
}

// ─── TABS ────────────────────────────────────────────────────────────────────
const LAST_TAB_KEY = '5e-last-tab';
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    localStorage.setItem(LAST_TAB_KEY, btn.dataset.tab);
  });
});
(function restoreTab() {
  const last = localStorage.getItem(LAST_TAB_KEY);
  if (!last) return;
  const btn = document.querySelector(`.tab-btn[data-tab="${last}"]`);
  if (btn) btn.click();
})();

// ─── STAT BLOCKS ─────────────────────────────────────────────────────────────
let ALL_CREATURES = [];
let CURRENT_FILTERED = [];

// Settings — persisted to localStorage under '5e-settings'
let settings5e = (() => { try { return JSON.parse(localStorage.getItem('5e-settings') || '{}'); } catch(e) { return {}; } })();
let cardMode = settings5e.cardMode || 'flip';

function saveSettings() { localStorage.setItem('5e-settings', JSON.stringify(settings5e)); }

function updateModeButtons() {
  document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === cardMode));
}
updateModeButtons();

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    cardMode = btn.dataset.mode;
    settings5e.cardMode = cardMode;
    saveSettings();
    updateModeButtons();
    updateHoverBar();
    buildStatGrid(document.getElementById('statSearch').value);
  });
});

// ── Renderers ────────────────────────────────────────────────────────────────

function abilityGrid(c) {
  return ['STR','DEX','CON','INT','WIS','CHA'].map((lbl, i) => {
    const val = c[['str','dex','con','int','wis','cha'][i]] || '—';
    return `<div><div class="ab-label">${lbl}</div><div class="ab-val">${val}</div></div>`;
  }).join('');
}

function hpPill(c) {
  return `<span class="stat-pill"><strong>HP</strong> ${c.hp||'?'}${c.hpDice?` <span style="color:var(--text-muted);font-size:0.75rem">${c.hpDice}</span>`:''}</span>`;
}

function backFields(c) {
  let h = '';
  const row = (label, val) => val ? `<div class="sb-back-row"><strong>${label}</strong> ${val}</div>` : '';
  h += row('Saves', c.saves);
  h += row('Skills', c.skills);
  h += row('Vulnerabilities', c.dmgVuln);
  h += row('Resistances', c.dmgRes);
  h += row('Immunities', c.dmgImm);
  h += row('Condition Imm.', c.condImm);
  h += row('Senses', c.senses);
  h += row('Languages', c.languages);
  return h;
}

function entryList(arr, title) {
  if (!arr || !arr.length) return '';
  return `<hr class="sb-divider">`
    + (title ? `<div class="sb-section-title">${title}</div>` : '')
    + arr.map(e => `<div class="sb-entry"><span class="sb-entry-name">${e.name}.</span> ${e.text}</div>`).join('');
}

function renderFront(c) {
  const isHB = c._homebrew;
  return `
    <div class="stat-block-name">${c.name}${isHB?' <span style="font-size:0.7rem;color:var(--accent-soft)">[HB]</span>':''}</div>
    <div class="stat-block-meta">${c.typeLine||c.type||''}${c.cr?' — CR '+c.cr:''}</div>
    <div class="stat-row">
      ${hpPill(c)}
      <span class="stat-pill"><strong>AC</strong> ${c.ac||'?'}</span>
      ${c.speed?`<span class="stat-pill"><strong>Spd</strong> ${c.speed}</span>`:''}
    </div>
    <div class="ability-grid">${abilityGrid(c)}</div>
    <div class="flip-hint">tap to flip ↺</div>`;
}

function renderBack(c) {
  const fields = backFields(c);
  const hasTraits = c.traits && c.traits.length;
  const hasActions = c.actions || c.reactions || c.legendaryActions || c.bonusActions;
  return `
    <div class="stat-block-name">${c.name}</div>
    <div class="stat-block-meta">${c.typeLine||''}${c.cr?' — CR '+c.cr:''}</div>
    ${fields ? `<hr class="sb-divider">${fields}` : ''}
    ${hasTraits ? entryList(c.traits) : ''}
    ${c.actions ? entryList(c.actions, 'Actions') : ''}
    ${c.reactions ? entryList(c.reactions, 'Reactions') : ''}
    ${c.bonusActions ? entryList(c.bonusActions, 'Bonus Actions') : ''}
    ${c.legendaryActions ? `<hr class="sb-divider"><div class="sb-section-title">Legendary Actions</div><div class="sb-actions-scroll">${c.legendaryActions.map(e=>`<div class="sb-entry"><span class="sb-entry-name">${e.name}.</span> ${e.text}</div>`).join('')}</div>` : ''}
    ${!fields && !hasTraits && !hasActions ? '<div style="color:var(--text-muted);font-size:0.82rem;padding:0.25rem 0">No additional data.</div>' : ''}
    <div class="flip-hint">tap to flip ↺</div>`;
}

function renderFull(c) {
  const isHB = c._homebrew;
  const fields = backFields(c);
  let h = `
    <div class="stat-block-name">${c.name}${isHB?' <span style="font-size:0.7rem;color:var(--accent-soft)">[HB]</span>':''}</div>
    <div class="stat-block-meta">${c.typeLine||c.type||''}${c.cr?' — CR '+c.cr:''}</div>
    <div class="stat-row">
      ${hpPill(c)}
      <span class="stat-pill"><strong>AC</strong> ${c.ac||'?'}</span>
      ${c.speed?`<span class="stat-pill"><strong>Spd</strong> ${c.speed}</span>`:''}
    </div>
    <div class="ability-grid">${abilityGrid(c)}</div>`;
  if (fields) h += `<hr class="sb-divider">${fields}`;
  // Homebrew string traits (legacy)
  if (typeof c.traits === 'string' && c.traits) h += `<hr class="sb-divider"><div style="font-size:0.78rem;color:var(--text-muted);line-height:1.5">${c.traits}</div>`;
  if (Array.isArray(c.traits) && c.traits.length) h += entryList(c.traits);
  if (c.actions)          h += entryList(c.actions, 'Actions');
  if (c.reactions)        h += entryList(c.reactions, 'Reactions');
  if (c.bonusActions)     h += entryList(c.bonusActions, 'Bonus Actions');
  if (c.legendaryActions) h += entryList(c.legendaryActions, 'Legendary Actions');
  return h;
}

function renderStatBlock(c, idx) {
  const isHB = c._homebrew;
  const sel  = selectedNames.has(c.name);
  const cls  = `stat-block${isHB?' homebrew':''}${cardMode==='flip'?' flip-mode':''}${sel?' selected':''}`;
  const inner = cardMode === 'full' ? renderFull(c) : renderFront(c);
  return `<div class="${cls}" data-idx="${idx}" data-face="front">
    <div class="sb-check" title="Select">${sel?'✓':''}</div>
    <div class="sb-content">${inner}</div>
  </div>`;
}

// Unified click handler on the grid
document.getElementById('statGrid').addEventListener('click', e => {
  const block = e.target.closest('.stat-block');
  if (!block) return;
  const c = CURRENT_FILTERED[+block.dataset.idx];
  if (!c) return;

  // Checkbox click — toggle selection only, don't flip
  if (e.target.closest('.sb-check')) {
    if (selectedNames.has(c.name)) selectedNames.delete(c.name);
    else selectedNames.add(c.name);
    const sel = selectedNames.has(c.name);
    block.classList.toggle('selected', sel);
    block.querySelector('.sb-check').textContent = sel ? '✓' : '';
    updateHoverBar();
    return;
  }

  // Card body click — flip animation on .sb-content only (preserves checkbox)
  if (cardMode === 'flip') {
    const content = block.querySelector('.sb-content');
    if (!content) return;
    const isFront = block.dataset.face === 'front';
    content.style.transition = 'transform 0.13s ease-in';
    content.style.transform  = 'scaleX(0)';
    setTimeout(() => {
      content.innerHTML  = isFront ? renderBack(c) : renderFront(c);
      block.dataset.face = isFront ? 'back' : 'front';
      content.style.transition = 'transform 0.13s ease-out';
      content.style.transform  = 'scaleX(1)';
    }, 130);
  }
});

// ── Monster lists ─────────────────────────────────────────────────────────────
let selectedNames = new Set();
let monsterLists  = (() => { try { return JSON.parse(localStorage.getItem('5e-monster-lists') || '[]'); } catch(e) { return []; } })();
let activeListId  = null; // id of list currently being viewed, or null
let showAllPool   = false; // when true, grid shows ALL_CREATURES even in list view

function saveMonsterLists() { localStorage.setItem('5e-monster-lists', JSON.stringify(monsterLists)); }

function updateHoverBar() {
  const n   = selectedNames.size;
  const lst = activeListId ? monsterLists.find(l => l.id === activeListId) : null;
  const bar = document.getElementById('selectionBar');
  bar.classList.toggle('visible', n > 0 || !!lst);

  // List context label + "Showing" vs "Editing"
  const ctxEl = document.getElementById('selListCtx');
  ctxEl.style.display = lst ? '' : 'none';
  if (lst) {
    const origSet = new Set(lst.names);
    const diverged = n !== origSet.size || [...selectedNames].some(x => !origSet.has(x));
    document.getElementById('selListLabel').textContent = diverged ? 'Editing:' : 'Showing:';
    document.getElementById('selListName').textContent  = `"${lst.name}"`;
    document.getElementById('selListSaved').textContent = `(${lst.names.length} saved)`;
    document.getElementById('btnUpdateList').style.display = diverged ? '' : 'none';
    document.getElementById('btnShowAll').style.display    = showAllPool ? 'none' : '';
  } else {
    document.getElementById('btnUpdateList').style.display = 'none';
    document.getElementById('btnShowAll').style.display    = 'none';
  }

  // Selection count
  document.getElementById('selectionCount').textContent = n === 1 ? '1 selected' : `${n} selected`;
}

function renderSavedLists() {
  const sec = document.getElementById('savedListsSection');
  if (!monsterLists.length) { sec.innerHTML = ''; return; }
  const chips = monsterLists.map(lst => `
    <div class="list-chip" data-lid="${lst.id}">
      <span class="list-chip-name">${lst.name}</span>
      <span class="list-chip-count">(${lst.names.length})</span>
      <button class="list-chip-btn show-btn" data-lid="${lst.id}" title="Filter to this list">Show</button>
      <button class="list-chip-btn del" data-lid="${lst.id}" title="Delete list">✕</button>
    </div>`).join('');
  sec.innerHTML = `<div class="saved-lists-header"><h3>Saved Lists</h3></div><div class="list-chips">${chips}</div>`;
  sec.querySelectorAll('.show-btn').forEach(btn => btn.addEventListener('click', () => showList(btn.dataset.lid)));
  sec.querySelectorAll('.list-chip-btn.del').forEach(btn => btn.addEventListener('click', () => deleteList(btn.dataset.lid)));
}

function showList(id) {
  const lst = monsterLists.find(l => l.id === id);
  if (!lst) return;
  activeListId  = id;
  showAllPool   = false;
  selectedNames = new Set(lst.names);
  document.getElementById('statSearch').value = '';
  updateHoverBar();
  buildStatGrid('');
}

function deleteList(id) {
  const lst = monsterLists.find(l => l.id === id);
  if (!lst || !confirm(`Delete list "${lst.name}"?`)) return;
  monsterLists = monsterLists.filter(l => l.id !== id);
  saveMonsterLists();
  if (activeListId === id) {
    activeListId = null;
    selectedNames.clear();
    updateHoverBar();
    buildStatGrid(document.getElementById('statSearch').value);
  }
  renderSavedLists();
}

function saveNewList(name, names) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  monsterLists.push({ id, name, names: [...names] });
  saveMonsterLists();
  renderSavedLists();
}

document.getElementById('btnUpdateList').addEventListener('click', () => {
  const lst = activeListId ? monsterLists.find(l => l.id === activeListId) : null;
  if (!lst) return;
  lst.names = [...selectedNames];
  saveMonsterLists();
  renderSavedLists();
  updateHoverBar();
});

document.getElementById('btnSaveList').addEventListener('click', () => {
  if (!selectedNames.size) return;
  const name = prompt('List name:', 'My List');
  if (!name) return;
  saveNewList(name, selectedNames);
  selectedNames.clear();
  activeListId = null;
  updateHoverBar();
  buildStatGrid(document.getElementById('statSearch').value);
});

document.getElementById('btnShowAll').addEventListener('click', () => {
  showAllPool = true;
  updateHoverBar();
  buildStatGrid(document.getElementById('statSearch').value);
});

document.getElementById('btnClearSel').addEventListener('click', () => {
  selectedNames.clear();
  activeListId  = null;
  showAllPool   = false;
  updateHoverBar();
  buildStatGrid(document.getElementById('statSearch').value);
});

function buildStatGrid(filter) {
  const q   = (filter || '').toLowerCase();
  const lst = activeListId ? monsterLists.find(l => l.id === activeListId) : null;
  // Use full pool when: no active list, showAllPool flag set, or user is typing a search
  const pool = (lst && !showAllPool && !q)
    ? ALL_CREATURES.filter(c => lst.names.includes(c.name))
    : ALL_CREATURES;
  CURRENT_FILTERED = q
    ? pool.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.typeLine||'').toLowerCase().includes(q) ||
        ('cr'+(c.cr||'')).includes(q)
      )
    : pool;
  const grid = document.getElementById('statGrid');
  if (!CURRENT_FILTERED.length) {
    grid.innerHTML = `<p class="stat-empty">${q ? 'No matches.' : 'No creatures loaded.'}</p>`;
    return;
  }
  grid.innerHTML = `<div class="stat-grid">${CURRENT_FILTERED.map((c, i) => renderStatBlock(c, i)).join('')}</div>`;
}

document.getElementById('statSearch').addEventListener('input', e => {
  if (activeListId && e.target.value) showAllPool = true;
  buildStatGrid(e.target.value);
  updateHoverBar();
});

// ─── ROLL TABLES ─────────────────────────────────────────────────────────────
const BUILTIN_ROLL_TABLES = [
  { name:'Random NPC Trait', die:'d20', entries:['Speaks in a constant whisper','Missing an ear','Hums tunelessly while thinking','Never makes eye contact','Constantly fidgets with a ring','Has a noticeable regional accent','Distrusts magic deeply','Carries a faded letter they won\'t explain','Laughs at inappropriate times','Smells strongly of pine or herbs','Has a glass eye','Quotes proverbs that don\'t quite fit','Excessively formal in all speech','Treats their horse better than people','Scars from an obvious old fire','Wears mismatched boots','Twitches when someone mentions a specific city','Speaks to animals as if they understand','Keeps a detailed journal, writes after every conversation','Claims to have met someone famous under dubious circumstances'] },
  { name:'NPC Motivation', die:'d12', entries:['Survival — desperate, running out of options','Loyalty — protecting someone they love','Greed — always weighing what\'s in it for them','Duty — bound by oath, law, or station','Fear — something threatens them or their secret','Ambition — on the rise, using everyone as a step','Grief — a recent loss is driving their choices','Curiosity — can\'t leave a mystery alone','Revenge — a specific wrong consumes them','Guilt — atoning for something real or imagined','Idealism — truly believes in a cause, however naively','Manipulation — lying about all of the above'] },
  { name:'Urban Encounter', die:'d12', entries:['A pickpocket fleeing through the crowd','Two merchants in heated dispute, gathering an audience','A street healer hawking dubious remedies','A guard looking for someone matching one PC\'s description','A hooded figure drops a sealed letter and disappears','A public flogging drawing a crowd','A beggar who knows more than they let on','A cart overturns spilling exotic goods','A bard who\'s heard of the party — and has the details wrong','A fire breaks out in a nearby building','Two rival gang members eyeing each other across the market','A child following the party convinced one of them is their lost parent'] },
  { name:'Wilderness Encounter', die:'d12', entries:['Tracks of something large — recent','An abandoned campsite, still-warm coals','A wounded traveler, alone on the road','A merchant caravan stopped for a broken wheel','Strange fog that doesn\'t lift till midday','Territorial predator blocking the path','A standing stone with faded script','Goblin or bandit ambush, poorly executed','An old shrine with a fresh offering','A flooded river crossing — needs another route','Another adventuring party, going the opposite direction','Evidence of a battle — no survivors, but recent'] },
  { name:'Dungeon Event', die:'d10', entries:['Distant scraping stone','A light source ahead that shouldn\'t be there','Water seeping through the ceiling','Smell of something rotting','Graffiti in a language nobody recognizes','A tripwire, already disarmed','Sounds of arguing creatures in the next room','A door opens from the other side as the party approaches','A section of floor gives slightly underfoot','Something small scurries away from the torchlight'] },
  { name:'Weather', die:'d8', entries:['Clear and still — unnaturally quiet','Light rain, comfortable for travel','Heavy rain — visibility halved, tracks wash away','Thunderstorm — Perception at disadvantage','Thick fog — 60 ft max visibility','Scorching heat — DC 10 Con per hour or 1 exhaustion','Bitter cold — unprotected: 1d4 cold damage per hour','Unseasonal snow or hail — difficult terrain outdoors'] },
  { name:'Treasure Flavor', die:'d12', entries:['Gold coins with an unfamiliar mint mark','A gem wrapped in oilcloth and hidden in a boot','A small statue of a deity — valuable to the right buyer','A letter of credit from a distant bank','Fine jewelry, clearly a set — one piece missing','A vial of perfume worth more than it looks','A small locked box with no key','Military medals from a disbanded order','A pouch of spell components — one rare ingredient included','A hand-drawn map with no labels, only landmarks','Promissory notes signed by a local noble','An antique weapon — no magic, but historically significant'] },
  { name:'Random Human Name', die:'d12', entries:['Aldric Vane','Seren Holt','Mira Ashwood','Torben Gull','Isolde Crane','Daveth Marsh','Lysa Fenn','Corwin Slate','Nessa Briar','Edric Hale','Wynn Caldwell','Petra Dusk'] },
];

let ALL_ROLL_TABLES = [];

function buildRollTables(tables) {
  ALL_ROLL_TABLES = tables;
  const container = document.getElementById('rollTablesContainer');
  container.innerHTML = tables.map((t, i) => {
    const isHB = t._homebrew ? ' <span style="font-size:0.72rem;color:var(--accent-soft)">[HB]</span>' : '';
    return `<div class="roll-section">
      <div class="roll-header" data-idx="${i}">
        <h3>${t.name}${isHB}</h3>
        <span class="roll-meta">${t.die} · ${t.entries.length} results</span>
      </div>
      <div class="roll-body" id="rtbody-${i}">
        <div class="roll-result-bar">
          <button class="btn-roll" data-idx="${i}">Roll ${t.die}</button>
          <span class="roll-result-text" id="rtresult-${i}">—</span>
        </div>
        <table class="ref-table"><thead><tr><th>#</th><th>Result</th></tr></thead><tbody>
          ${t.entries.map((e,j) => `<tr><td>${j+1}</td><td>${e}</td></tr>`).join('')}
        </tbody></table>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.roll-header').forEach(h => {
    h.addEventListener('click', () => document.getElementById('rtbody-'+h.dataset.idx).classList.toggle('open'));
  });
  container.querySelectorAll('.btn-roll').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const t = ALL_ROLL_TABLES[btn.dataset.idx];
      document.getElementById('rtresult-'+btn.dataset.idx).textContent =
        t.entries[Math.floor(Math.random() * t.entries.length)];
    });
  });
}

// ─── NARRATIVE ───────────────────────────────────────────────────────────────
const NARRATIVE_DATA = [
  { icon:'🌿', category:'Environmental Hazards', scenarios:[
    { name:'Hostile Environment Travel', sub:'blizzard, poisoned tunnel, volcanic heat', steps:[
      { check:'Group Survival (Wis)', note:'find the safest path — fail = disadvantage forward' },
      { check:'Con Save', note:'resist environmental damage (cold, poison, heat)' },
      { check:'Perception', note:'notice a shortcut, shelter, or incoming danger' },
    ]},
    { name:'Unstable Terrain', sub:'cave-in, crumbling floor, flooding chamber', steps:[
      { check:'Perception', note:'spot the danger first' },
      { check:'Dex Save', note:'avoid being caught' },
      { check:'Athletics or Acrobatics', note:'get clear / help someone else' },
    ]},
  ]},
  { icon:'🗣️', category:'Social Encounters', scenarios:[
    { name:'Hostile NPC Negotiation', sub:'guard, enemy, suspicious elder', steps:[
      { check:'Insight', note:'read their true motivation' },
      { check:'Persuasion or Deception', note:'the pitch' },
      { check:'Insight (again)', note:'did it land? Are they hiding something?' },
    ]},
    { name:'Earning Trust Over Time', sub:'multi-beat conversation, cautious NPCs', steps:[
      { check:'Persuasion', note:'open them up' },
      { check:'History or Investigation', note:'demonstrate you know something real' },
      { check:'Insight', note:'catch their tell / know when to stop pushing' },
    ]},
  ]},
  { icon:'🏃', category:'Chase Sequences', scenarios:[
    { name:'Foot Chase', sub:'urban or wilderness pursuit', steps:[
      { check:'Initiative', note:'who moves first' },
      { check:'Athletics vs Athletics/Acrobatics (contested, repeated)', note:'core pursuit rolls' },
      { check:'Perception', note:'spot a shortcut or obstacle ahead' },
      { check:'Acrobatics or Dex Save', note:'navigate obstacle — fence, crowd, rubble' },
      { check:'Sleight of Hand (optional)', note:'drop something to slow pursuer' },
    ]},
    { name:'Mounted or Tunnel Chase', sub:'horse, cart, narrow passages', steps:[
      { check:'Animal Handling or Vehicle check', note:'replaces Athletics for mount/vehicle' },
      { check:'Survival', note:'navigate branching paths or shortcuts' },
    ]},
  ]},
  { icon:'🔍', category:'Investigation Scenes', scenarios:[
    { name:'Searching a Room / Body', sub:'any careful examination scene', steps:[
      { check:'Perception', note:'notice anything obvious' },
      { check:'Investigation', note:'find what\'s hidden' },
      { check:'Arcana, History, or Nature', note:'understand what you found' },
    ]},
    { name:'Decoding a Clue', sub:'cipher, coded message, ancient text', steps:[
      { check:'Investigation', note:'structure of the code' },
      { check:'History or Arcana', note:'recognize the system' },
      { check:'Insight', note:'guess intent from context even without a full decode' },
    ]},
  ]},
  { icon:'⚔️', category:'Combat with Environmental Pressure', scenarios:[
    { name:'Timed Fight', sub:'ritual completing, structure collapsing', steps:[
      { check:'Countdown each round (pulse)', note:'Pulse 3: partial effect (disadv on saves); Pulse 5: full effect triggers unless stopped' },
    ]},
    { name:'Fight + Escape Hybrid', sub:'fight your way out through a hazard', steps:[
      { check:'Combat round(s)', note:'create an opening' },
      { check:'Athletics or Acrobatics', note:'move through hazard' },
      { check:'Con Save', note:'resist lingering damage — smoke, water, cold' },
    ]},
  ]},
  { icon:'🧩', category:'Puzzles / Ancient Mechanisms', scenarios:[
    { name:'Activating Old Magic', sub:'ancient device, forgotten machinery', steps:[
      { check:'Arcana or History', note:'understand what it does' },
      { check:'Investigation', note:'find the activation method' },
      { check:'Dexterity or spell check', note:'execute correctly' },
    ]},
    { name:'Ritual Disruption', sub:'shaman mid-ritual, enemy spellcaster', steps:[
      { check:'Arcana', note:'understand what\'s happening' },
      { check:'Contested roll or spell save', note:'interrupt it' },
      { check:'Con or Wis Save', note:'resist backlash' },
    ]},
  ]},
  { icon:'🤝', category:'Group Dynamics', scenarios:[
    { name:'Group Stealth', sub:'everyone must stay quiet', steps:[
      { check:'Everyone rolls Stealth', note:'lowest roll is what matters — consider letting a skilled scout go ahead' },
    ]},
    { name:'Group Morale Check', sub:'after a major loss or scary revelation', steps:[
      { check:'Wis Save DC 10–12 (each player)', note:'fail = one round hesitation / disadv on next action' },
      { check:'DM note', note:'can be skipped if it would feel punishing for younger/newer players' },
    ]},
  ]},
  { icon:'🌊', category:'Water / Spirit Encounters', scenarios:[
    { name:'Appeasing a Nature Spirit', sub:'river spirit, ancient grove guardian', steps:[
      { check:'Nature or Religion', note:'know the right approach' },
      { check:'Persuasion or Performance', note:'make the offering correctly' },
      { check:'Insight or Perception', note:'read the spirit\'s response' },
    ]},
    { name:'Corrupted Water Navigation', sub:'tainted river, poisoned fen', steps:[
      { check:'Survival', note:'find the safe crossing' },
      { check:'Con Save', note:'resist sickness/corruption on contact' },
      { check:'Perception', note:'spot what\'s causing it upstream' },
    ]},
  ]},
  { icon:'🏕️', category:'Downtime / Camp Scenes', scenarios:[
    { name:'Making Camp in Dangerous Territory', sub:'hostile wilderness, enemy-controlled region', steps:[
      { check:'Survival', note:'find a defensible spot' },
      { check:'Stealth (group)', note:'settle in without being noticed' },
      { check:'Perception', note:'watch rotation — catch anything during the night' },
    ]},
    { name:'Treating Wounds in the Field', sub:'post-combat recovery', steps:[
      { check:'Medicine', note:'stabilize / maximize healing' },
      { check:'Herbalism Kit (optional)', note:'bonus HP if a skilled healer assists' },
    ]},
  ]},
];

function buildNarrative() {
  const container = document.getElementById('narrativeContainer');
  let html = '';
  NARRATIVE_DATA.forEach((section, si) => {
    html += `<div class="card" style="margin-bottom:0.85rem"><h2>${section.icon} ${section.category}</h2>`;
    section.scenarios.forEach((sc, sci) => {
      const id = `nb-${si}-${sci}`;
      html += `<div class="narrative-section">
        <div class="narrative-header" data-id="${id}">
          <span class="nh-icon">▶</span>
          <h3>${sc.name}</h3>
          <span class="nh-sub">${sc.sub}</span>
        </div>
        <div class="narrative-body" id="${id}">
          ${sc.steps.map((s,k) => `<div class="roll-step">
            <span class="roll-step-num">${k+1}</span>
            <div>
              <div class="roll-step-text"><strong>${s.check}</strong></div>
              ${s.note ? `<div class="roll-step-note">${s.note}</div>` : ''}
            </div>
          </div>`).join('')}
        </div>
      </div>`;
    });
    html += `</div>`;
  });
  container.innerHTML = html;
  container.querySelectorAll('.narrative-header').forEach(h => {
    h.addEventListener('click', () => {
      const body = document.getElementById(h.dataset.id);
      const open = body.classList.toggle('open');
      h.querySelector('.nh-icon').textContent = open ? '▼' : '▶';
    });
  });
}

// ─── REFERENCE — WEAPONS ─────────────────────────────────────────────────────
function buildWeaponsTable(weapons) {
  const wrap = document.getElementById('weaponsTableWrap');
  if (!weapons || !weapons.length) {
    wrap.innerHTML = '<p style="color:var(--text-muted);font-size:0.88rem">Could not load weapon data.</p>';
    return;
  }
  // Group by category
  const byCategory = {};
  for (const w of weapons) {
    if (!byCategory[w.category]) byCategory[w.category] = [];
    byCategory[w.category].push(w);
  }
  let html = '<table class="ref-table"><thead><tr><th>Name</th><th>Cost</th><th>Damage</th><th>Weight</th><th>Properties</th></tr></thead><tbody>';
  for (const [cat, ws] of Object.entries(byCategory)) {
    html += `<tr class="ref-section-row"><td colspan="5">${cat}</td></tr>`;
    for (const w of ws) {
      html += `<tr><td>${w.name}</td><td>${w.cost}</td><td>${w.damage}</td><td>${w.weight}</td><td>${w.properties}</td></tr>`;
    }
  }
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

// ─── ENCOUNTER BUILDER ───────────────────────────────────────────────────────
const CONDITIONS = ['Blinded','Charmed','Frightened','Grappled','Incapacitated','Invisible','Paralyzed','Poisoned','Prone','Restrained','Stunned','Unconscious'];

let encounterState = (() => {
  try { return JSON.parse(localStorage.getItem('5e-encounters') || 'null'); } catch(e) {}
  return null;
})() || { slots:[{ name:'Encounter 1', combatants:[] }], current:0, round:1, turn:0 };

function saveEnc() { localStorage.setItem('5e-encounters', JSON.stringify(encounterState)); }
function curEnc()  { return encounterState.slots[encounterState.current]; }

function renderSlots() {
  const el = document.getElementById('encSlots');
  el.innerHTML = encounterState.slots.map((s,i) =>
    `<span class="enc-slot ${i===encounterState.current?'active':''}" data-i="${i}">${s.name}</span>`
  ).join('');
  el.querySelectorAll('.enc-slot').forEach(sp => sp.addEventListener('click', () => {
    encounterState.current = parseInt(sp.dataset.i);
    encounterState.round = 1; encounterState.turn = 0;
    saveEnc(); renderAll();
  }));
}

function hpClass(cur, max) {
  if (!max) return '';
  const p = cur / max;
  return p <= 0.25 ? 'low' : p <= 0.5 ? 'mid' : '';
}

function renderCombatants() {
  const enc = curEnc();
  const list = document.getElementById('combatantList');
  if (!enc.combatants.length) {
    list.innerHTML = '<div style="color:var(--text-muted);font-size:0.88rem;padding:0.4rem 0">No combatants. Add one above.</div>';
    return;
  }
  list.innerHTML = enc.combatants.map((c,i) => {
    const pct = c.maxHp > 0 ? Math.max(0, Math.min(100, c.hp / c.maxHp * 100)) : 100;
    const conds = c.conditions || [];
    return `<div class="combatant-row ${encounterState.turn===i?'active-turn':''} ${c.hp<=0?'defeated':''}">
      <div class="comb-init">${c.initiative??'—'}</div>
      <div class="comb-name">${c.name} <span style="font-size:0.7rem;color:var(--text-muted)">(${c.type})</span></div>
      <div class="comb-ac">AC ${c.ac}</div>
      <div class="comb-hp-wrap">
        <div class="hp-bar-wrap"><div class="hp-bar ${hpClass(c.hp,c.maxHp)}" style="width:${pct}%"></div></div>
        <span class="comb-hp">
          <input class="comb-hp-input" data-i="${i}" type="number" value="${c.hp}" min="0" max="${c.maxHp}"> / ${c.maxHp}
        </span>
      </div>
      <div class="comb-conditions">${CONDITIONS.map(cd =>
        `<span class="condition-tag ${conds.includes(cd)?'on':''}" data-i="${i}" data-cond="${cd}" title="${cd}">${cd.substring(0,3)}</span>`
      ).join('')}</div>
      <button class="btn danger sm" data-rm="${i}">✕</button>
    </div>`;
  }).join('');

  list.querySelectorAll('.comb-hp-input').forEach(inp => inp.addEventListener('change', () => {
    curEnc().combatants[+inp.dataset.i].hp = Math.max(0, +inp.value || 0);
    saveEnc(); renderCombatants();
  }));
  list.querySelectorAll('.condition-tag').forEach(tag => tag.addEventListener('click', () => {
    const c = curEnc().combatants[+tag.dataset.i];
    c.conditions = c.conditions || [];
    const idx = c.conditions.indexOf(tag.dataset.cond);
    if (idx >= 0) c.conditions.splice(idx,1); else c.conditions.push(tag.dataset.cond);
    saveEnc(); renderCombatants();
  }));
  list.querySelectorAll('[data-rm]').forEach(btn => btn.addEventListener('click', () => {
    curEnc().combatants.splice(+btn.dataset.rm, 1);
    if (encounterState.turn >= curEnc().combatants.length) encounterState.turn = 0;
    saveEnc(); renderAll();
  }));
}

function renderRoundTracker() {
  document.getElementById('roundNum').textContent = encounterState.round;
  const t = curEnc().combatants[encounterState.turn];
  document.getElementById('turnNum').textContent = t ? t.name : '—';
}

function renderAll() { renderSlots(); renderCombatants(); renderRoundTracker(); }

document.getElementById('btnNewEnc').addEventListener('click', () => {
  const name = prompt('Encounter name:', 'Encounter '+(encounterState.slots.length+1));
  if (!name) return;
  encounterState.slots.push({ name, combatants:[] });
  encounterState.current = encounterState.slots.length - 1;
  encounterState.round = 1; encounterState.turn = 0;
  saveEnc(); renderAll();
});
document.getElementById('btnRenameEnc').addEventListener('click', () => {
  const name = prompt('New name:', curEnc().name);
  if (name) { curEnc().name = name; saveEnc(); renderSlots(); }
});
document.getElementById('btnDeleteEnc').addEventListener('click', () => {
  if (encounterState.slots.length <= 1) { alert('Cannot delete the last encounter.'); return; }
  if (!confirm('Delete "'+curEnc().name+'"?')) return;
  encounterState.slots.splice(encounterState.current, 1);
  encounterState.current = Math.max(0, encounterState.current - 1);
  encounterState.round = 1; encounterState.turn = 0;
  saveEnc(); renderAll();
});
document.getElementById('btnAddCombatant').addEventListener('click', () => {
  const name = document.getElementById('addName').value.trim();
  if (!name) return;
  const maxHp = parseInt(document.getElementById('addHp').value) || 10;
  const ac    = parseInt(document.getElementById('addAc').value)  || 10;
  const initV = document.getElementById('addInit').value.trim();
  curEnc().combatants.push({ name, hp:maxHp, maxHp, ac, initiative: initV!=='' ? +initV : null, type: document.getElementById('addType').value, conditions:[] });
  saveEnc(); renderCombatants();
  document.getElementById('addName').value = '';
  ['addHp','addAc','addInit'].forEach(id => document.getElementById(id).value = '');
});
document.getElementById('addName').addEventListener('keydown', e => { if (e.key==='Enter') document.getElementById('btnAddCombatant').click(); });
document.getElementById('btnNextTurn').addEventListener('click', () => {
  const cs = curEnc().combatants;
  if (!cs.length) return;
  encounterState.turn = (encounterState.turn + 1) % cs.length;
  if (encounterState.turn === 0) encounterState.round++;
  saveEnc(); renderAll();
});
document.getElementById('btnRollInit').addEventListener('click', () => {
  curEnc().combatants.forEach(c => { c.initiative = Math.floor(Math.random()*20)+1; });
  saveEnc(); renderCombatants();
});
document.getElementById('btnSortInit').addEventListener('click', () => {
  curEnc().combatants.sort((a,b) => (b.initiative??-99)-(a.initiative??-99));
  encounterState.turn = 0;
  saveEnc(); renderCombatants();
});
document.getElementById('btnResetRound').addEventListener('click', () => {
  encounterState.round = 1; encounterState.turn = 0;
  saveEnc(); renderRoundTracker();
});
document.getElementById('btnExport').addEventListener('click', () => {
  document.getElementById('jsonIO').value = JSON.stringify(curEnc(), null, 2);
});
document.getElementById('btnImport').addEventListener('click', () => {
  try {
    const d = JSON.parse(document.getElementById('jsonIO').value);
    if (!Array.isArray(d.combatants)) throw new Error('Missing combatants array');
    encounterState.slots[encounterState.current] = d;
    encounterState.turn = 0;
    saveEnc(); renderAll();
  } catch(e) { alert('Invalid JSON: '+e.message); }
});

// ─── ROSTERS ─────────────────────────────────────────────────────────────────
let playerRoster = (() => { try { return JSON.parse(localStorage.getItem('5e-players') || '[]'); } catch(e) { return []; } })();
let npcRoster    = (() => { try { return JSON.parse(localStorage.getItem('5e-npcs')    || '[]'); } catch(e) { return []; } })();

function savePlayerRoster() { localStorage.setItem('5e-players', JSON.stringify(playerRoster)); }
function saveNpcRoster()    { localStorage.setItem('5e-npcs',    JSON.stringify(npcRoster)); }

function rosterFormHTML(d) {
  d = d || {};
  return `<div class="roster-form">
    <div class="roster-form-grid">
      <div class="field-group"><label>Name *</label><input class="enc-input" id="rfName" placeholder="Aragorn" value="${d.name||''}"></div>
      <div class="field-group"><label>Class / Role</label><input class="enc-input" id="rfCls" placeholder="Ranger" value="${d.cls||''}"></div>
      <div class="field-group"><label>Level / CR</label><input class="enc-input" id="rfLevel" type="number" min="0" placeholder="5" value="${d.level||''}"></div>
      <div class="field-group"><label>Max HP</label><input class="enc-input" id="rfHp" type="number" min="1" placeholder="52" value="${d.maxHp||''}"></div>
      <div class="field-group"><label>AC</label><input class="enc-input" id="rfAc" type="number" min="0" placeholder="16" value="${d.ac||''}"></div>
      <div class="field-group"><label>Init Bonus</label><input class="enc-input" id="rfInit" type="number" placeholder="0" value="${d.initMod != null ? d.initMod : ''}"></div>
    </div>
    <div class="roster-form-actions">
      <button class="btn sm" id="rfSave">Save</button>
      <button class="btn secondary sm" id="rfCancel">Cancel</button>
    </div>
  </div>`;
}

function readRosterForm(existing) {
  const name = document.getElementById('rfName').value.trim();
  if (!name) return null;
  return {
    id: existing ? existing.id : Date.now() + '_' + Math.random(),
    name,
    cls:     document.getElementById('rfCls').value.trim(),
    level:   parseInt(document.getElementById('rfLevel').value) || null,
    maxHp:   parseInt(document.getElementById('rfHp').value)    || null,
    ac:      parseInt(document.getElementById('rfAc').value)    || null,
    initMod: parseInt(document.getElementById('rfInit').value)  || 0,
  };
}

function openRosterForm(wrap, existing, onSave) {
  wrap.style.display = '';
  wrap.innerHTML = rosterFormHTML(existing);
  document.getElementById('rfSave').addEventListener('click', () => {
    const entry = readRosterForm(existing);
    if (!entry) return;
    onSave(entry);
    wrap.style.display = 'none';
    wrap.innerHTML = '';
  });
  document.getElementById('rfCancel').addEventListener('click', () => {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
  });
}

function renderRosterCards(roster, gridId, formWrapId, onDelete, onEdit) {
  const grid = document.getElementById(gridId);
  if (!roster.length) {
    grid.innerHTML = '<p class="stat-empty">None yet.</p>';
    return;
  }
  grid.innerHTML = roster.map((p, i) => `
    <div class="roster-card">
      <div class="roster-card-actions">
        <button data-edit="${i}" title="Edit">✎</button>
        <button class="del" data-del="${i}" title="Delete">✕</button>
      </div>
      <div class="roster-card-name">${p.name}</div>
      <div class="roster-card-sub">${[p.cls, p.level ? 'Level '+p.level : ''].filter(Boolean).join(' · ') || '&nbsp;'}</div>
      <div class="roster-card-stats">
        ${p.maxHp != null ? `<span class="stat-pill"><strong>HP</strong> ${p.maxHp}</span>` : ''}
        ${p.ac    != null ? `<span class="stat-pill"><strong>AC</strong> ${p.ac}</span>`    : ''}
        <span class="stat-pill"><strong>Init</strong> ${p.initMod >= 0 ? '+' : ''}${p.initMod}</span>
      </div>
    </div>`).join('');
  grid.querySelectorAll('[data-del]').forEach(btn =>
    btn.addEventListener('click', () => onDelete(+btn.dataset.del)));
  grid.querySelectorAll('[data-edit]').forEach(btn =>
    btn.addEventListener('click', () => onEdit(+btn.dataset.edit)));
}

function renderPlayerRoster() {
  const wrap = document.getElementById('playerFormWrap');
  renderRosterCards(playerRoster, 'playerGrid', 'playerFormWrap',
    i => { playerRoster.splice(i, 1); savePlayerRoster(); renderPlayerRoster(); },
    i => openRosterForm(wrap, playerRoster[i], entry => {
      playerRoster[i] = entry; savePlayerRoster(); renderPlayerRoster();
    })
  );
}

function renderNpcRoster() {
  const wrap = document.getElementById('npcFormWrap');
  renderRosterCards(npcRoster, 'npcGrid', 'npcFormWrap',
    i => { npcRoster.splice(i, 1); saveNpcRoster(); renderNpcRoster(); },
    i => openRosterForm(wrap, npcRoster[i], entry => {
      npcRoster[i] = entry; saveNpcRoster(); renderNpcRoster();
    })
  );
}

document.getElementById('btnAddPlayer').addEventListener('click', () =>
  openRosterForm(document.getElementById('playerFormWrap'), null, entry => {
    playerRoster.push(entry); savePlayerRoster(); renderPlayerRoster();
  })
);
document.getElementById('btnAddNpc').addEventListener('click', () =>
  openRosterForm(document.getElementById('npcFormWrap'), null, entry => {
    npcRoster.push(entry); saveNpcRoster(); renderNpcRoster();
  })
);

// ─── INITIALISE ──────────────────────────────────────────────────────────────
buildNarrative();
renderAll();
renderSavedLists();
renderPlayerRoster();
renderNpcRoster();

(async function init() {
  try {
    showBanner('Loading configuration…');
    const metaResp = await fetch(META_URL);
    if (!metaResp.ok) throw new Error(`Could not load ${META_URL} (HTTP ${metaResp.status})`);
    const meta = await metaResp.json();

    const srd = await loadSRD(meta);
    const hb  = window.HOMEBREW_5E || {};

    ALL_CREATURES = [
      ...srd.monsters,
      ...(hb.creatures || []).map(c => ({ ...c, _homebrew:true })),
    ];

    const allTables = [
      ...BUILTIN_ROLL_TABLES,
      ...(hb.rollTables || []).map(t => ({ ...t, _homebrew:true })),
    ];

    buildStatGrid('');
    buildRollTables(allTables);
    buildWeaponsTable(srd.weapons);
    showBanner(null);
  } catch(e) {
    console.error('SRD load failed:', e);
    showBanner('Could not load SRD data — check your connection and refresh. Encounter builder and narrative rolls still work.', true);
    buildStatGrid('');
    buildRollTables(BUILTIN_ROLL_TABLES);
    buildWeaponsTable([]);
  }
})();
