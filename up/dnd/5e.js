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
  _topbar.showStatus('Fetching SRD 5.1 (~1.8 MB, first visit only)…');
  const resp = await fetch(meta.srd_url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  _topbar.showStatus('Parsing monsters and equipment…');
  const html   = await resp.text();
  const doc    = new DOMParser().parseFromString(html, 'text/html');
  const parsed = { weapons: parseWeapons(doc, meta), monsters: parseMonsters(doc, meta) };
  try { localStorage.setItem(meta.cache_key, JSON.stringify(parsed)); } catch(e) { /* storage full */ }
  return parsed;
}

// ─── BANNER ──────────────────────────────────────────────────────────────────
const _topbar = document.querySelector('page-topbar');

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

// ─── INNER TABS (Rolls panel) ────────────────────────────────────────────────
const LAST_INNER_TAB_KEY = '5e-last-inner-tab';
document.querySelectorAll('.inner-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.inner-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.inner-tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('inner-tab-' + btn.dataset.innerTab).classList.add('active');
    localStorage.setItem(LAST_INNER_TAB_KEY, btn.dataset.innerTab);
  });
});
(function restoreInnerTab() {
  const last = localStorage.getItem(LAST_INNER_TAB_KEY);
  if (!last) return;
  const key = last === 'npcs' || last === 'inviting' ? 'social' : last;
  const btn = document.querySelector(`.inner-tab-btn[data-inner-tab="${key}"]`);
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
  { name:'Random NPC Trait', die:'d20', tab:'npcs', entries:['Speaks in a constant whisper','Missing an ear','Hums tunelessly while thinking','Never makes eye contact','Constantly fidgets with a ring','Has a noticeable regional accent','Distrusts magic deeply','Carries a faded letter they won\'t explain','Laughs at inappropriate times','Smells strongly of pine or herbs','Has a glass eye','Quotes proverbs that don\'t quite fit','Excessively formal in all speech','Treats their horse better than people','Scars from an obvious old fire','Wears mismatched boots','Twitches when someone mentions a specific city','Speaks to animals as if they understand','Keeps a detailed journal, writes after every conversation','Claims to have met someone famous under dubious circumstances'] },
  { name:'NPC Motivation', die:'d12', tab:'npcs', entries:['Survival — desperate, running out of options','Loyalty — protecting someone they love','Greed — always weighing what\'s in it for them','Duty — bound by oath, law, or station','Fear — something threatens them or their secret','Ambition — on the rise, using everyone as a step','Grief — a recent loss is driving their choices','Curiosity — can\'t leave a mystery alone','Revenge — a specific wrong consumes them','Guilt — atoning for something real or imagined','Idealism — truly believes in a cause, however naively','Manipulation — lying about all of the above'] },
  { name:'Random Human Name', die:'d12', tab:'npcs', entries:['Aldric Vane','Seren Holt','Mira Ashwood','Torben Gull','Isolde Crane','Daveth Marsh','Lysa Fenn','Corwin Slate','Nessa Briar','Edric Hale','Wynn Caldwell','Petra Dusk'] },
  { name:'Urban Encounter', die:'d12', tab:'enc-setup', entries:['A pickpocket fleeing through the crowd','Two merchants in heated dispute, gathering an audience','A street healer hawking dubious remedies','A guard looking for someone matching one PC\'s description','A hooded figure drops a sealed letter and disappears','A public flogging drawing a crowd','A beggar who knows more than they let on','A cart overturns spilling exotic goods','A bard who\'s heard of the party — and has the details wrong','A fire breaks out in a nearby building','Two rival gang members eyeing each other across the market','A child following the party convinced one of them is their lost parent'] },
  { name:'Wilderness Encounter', die:'d12', tab:'enc-setup', entries:['Tracks of something large — recent','An abandoned campsite, still-warm coals','A wounded traveler, alone on the road','A merchant caravan stopped for a broken wheel','Strange fog that doesn\'t lift till midday','Territorial predator blocking the path','A standing stone with faded script','Goblin or bandit ambush, poorly executed','An old shrine with a fresh offering','A flooded river crossing — needs another route','Another adventuring party, going the opposite direction','Evidence of a battle — no survivors, but recent'] },
  { name:'Dungeon Event', die:'d10', tab:'enc-setup', entries:['Distant scraping stone','A light source ahead that shouldn\'t be there','Water seeping through the ceiling','Smell of something rotting','Graffiti in a language nobody recognizes','A tripwire, already disarmed','Sounds of arguing creatures in the next room','A door opens from the other side as the party approaches','A section of floor gives slightly underfoot','Something small scurries away from the torchlight'] },
  { name:'Treasure Flavor', die:'d12', tab:'enc-after', entries:['Gold coins with an unfamiliar mint mark','A gem wrapped in oilcloth and hidden in a boot','A small statue of a deity — valuable to the right buyer','A letter of credit from a distant bank','Fine jewelry, clearly a set — one piece missing','A vial of perfume worth more than it looks','A small locked box with no key','Military medals from a disbanded order','A pouch of spell components — one rare ingredient included','A hand-drawn map with no labels, only landmarks','Promissory notes signed by a local noble','An antique weapon — no magic, but historically significant'] },
  { name:'Weather', die:'d8', tab:'environment', entries:['Clear and still — unnaturally quiet','Light rain, comfortable for travel','Heavy rain — visibility halved, tracks wash away','Thunderstorm — Perception at disadvantage','Thick fog — 60 ft max visibility','Scorching heat — DC 10 Con per hour or 1 exhaustion','Bitter cold — unprotected: 1d4 cold damage per hour','Unseasonal snow or hail — difficult terrain outdoors'] },
  { name:'Terrain Feature', die:'d8', tab:'environment', entries:['A natural stone arch spanning the path — older than anyone can say','A dry riverbed, clearly once ran strong','An old road, overgrown but unmistakably constructed','A grove of trees all leaning the same direction','A large flat boulder scarred with old fire marks — a regular campsite once','A steep ridge offering a clear vantage point, and full exposure','A narrow ravine the party must cross — not dangerous, but slow','A clearing with no undergrowth; soil disturbed, something buried or recently dug up'] },
  { name:'Night Watch', die:'d8', tab:'environment', entries:['An animal watches from the treeline, then retreats','A distant fire on the horizon — unmistakably a campfire','Voices on the wind, too faint and garbled to make out','Something approaches camp, investigates, then leaves without incident','Weather shifts — temperature drops sharply before dawn','A figure passes on the road, hurrying, doesn\'t acknowledge the camp','Sounds of a struggle, distant — over quickly','All quiet. Unnervingly so.'] },
  { name:'Dungeon Atmosphere', die:'d10', tab:'environment', entries:['Faint echo of dripping water — rhythmic, distant','The air is still and stale — nothing has moved here in a long time','A faint draft; air is moving from somewhere ahead','The temperature drops noticeably in this corridor','The walls are damp and slightly warm to the touch','A smell of something sweet — not food, not flowers. Hard to place.','Sound of settling stone — the structure is alive the way old things are','Faint bioluminescent growth on the walls, barely enough to navigate by','The floor has a barely perceptible slope downward','Scratch marks on the walls at roughly the same height — old, but consistent'] },
  { name:'Invitation Context', die:'d8', tab:'inviting', entries:['A sealed letter bearing an unfamiliar crest — the sender\'s name is not on it','A verbal message passed through a third party — "they ask that you come alone"','A public proclamation that specifically names the party','A gift delivered first, with an implied obligation attached','An intermediary who won\'t reveal who they represent','An open invitation to a public event with a private note tucked inside','An urgent summons — someone claims the party\'s presence is required immediately','A standing invitation, offered once, with no stated expiration'] },
  { name:'Social Event Complication', die:'d6', tab:'inviting', entries:['A rival or enemy of the party is also in attendance','Someone recognizes a party member from a previous identity or job','The host is being watched — by whom and why is unclear','A guest goes missing mid-event','The party\'s invitation was actually meant for someone else','The event is a cover for a negotiation that hasn\'t started yet'] },
  { name:'Foraging', die:'d6', tab:'environment', playerRoll:true, entries:['Nothing edible — this area has been picked clean or is barren','Enough for one person for a day','Basic provisions — a day\'s food for the party','Good find — two days of food plus something useful: kindling, cordage, or clean water','A cache of preserved food, deliberately left by someone','Ample provisions and a medicinal herb a healer would recognize'] },
];

let ALL_ROLL_TABLES = [];
const rollFadeTimers = {};

const ROLL_TABLE_CONTAINER = {
  npcs:        'rollTablesNpcsContainer',
  'enc-setup':  'rollTablesEncSetupContainer',
  'enc-active': 'rollTablesEncActiveContainer',
  'enc-after':  'rollTablesEncAfterContainer',
  environment: 'rollTablesEnvironmentContainer',
  inviting:    'rollTablesInvitingContainer',
};

function buildRollTablesInto(entries, containerId) {
  const container = document.getElementById(containerId);
  if (!container || !entries.length) return;
  container.innerHTML = entries.map(({ t, i }) => {
    const isHB = t._homebrew ? ' <span style="font-size:0.72rem;color:var(--accent-soft)">[HB]</span>' : '';
    return `<div class="roll-section">
      <div class="roll-header" data-idx="${i}">
        <h3>${t.name}${isHB}</h3>
        <span class="roll-result-text" id="rtresult-${i}" style="flex:1;text-align:center;padding:0 0.75rem;opacity:0"></span>
        <button class="btn-roll${t.playerRoll ? ' btn-roll-player' : ''}" data-idx="${i}">${t.playerRoll ? `(Player) Roll ${t.die}` : `Roll ${t.die}`}</button>
      </div>
      <div class="roll-body" id="rtbody-${i}">
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
      const idx = btn.dataset.idx;
      const t = ALL_ROLL_TABLES[idx];
      const el = document.getElementById('rtresult-' + idx);
      el.textContent = t.entries[Math.floor(Math.random() * t.entries.length)];
      clearTimeout(rollFadeTimers[idx]);
      el.style.transition = 'none';
      el.style.opacity = '1';
      void el.offsetWidth;
      rollFadeTimers[idx] = setTimeout(() => {
        el.style.transition = 'opacity 10s linear';
        el.style.opacity = '0';
      }, 800);
    });
  });
}

function buildAllRollTables(tables) {
  ALL_ROLL_TABLES = tables;
  const byTab = {};
  tables.forEach((t, i) => {
    const tab = t.tab || 'encounters';
    if (!byTab[tab]) byTab[tab] = [];
    byTab[tab].push({ t, i });
  });
  for (const [tab, entries] of Object.entries(byTab)) {
    const containerId = ROLL_TABLE_CONTAINER[tab];
    if (containerId) buildRollTablesInto(entries, containerId);
  }
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
  { icon:'🎭', category:'Formal Occasions', scenarios:[
    { name:'Navigating a Formal Occasion', sub:'dinners, galas, guild meetings', steps:[
      { check:'Insight', note:'read the room — who has power here, who is nervous, who is watching you' },
      { check:'Persuasion or Performance', note:'make a favorable impression on the right people' },
      { check:'Perception', note:'spot the undercurrent — what\'s actually being negotiated tonight' },
    ]},
    { name:'Uninvited Entry', sub:'infiltrating an exclusive event', steps:[
      { check:'Deception or Disguise Kit', note:'establish a cover identity at the door' },
      { check:'Insight', note:'read the social rules quickly — what\'s expected, who enforces it' },
      { check:'Sleight of Hand or Persuasion', note:'hold cover when someone looks too closely' },
    ]},
    { name:'Receiving a Pitch', sub:'faction courting, patron offers, recruitment', steps:[
      { check:'Insight', note:'is this offer genuine, desperate, or a setup?' },
      { check:'History or Investigation', note:'assess the credibility of the party making the offer' },
      { check:'Insight (second read)', note:'how much do they actually know about you?' },
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

const NARRATIVE_CATEGORY_TAB = {
  'Social Encounters':                  'npcs',
  'Chase Sequences':                    'enc-active',
  'Investigation Scenes':               'environment',
  'Combat with Environmental Pressure': 'enc-active',
  'Puzzles / Ancient Mechanisms':       'environment',
  'Group Dynamics':                     'environment',
  'Environmental Hazards':              'environment',
  'Water / Spirit Encounters':          'environment',
  'Downtime / Camp Scenes':             'environment',
  'Formal Occasions':                   'inviting',
};

function buildNarrativeSection(sections, containerId, idPrefix) {
  const container = document.getElementById(containerId);
  if (!container) return;
  let html = '';
  sections.forEach((section, si) => {
    html += `<div class="card" style="margin-bottom:0.85rem"><h2>${section.icon} ${section.category}</h2>`;
    section.scenarios.forEach((sc, sci) => {
      const id = `${idPrefix}-${si}-${sci}`;
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

function buildNarrative() {
  const byTab = { npcs: [], 'enc-setup': [], 'enc-active': [], 'enc-after': [], environment: [], inviting: [] };
  NARRATIVE_DATA.forEach(section => {
    const tab = NARRATIVE_CATEGORY_TAB[section.category];
    if (tab && byTab[tab]) byTab[tab].push(section);
  });
  buildNarrativeSection(byTab.npcs,              'narrativeNpcsContainer',         'nbnpc');
  buildNarrativeSection(byTab['enc-active'],     'narrativeEncActiveContainer',     'nbenca');
  buildNarrativeSection(byTab.environment,       'narrativeEnvironmentContainer',   'nbenv');
  buildNarrativeSection(byTab.inviting,          'narrativeInvitingContainer',      'nbinv');
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

// ─── CONDITIONS (shared) ─────────────────────────────────────────────────────
const CONDITIONS = ['Blinded','Charmed','Frightened','Grappled','Incapacitated','Invisible','Paralyzed','Poisoned','Prone','Restrained','Stunned','Unconscious'];

// ─── ENCOUNTER BUILDER (legacy state — kept for data migration only) ──────────
let encounterState = (() => {
  try { return JSON.parse(localStorage.getItem('5e-encounters') || 'null'); } catch(e) {}
  return null;
})() || { slots:[{ name:'Encounter 1', combatants:[] }], current:0, round:1, turn:0 };

function saveEnc() { localStorage.setItem('5e-encounters', JSON.stringify(encounterState)); }
function curEnc()  { return encounterState.slots[encounterState.current]; }


// ─── ROSTERS ─────────────────────────────────────────────────────────────────
let playerRoster = (() => { try { return JSON.parse(localStorage.getItem('5e-players') || '[]'); } catch(e) { return []; } })();
let npcRoster    = (() => { try { return JSON.parse(localStorage.getItem('5e-npcs')    || '[]'); } catch(e) { return []; } })();

function savePlayerRoster() { localStorage.setItem('5e-players', JSON.stringify(playerRoster)); }
function saveNpcRoster()    { localStorage.setItem('5e-npcs',    JSON.stringify(npcRoster)); }

function rosterFormHTML(d) {
  d = d || {};
  return `<div class="roster-form">
    <div class="roster-form-grid">
      <div class="field-group"><label>Name *</label><input class="enc-input rf-name" placeholder="Aragorn" value="${d.name||''}"></div>
      <div class="field-group"><label>Class / Role</label><input class="enc-input rf-cls" placeholder="Ranger" value="${d.cls||''}"></div>
      <div class="field-group"><label>Level / CR</label><input class="enc-input rf-level" type="number" min="0" placeholder="5" value="${d.level||''}"></div>
      <div class="field-group"><label>Max HP</label><input class="enc-input rf-hp" type="number" min="1" placeholder="52" value="${d.maxHp||''}"></div>
      <div class="field-group"><label>AC</label><input class="enc-input rf-ac" type="number" min="0" placeholder="16" value="${d.ac||''}"></div>
      <div class="field-group"><label>Init Bonus</label><input class="enc-input rf-init" type="number" placeholder="0" value="${d.initMod != null ? d.initMod : ''}"></div>
    </div>
    <div class="roster-form-actions">
      <button class="btn sm rf-save">Save</button>
      <button class="btn secondary sm rf-cancel">Cancel</button>
    </div>
  </div>`;
}

function readRosterForm(wrap, existing) {
  const name = wrap.querySelector('.rf-name').value.trim();
  if (!name) return null;
  return {
    id:      existing ? existing.id : Date.now() + '_' + Math.random(),
    name,
    cls:     wrap.querySelector('.rf-cls').value.trim(),
    level:   parseInt(wrap.querySelector('.rf-level').value) || null,
    maxHp:   parseInt(wrap.querySelector('.rf-hp').value)    || null,
    ac:      parseInt(wrap.querySelector('.rf-ac').value)    || null,
    initMod: parseInt(wrap.querySelector('.rf-init').value)  || 0,
  };
}

function openRosterForm(wrap, existing, onSave) {
  wrap.style.display = '';
  wrap.innerHTML = rosterFormHTML(existing);
  wrap.querySelector('.rf-save').addEventListener('click', () => {
    const entry = readRosterForm(wrap, existing);
    if (!entry) return;
    onSave(entry);
    wrap.style.display = 'none';
    wrap.innerHTML = '';
  });
  wrap.querySelector('.rf-cancel').addEventListener('click', () => {
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

// ─── PLAYER ROLL PROMPTS ─────────────────────────────────────────────────────
const PLAYER_ROLL_PROMPTS = [
  {
    die: 'D4', tab: 'enc-active', title: 'Swarm Reinforcements',
    context: 'Use mid-battle when enemies are arriving in waves and the scale is uncertain.',
    prompt: 'Ask the player: "Roll a D4 — that\'s how many enemies push through this round."',
    outcomes: [
      'Just 1 breaks through — the swarm is finally thinning.',
      '2 enemies surge forward from the flanks.',
      '3 more — and they look fresh.',
      '4 flood in. The swarm shows no sign of stopping.',
    ],
  },
  {
    die: 'D6', tab: 'enc-active', title: 'Reinforcement Timer',
    context: 'When the party knows enemy backup is coming and needs to finish quickly.',
    prompt: 'Ask the player at the start of combat: "Roll a D6 — that\'s how many rounds you have."',
    outcomes: [
      'Just 1 round — they\'re already at the door.',
      '2 rounds — you can hear boots on the stairs.',
      '3 rounds — you can\'t afford a single delay.',
      '4 rounds — tight, but possible.',
      '5 rounds — push hard and you can make it.',
      '6 rounds — you have a real window. Use it.',
    ],
  },
  {
    die: 'D4', tab: 'npcs', title: 'Witness Memory',
    context: 'When interviewing an NPC about something they saw.',
    prompt: 'Ask the player: "Roll a D4 — that\'s how clearly the witness remembers things."',
    outcomes: [
      'Barely anything — shock or fear has scrambled their recall.',
      'A few details — nothing reliable enough to act on.',
      'Most of it — one critical detail is still fuzzy.',
      'Everything — including something they weren\'t sure they should mention.',
    ],
  },
  {
    die: 'D4', tab: 'environment', title: 'Storm Duration',
    context: 'When weather is a meaningful obstacle or deadline for travel or action.',
    prompt: 'Ask the player: "Roll a D4 — how many hours does the storm last?"',
    outcomes: [
      '1 hour — rough but brief. You can push through if you move now.',
      '2 hours — enough to ruin an unprepared camp.',
      '3 hours — travel is out of the question. Find shelter.',
      '4 hours — it\'s going to be a long night.',
    ],
  },
  {
    die: 'D6', tab: 'environment', title: 'Supply Cache',
    context: 'When the party finds abandoned supplies, a ransacked camp, or a hidden cache.',
    prompt: 'Ask the player: "Roll a D6 — that\'s how many days of rations (or potion uses) are left."',
    outcomes: [
      '1 — almost nothing. Someone already got here first.',
      '2 — a day\'s worth, maybe two if stretched.',
      '3 — enough for the immediate journey.',
      '4 — a welcome find. You\'re not counting rations for a while.',
      '5 — well stocked. Whoever left this wasn\'t planning to come back.',
      '6 — more than expected. And something extra tucked inside — DM\'s choice.',
    ],
  },
  {
    die: 'D4', tab: 'enc-setup', title: 'Rival Party Lead',
    context: 'When the players are racing another group to the same destination or prize.',
    prompt: 'Ask the player: "Roll a D4 — that\'s how many hours ahead the rivals are."',
    outcomes: [
      '1 hour — practically on their heels. Push and you catch them.',
      '2 hours — a real race. No detours.',
      '3 hours — they have a significant head start.',
      '4 hours — they may already be there.',
    ],
  },
  {
    die: 'D6', tab: 'npcs', title: 'Reputation Precedes You',
    context: 'When the party arrives in a new settlement where their name may have traveled ahead.',
    prompt: 'Ask the player: "Roll a D6 — how widely known is the party here?"',
    outcomes: [
      '1 — nobody knows you. Fresh start, or total anonymity.',
      '2 — one person has heard the name, vaguely.',
      '3 — a merchant or guard recognizes you — DM decides if it\'s welcome or complicated.',
      '4 — your reputation has reached the local authority.',
      '5 — half the town knows something. Opinions are mixed.',
      '6 — they\'ve been expecting you. Whether that\'s good depends on what you did last.',
    ],
  },
  {
    die: 'D4', tab: 'enc-active', title: 'Poison Progression',
    context: 'When a character is poisoned and the timeline of worsening matters.',
    prompt: 'Ask the player: "Roll a D4 — you have that many hours before the next stage hits."',
    outcomes: [
      '1 hour — it\'s moving fast. Find a cure immediately.',
      '2 hours — you can feel it spreading. Not much time.',
      '3 hours — painful but you have a window.',
      '4 hours — slow-acting. You have until morning.',
    ],
  },
  {
    die: 'D4', tab: 'npcs', title: 'Rumor Accuracy',
    context: 'After the party receives a batch of tips or rumors from locals.',
    prompt: 'Ask the player: "Roll a D4 — that\'s how many of the rumors turn out to be true."',
    outcomes: [
      '1 — almost nothing checked out. Bad sources, or someone lied.',
      '2 — half true, half embellished or wrong.',
      '3 — most of it holds up, but one key detail is off.',
      '4 — all accurate. And one detail the informants didn\'t think to mention.',
    ],
  },
  {
    die: 'D6', tab: 'npcs', title: 'Hired Hand Loyalty',
    context: 'When a hired NPC faces something dangerous or personally costly.',
    prompt: 'Ask the player when hiring: "Roll a D6 — that\'s their loyalty threshold."',
    outcomes: [
      '1 — first sign of real danger and they\'re gone.',
      '2 — they\'ll help in a fair fight but won\'t take a risk on the party\'s behalf.',
      '3 — reliable unless things get life-threatening.',
      '4 — steady under pressure. Will hold their nerve.',
      '5 — genuinely invested. Takes initiative when it matters.',
      '6 — true loyalty. Would take the hit. Would keep the secret.',
    ],
  },
  {
    die: 'D4', tab: 'environment', title: 'Corruption Spread',
    context: 'When a blight, curse, or dark influence is spreading through a location.',
    prompt: 'Ask the player: "Roll a D4 — that\'s how many more areas are already affected."',
    outcomes: [
      '1 — contained for now. You found it early.',
      '2 — two more areas are compromised.',
      '3 — it\'s spread further than expected.',
      '4 — it\'s nearly everywhere. You may already be too late.',
    ],
  },
  {
    die: 'D6', tab: 'inviting', title: 'Notable Guests',
    context: 'When the party arrives at a social event and prior connections matter.',
    prompt: 'Ask the player: "Roll a D6 — that\'s how many attendees have prior history with the party."',
    outcomes: [
      'Nobody here knows you. Fresh ground.',
      'One person recognizes a party member — a minor acquaintance, nothing loaded.',
      'Two faces from the past — one friendly, one complicated.',
      'Three people know the party. At least one has a reason to keep an eye on them.',
      'Several guests have opinions about the party already. The room has been talking.',
      'The party is well known here. Eyes find them the moment they walk in.',
    ],
  },
  {
    die: 'D4', tab: 'inviting', title: 'Prior Knowledge',
    context: 'When meeting a host or powerful NPC who may have done their homework on the party.',
    prompt: 'Ask the player: "Roll a D4 — the host already knows that many things about the party."',
    outcomes: [
      'Almost nothing — they know the party exists and little else.',
      'A couple of public facts — recent jobs, general reputation.',
      'Specific details — things the party didn\'t publicize.',
      'More than they should. Someone talked, or someone has been watching.',
    ],
  },
  {
    die: 'D4', tab: 'enc-active', title: 'Trap Reset Timer',
    context: 'After a trap triggers or is disarmed, if it might reset or be re-armed.',
    prompt: 'Ask the player: "Roll a D4 — that\'s how many rounds until the trap is live again."',
    outcomes: [
      '1 round — it\'s already resetting. Move.',
      '2 rounds — you have a moment. Use it.',
      '3 rounds — enough time to get everyone through carefully.',
      '4 rounds — it\'ll be a while. Take it at your own pace.',
    ],
  },
];

function buildPlayerRolls() {
  let prTooltip = document.getElementById('prTooltip');
  if (!prTooltip) {
    prTooltip = document.createElement('div');
    prTooltip.id = 'prTooltip';
    document.body.appendChild(prTooltip);
  }
  let prTipTimer = null;
  let prMouseX = 0, prMouseY = 0;

  const showPrTooltip = (h) => {
    const ctx = h.querySelector('[data-ctx]')?.dataset.ctx;
    if (!ctx) return;
    prTooltip.textContent = ctx;
    prTooltip.style.left = prMouseX + 12 + 'px';
    prTooltip.style.top  = prMouseY + 14 + 'px';
    prTooltip.classList.add('visible');
    const tr = prTooltip.getBoundingClientRect();
    if (tr.right > window.innerWidth - 12)
      prTooltip.style.left = (window.innerWidth - tr.width - 12) + 'px';
  };

  const wireContainer = (container) => {
    container.querySelectorAll('.roll-header[data-pr-idx]').forEach(h => {
      h.addEventListener('click', () => {
        const body = document.getElementById('prbody-' + h.dataset.prIdx);
        body.classList.toggle('open');
        clearTimeout(prTipTimer);
        prTooltip.classList.remove('visible');
        if (!body.classList.contains('open'))
          prTipTimer = setTimeout(() => showPrTooltip(h), 100);
      });
      h.addEventListener('mousemove', e => { prMouseX = e.clientX; prMouseY = e.clientY; });
      h.addEventListener('mouseenter', () => {
        prTipTimer = setTimeout(() => {
          const body = document.getElementById('prbody-' + h.dataset.prIdx);
          if (body?.classList.contains('open')) return;
          showPrTooltip(h);
        }, 100);
      });
      h.addEventListener('mouseleave', () => {
        clearTimeout(prTipTimer);
        prTooltip.classList.remove('visible');
      });
      const btn = h.querySelector('.btn-roll');
      if (btn) {
        btn.addEventListener('mouseenter', () => {
          clearTimeout(prTipTimer);
          prTooltip.classList.remove('visible');
        });
        btn.addEventListener('mouseleave', e => {
          if (h.contains(e.relatedTarget)) {
            prTipTimer = setTimeout(() => {
              const body = document.getElementById('prbody-' + h.dataset.prIdx);
              if (body?.classList.contains('open')) return;
              showPrTooltip(h);
            }, 100);
          }
        });
      }
    });
    container.querySelectorAll('.btn-roll[data-pr-idx]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const i = btn.dataset.prIdx;
        const p = PLAYER_ROLL_PROMPTS[i];
        const el = document.getElementById('prresult-' + i);
        el.textContent = p.outcomes[Math.floor(Math.random() * p.outcomes.length)];
        clearTimeout(rollFadeTimers['pr-' + i]);
        el.style.transition = 'none';
        el.style.opacity = '1';
        void el.offsetWidth;
        rollFadeTimers['pr-' + i] = setTimeout(() => {
          el.style.transition = 'opacity 10s linear';
          el.style.opacity = '0';
        }, 800);
      });
    });
  };

  const rowHTML = (p, i) => `
    <div class="roll-section">
      <div class="roll-header" data-pr-idx="${i}">
        <h3 data-ctx="${p.context}" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.title}</h3>
        <span class="roll-result-text" id="prresult-${i}" style="flex:1;text-align:center;padding:0 0.75rem;opacity:0"></span>
        <button class="btn-roll btn-roll-player" data-pr-idx="${i}">(Player) Roll ${p.die}</button>
      </div>
      <div class="roll-body" id="prbody-${i}">
        <div class="narrative-tip" style="margin:0.75rem 1rem 0.4rem">${p.context}</div>
        <div style="padding:0.4rem 1rem 0.6rem;border-bottom:1px solid var(--border)">
          <strong style="font-size:0.85rem;color:var(--accent)">${p.prompt}</strong>
        </div>
        <table class="ref-table"><thead><tr><th style="width:3rem">Roll</th><th>Result</th></tr></thead><tbody>
          ${p.outcomes.map((o, j) => `<tr><td style="font-weight:700;color:var(--accent)">${j+1}</td><td>${o}</td></tr>`).join('')}
        </tbody></table>
      </div>
    </div>`;

  const containerMap = {
    npcs:         'playerRollsNpcsContainer',
    'enc-setup':  'playerRollsEncSetupContainer',
    'enc-active': 'playerRollsEncActiveContainer',
    'enc-after':  'playerRollsEncAfterContainer',
    environment:  'playerRollsEnvironmentContainer',
    inviting:     'playerRollsInvitingContainer',
  };
  const byTab = { npcs: [], 'enc-setup': [], 'enc-active': [], 'enc-after': [], environment: [], inviting: [] };
  PLAYER_ROLL_PROMPTS.forEach((p, i) => { if (byTab[p.tab]) byTab[p.tab].push({ p, i }); });

  for (const [tab, entries] of Object.entries(byTab)) {
    const container = document.getElementById(containerMap[tab]);
    if (!container || !entries.length) continue;
    container.innerHTML = entries.map(({ p, i }) => rowHTML(p, i)).join('');
    wireContainer(container);
  }
}

// ─── BATTLE TRACKER ──────────────────────────────────────────────────────────
let battles = (() => { try { return JSON.parse(localStorage.getItem('5e-battles') || '[]'); } catch(e) { return []; } })();
if (!battles.length) battles = [{ id: Date.now() + '_0', name: 'Battle 1', phase: 'setup', round: 1, turnIdx: 0, combatants: [] }];
let currentBattleIdx = 0;
function curBattle() { return battles[currentBattleIdx]; }
function saveBattles() { localStorage.setItem('5e-battles', JSON.stringify(battles)); }

// In-memory enemy queue for the setup phase (reset when switching battles)
let battleEnemyQueue = [];
let _openBattleDetails = new Set();
let _battleDragIdx = null;
let _midAddCreature = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseDexMod(dexStr) {
  if (!dexStr) return 0;
  const m = dexStr.match(/\(([+\-]\d+)\)/);
  if (m) return parseInt(m[1], 10);
  // fallback: raw score
  const score = parseInt(dexStr, 10);
  return isNaN(score) ? 0 : Math.floor((score - 10) / 2);
}

function battleHpClass(cur, max) {
  if (!max) return '';
  const p = cur / max;
  return p <= 0.25 ? 'low' : p <= 0.5 ? 'mid' : '';
}

function rollD20() { return Math.floor(Math.random() * 20) + 1; }

// ── Slot rendering ────────────────────────────────────────────────────────────
function renderBattleSlots() {
  const el = document.getElementById('battleSlots');
  if (!el) return;
  el.innerHTML = battles.map((b, i) =>
    `<span class="enc-slot ${i === currentBattleIdx ? 'active' : ''}" data-bi="${i}">${b.name}</span>`
  ).join('');
  el.querySelectorAll('.enc-slot').forEach(sp => sp.addEventListener('click', () => {
    currentBattleIdx = parseInt(sp.dataset.bi);
    battleEnemyQueue = [];
    saveBattles();
    renderBattle();
  }));
}

// ── Combatant stat block for detail panel ─────────────────────────────────────
function renderBattleCombatantStatBlock(c) {
  if (c.type === 'enemy') {
    const creature = (ALL_CREATURES || []).find(m => m.name === c.creatureName);
    if (!creature) return `<div style="color:var(--text-muted);font-size:0.82rem">No stat block found for "${c.creatureName || c.name}".</div>`;
    return `<div class="b-detail-statblock-inner">${renderFull(creature)}</div>`;
  }
  if (c.type === 'pc') {
    const p = playerRoster.find(r => r.id === c.rosterId) || playerRoster.find(r => r.name === c.name);
    if (!p) return `<div style="color:var(--text-muted);font-size:0.82rem">Player not found in roster.</div>`;
    return `<div class="b-detail-statblock-inner">
      <div class="stat-block-name">${p.name}</div>
      <div class="stat-block-meta">${[p.cls, p.level ? 'Level ' + p.level : ''].filter(Boolean).join(' · ') || 'Player Character'}</div>
      <div class="stat-row">
        ${p.maxHp != null ? `<span class="stat-pill"><strong>HP</strong> ${p.maxHp}</span>` : ''}
        ${p.ac    != null ? `<span class="stat-pill"><strong>AC</strong> ${p.ac}</span>` : ''}
        <span class="stat-pill"><strong>Init</strong> ${(p.initMod||0) >= 0 ? '+' : ''}${p.initMod||0}</span>
      </div>
    </div>`;
  }
  if (c.type === 'npc') {
    const n = npcRoster.find(r => r.id === c.rosterId) || npcRoster.find(r => r.name === c.name);
    if (!n) return `<div style="color:var(--text-muted);font-size:0.82rem">NPC not found in roster.</div>`;
    return `<div class="b-detail-statblock-inner">
      <div class="stat-block-name">${n.name}</div>
      <div class="stat-block-meta">${[n.cls, n.level ? 'Level ' + n.level : ''].filter(Boolean).join(' · ') || 'NPC'}</div>
      <div class="stat-row">
        ${n.maxHp != null ? `<span class="stat-pill"><strong>HP</strong> ${n.maxHp}</span>` : ''}
        ${n.ac    != null ? `<span class="stat-pill"><strong>AC</strong> ${n.ac}</span>` : ''}
        <span class="stat-pill"><strong>Init</strong> ${(n.initMod||0) >= 0 ? '+' : ''}${n.initMod||0}</span>
      </div>
    </div>`;
  }
  return '';
}

// ── Setup phase ───────────────────────────────────────────────────────────────
function renderBattleSetup() {
  // Player checkboxes
  const playerPicks = document.getElementById('battlePlayerPicks');
  if (playerPicks) {
    if (!playerRoster.length) {
      playerPicks.innerHTML = '<div style="font-size:0.85rem;color:var(--text-muted)">No players in roster.</div>';
    } else {
      playerPicks.innerHTML = playerRoster.map(p => {
        const mod = p.initMod || 0;
        const modStr = (mod >= 0 ? '+' : '') + mod;
        return `<div class="battle-pick-row">
          <input type="checkbox" data-roster-type="player" data-id="${p.id}" checked>
          <span class="bpr-name">${p.name}${p.cls ? ' <span class="bpr-sub">(' + p.cls + ')</span>' : ''}</span>
          <span class="bpr-mod" title="Initiative modifier">${modStr}</span>
          <span class="bpr-plus">+</span>
          <input class="b-setup-init" type="number" placeholder="d20" title="Roll (blank = d20); modifier will be added" data-id="${p.id}" data-roster-type="player">
        </div>`;
      }).join('');
    }
  }

  // NPC checkboxes
  const npcPicks = document.getElementById('battleNpcPicks');
  if (npcPicks) {
    if (!npcRoster.length) {
      npcPicks.innerHTML = '<div style="font-size:0.85rem;color:var(--text-muted)">No NPCs in roster.</div>';
    } else {
      npcPicks.innerHTML = npcRoster.map(n => {
        const mod = n.initMod || 0;
        const modStr = (mod >= 0 ? '+' : '') + mod;
        return `<div class="battle-pick-row">
          <input type="checkbox" data-roster-type="npc" data-id="${n.id}">
          <span class="bpr-name">${n.name}${n.cls ? ' <span class="bpr-sub">(' + n.cls + ')</span>' : ''}</span>
          <span class="bpr-mod" title="Initiative modifier">${modStr}</span>
          <span class="bpr-plus">+</span>
          <input class="b-setup-init" type="number" placeholder="d20" title="Roll (blank = d20); modifier will be added" data-id="${n.id}" data-roster-type="npc">
        </div>`;
      }).join('');
    }
  }

  // Populate monster list select
  const listSelect = document.getElementById('battleListSelect');
  if (listSelect) {
    listSelect.innerHTML = '<option value="">— Load monster list —</option>' +
      monsterLists.map(l => `<option value="${l.id}">${l.name} (${l.names.length})</option>`).join('');
    listSelect.addEventListener('change', () => {
      const lid = listSelect.value;
      if (!lid) return;
      const lst = monsterLists.find(l => l.id === lid);
      if (!lst) return;
      lst.names.forEach(name => {
        const creature = ALL_CREATURES.find(c => c.name === name);
        if (creature) {
          battleEnemyQueue.push({ name: creature.name, count: 1, customHp: '', creature });
        }
      });
      listSelect.value = '';
      renderBattleEnemyQueue();
    });
  }

  // Enemy search
  const searchEl = document.getElementById('battleEnemySearch');
  const resultsEl = document.getElementById('battleEnemyResults');
  if (searchEl && resultsEl) {
    searchEl.addEventListener('input', () => {
      const q = searchEl.value.trim().toLowerCase();
      if (!q || !ALL_CREATURES.length) { resultsEl.classList.remove('open'); resultsEl.innerHTML = ''; return; }
      const matches = ALL_CREATURES.filter(c => c.name.toLowerCase().includes(q)).slice(0, 8);
      if (!matches.length) { resultsEl.classList.remove('open'); return; }
      resultsEl.innerHTML = matches.map(c =>
        `<div class="battle-enemy-result-row" data-name="${c.name}">
          <span>${c.name}</span>
          <span class="ber-cr">CR ${c.cr || '?'}</span>
        </div>`
      ).join('');
      resultsEl.classList.add('open');
      resultsEl.querySelectorAll('.battle-enemy-result-row').forEach(row => {
        row.addEventListener('click', () => {
          const creature = ALL_CREATURES.find(c => c.name === row.dataset.name);
          if (creature) {
            battleEnemyQueue.push({ name: creature.name, count: 1, customHp: '', creature });
            renderBattleEnemyQueue();
          }
          searchEl.value = '';
          resultsEl.classList.remove('open');
          resultsEl.innerHTML = '';
        });
      });
    });

    // Close results on outside click
    document.addEventListener('click', e => {
      if (!searchEl.contains(e.target) && !resultsEl.contains(e.target)) {
        resultsEl.classList.remove('open');
      }
    }, { passive: true });
  }

  renderBattleEnemyQueue();

  // Begin Battle button
  const btnBegin = document.getElementById('btnBeginBattle');
  if (btnBegin) {
    btnBegin.onclick = beginBattle;
  }
}

function renderBattleEnemyQueue() {
  const el = document.getElementById('battleEnemyQueue');
  if (!el) return;
  if (!battleEnemyQueue.length) { el.innerHTML = ''; return; }
  el.innerHTML = battleEnemyQueue.map((entry, i) => {
    const hpPlaceholder = entry.creature ? (parseInt(entry.creature.hp) || '') : '';
    const acPlaceholder = entry.creature ? (parseInt(entry.creature.ac) || '') : '';
    return `<div class="battle-queue-row" data-qi="${i}">
      <input class="enc-input bqr-name" type="text" value="${(entry.customName||entry.name).replace(/"/g,'&quot;')}" data-qi="${i}" title="Name">
      <label style="font-size:0.78rem;color:var(--text-muted);white-space:nowrap">×
        <input class="enc-input bqr-count" type="number" min="1" max="20" value="${entry.count}" data-qi="${i}" style="width:52px">
      </label>
      <label style="font-size:0.78rem;color:var(--text-muted)">HP</label>
      <input class="enc-input bqr-hp" type="number" min="1" placeholder="${hpPlaceholder}" value="${entry.customHp||''}" data-qi="${i}" style="width:60px" title="HP override">
      <label style="font-size:0.78rem;color:var(--text-muted)">AC</label>
      <input class="enc-input bqr-ac" type="number" min="1" placeholder="${acPlaceholder}" value="${entry.customAc||''}" data-qi="${i}" style="width:54px" title="AC override">
      <button class="btn danger sm bqr-remove" data-qi="${i}">✕</button>
    </div>`;
  }).join('');

  el.querySelectorAll('.bqr-name').forEach(inp => inp.addEventListener('change', () => {
    battleEnemyQueue[+inp.dataset.qi].customName = inp.value.trim() || battleEnemyQueue[+inp.dataset.qi].name;
  }));
  el.querySelectorAll('.bqr-count').forEach(inp => inp.addEventListener('change', () => {
    const i = +inp.dataset.qi;
    battleEnemyQueue[i].count = Math.max(1, Math.min(20, parseInt(inp.value) || 1));
    inp.value = battleEnemyQueue[i].count;
  }));
  el.querySelectorAll('.bqr-hp').forEach(inp => inp.addEventListener('change', () => {
    battleEnemyQueue[+inp.dataset.qi].customHp = inp.value.trim();
  }));
  el.querySelectorAll('.bqr-ac').forEach(inp => inp.addEventListener('change', () => {
    battleEnemyQueue[+inp.dataset.qi].customAc = inp.value.trim();
  }));
  el.querySelectorAll('.bqr-remove').forEach(btn => btn.addEventListener('click', () => {
    battleEnemyQueue.splice(+btn.dataset.qi, 1);
    renderBattleEnemyQueue();
  }));
}

// ── Begin Battle ──────────────────────────────────────────────────────────────
function beginBattle() {
  const combatants = [];

  // Collect checked players
  document.querySelectorAll('#battlePlayerPicks input[type=checkbox]:checked').forEach(cb => {
    const p = playerRoster.find(r => r.id === cb.dataset.id);
    if (!p) return;
    const initInput = document.querySelector(`#battlePlayerPicks .b-setup-init[data-id="${p.id}"]`);
    const typed = initInput ? parseInt(initInput.value) : NaN;
    const init = !isNaN(typed) ? typed + (p.initMod || 0) : rollD20() + (p.initMod || 0);
    combatants.push({
      id: Date.now() + '_p_' + p.id,
      name: p.name, type: 'pc', rosterId: p.id,
      hp: p.maxHp || 10, maxHp: p.maxHp || 10, ac: p.ac || 10,
      initiative: init, tempHp: 0, conditions: [], notes: '', gone: false,
    });
  });

  // Collect checked NPCs
  document.querySelectorAll('#battleNpcPicks input[type=checkbox]:checked').forEach(cb => {
    const n = npcRoster.find(r => r.id === cb.dataset.id);
    if (!n) return;
    const initInput = document.querySelector(`#battleNpcPicks .b-setup-init[data-id="${n.id}"]`);
    const typed = initInput ? parseInt(initInput.value) : NaN;
    const init = !isNaN(typed) ? typed + (n.initMod || 0) : rollD20() + (n.initMod || 0);
    combatants.push({
      id: Date.now() + '_n_' + n.id,
      name: n.name, type: 'npc', rosterId: n.id,
      hp: n.maxHp || 10, maxHp: n.maxHp || 10, ac: n.ac || 10,
      initiative: init, tempHp: 0, conditions: [], notes: '', gone: false,
    });
  });

  // Collect enemy queue entries
  battleEnemyQueue.forEach(entry => {
    const baseHp = entry.customHp ? parseInt(entry.customHp) : (parseInt(entry.creature?.hp) || 10);
    const baseAc = entry.customAc ? parseInt(entry.customAc) : (parseInt(entry.creature?.ac) || 10);
    const dexMod = parseDexMod(entry.creature?.dex);
    const baseName = entry.customName || entry.name;
    for (let n = 0; n < entry.count; n++) {
      const label = entry.count > 1 ? `${baseName} ${n + 1}` : baseName;
      const init = rollD20() + dexMod;
      combatants.push({
        id: Date.now() + '_e_' + n + '_' + Math.random().toString(36).slice(2),
        name: label, creatureName: baseName,
        type: 'enemy',
        hp: baseHp, maxHp: baseHp,
        ac: baseAc,
        initiative: init, tempHp: 0, conditions: [], notes: '', gone: false,
      });
    }
  });

  if (!combatants.length) { alert('Add at least one combatant before beginning.'); return; }

  // Sort by initiative descending
  combatants.sort((a, b) => b.initiative - a.initiative);

  const b = curBattle();
  b.combatants = combatants;
  b.phase = 'active';
  b.round = 1;
  b.turnIdx = 0;
  saveBattles();
  battleEnemyQueue = [];
  renderBattle();
}

// ── Active phase ──────────────────────────────────────────────────────────────
function renderBattleActive() {
  const b = curBattle();
  document.getElementById('battleRoundNum').textContent = b.round;
  const cur = b.combatants[b.turnIdx];
  document.getElementById('battleCurrentName').textContent = cur ? cur.name : '—';

  const listEl = document.getElementById('battleList');
  if (!listEl) return;

  if (!b.combatants.length) { listEl.innerHTML = '<div style="color:var(--text-muted);font-size:0.88rem;padding:0.4rem 0">No combatants.</div>'; return; }

  // Save which detail panels were open before re-render
  listEl.querySelectorAll('.battle-row-detail.open').forEach(el => {
    _openBattleDetails.add(parseInt(el.id.replace('bdetail-', '')));
  });

  listEl.innerHTML = b.combatants.map((c, i) => {
    const isActive   = i === b.turnIdx;
    const isDefeated = c.hp <= 0;
    const isGone     = c.gone && !isDefeated;
    const rowCls     = `battle-row${isActive ? ' active-turn' : ''}${isGone ? ' gone' : ''}${isDefeated ? ' defeated' : ''}`;
    const dotCls     = c.type === 'pc' ? 'pc' : c.type === 'npc' ? 'npc' : 'enemy';
    const pct        = c.maxHp > 0 ? Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100)) : 100;
    const conds      = c.conditions || [];
    const condAbbrv  = conds.slice(0, 3).map(cd => cd.substring(0, 3)).join(' ');
    const condCount  = conds.length;
    const condOpts   = CONDITIONS.map(cd =>
      `<label class="b-cond-option"><input type="checkbox" value="${cd}" ${conds.includes(cd) ? 'checked' : ''}> ${cd}</label>`
    ).join('');

    return `<div class="${rowCls}" data-bi="${i}" draggable="true">
      <div class="battle-row-main" data-i="${i}">
        <span class="b-drag" data-nodrag>⠿</span>
        <span class="b-init" contenteditable="true" data-i="${i}" title="Edit initiative">${c.initiative}</span>
        <span class="b-type-dot ${dotCls}"></span>
        <span class="b-name">${c.name}</span>
        <div class="b-hp-group">
          <div class="b-hp-bar-wrap"><div class="b-hp-bar ${battleHpClass(c.hp, c.maxHp)}" style="width:${pct}%"></div></div>
          <span class="b-hp-text">${c.hp}/${c.maxHp}</span>
          ${c.tempHp > 0 ? `<span class="b-thp">+${c.tempHp}</span>` : ''}
        </div>
        <span class="b-ac" contenteditable="true" data-i="${i}" title="Edit AC">AC ${c.ac ?? '—'}</span>
        <span class="b-conds" title="${conds.join(', ')}">${condAbbrv}</span>
        <button class="b-adj-btn dmg" data-adjopen="${i}" data-adjmode="dmg">Dmg</button>
        <button class="b-adj-btn heal" data-adjopen="${i}" data-adjmode="heal">Heal</button>
        <button class="b-remove" data-rm="${i}" title="Remove">✕</button>
      </div>
      <div class="b-adj-panel" id="badj-panel-${i}">
        <label id="badj-label-${i}">Damage:</label>
        <input type="number" min="0" placeholder="amount" id="badj-${i}">
        <button class="btn sm" data-adjapply="${i}">Apply</button>
        <button class="btn sm secondary" data-adjcancel="${i}">Cancel</button>
      </div>
      <div class="battle-row-detail" id="bdetail-${i}">
        <div class="b-detail-top">
          <div class="b-detail-group">
            <label>Temp HP</label>
            <div class="b-adj-row">
              <input class="b-adj-input" type="number" min="0" placeholder="0" id="bthp-${i}">
              <button class="btn sm secondary" data-setthp="${i}">Set</button>
            </div>
          </div>
          <div class="b-detail-group">
            <label>Notes</label>
            <input class="b-notes-input" type="text" placeholder="…" data-i="${i}" value="${(c.notes||'').replace(/"/g,'&quot;')}">
          </div>
          <div class="b-detail-group">
            <details class="b-cond-dropdown">
              <summary>Conditions${condCount ? ` <strong style="color:var(--accent)">(${condCount})</strong>` : ''}</summary>
              <div class="b-cond-dropdown-options" data-condi="${i}">${condOpts}</div>
            </details>
          </div>
        </div>
        <div class="b-detail-statblock">${renderBattleCombatantStatBlock(c)}</div>
      </div>
    </div>`;
  }).join('');

  // Restore open detail panels
  _openBattleDetails.forEach(i => {
    const d = document.getElementById('bdetail-' + i);
    if (d) d.classList.add('open');
  });

  // Wire drag-and-drop
  listEl.querySelectorAll('.battle-row').forEach(row => {
    row.addEventListener('dragstart', e => {
      _battleDragIdx = parseInt(row.dataset.bi);
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    row.addEventListener('drop', e => {
      e.preventDefault();
      const toIdx = parseInt(row.dataset.bi);
      if (_battleDragIdx === null || _battleDragIdx === toIdx) return;
      const b = curBattle();
      const [moved] = b.combatants.splice(_battleDragIdx, 1);
      b.combatants.splice(toIdx, 0, moved);
      // Adjust turnIdx
      if (b.turnIdx === _battleDragIdx) {
        b.turnIdx = toIdx;
      } else {
        // Adjust pointer if needed
        if (_battleDragIdx < b.turnIdx && toIdx >= b.turnIdx) b.turnIdx--;
        else if (_battleDragIdx > b.turnIdx && toIdx <= b.turnIdx) b.turnIdx++;
      }
      _battleDragIdx = null;
      saveBattles();
      renderBattleActive();
    });
    row.addEventListener('dragend', () => { _battleDragIdx = null; });
  });

  // Wire row clicks to expand detail panel
  listEl.querySelectorAll('.battle-row-main').forEach(main => {
    main.addEventListener('click', e => {
      if (e.target.closest('[contenteditable]') || e.target.closest('.b-remove') ||
          e.target.closest('[data-nodrag]') || e.target.closest('[data-adjopen]')) return;
      const i = main.dataset.i;
      const detail = document.getElementById('bdetail-' + i);
      if (detail) {
        detail.classList.toggle('open');
        if (detail.classList.contains('open')) _openBattleDetails.add(+i);
        else _openBattleDetails.delete(+i);
      }
    });
  });

  // Initiative edits
  listEl.querySelectorAll('.b-init').forEach(span => {
    span.addEventListener('blur', () => {
      const i = +span.dataset.i;
      const val = parseInt(span.textContent.trim(), 10);
      if (!isNaN(val)) { curBattle().combatants[i].initiative = val; saveBattles(); }
    });
    span.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); span.blur(); } });
  });

  // AC edits
  listEl.querySelectorAll('.b-ac').forEach(span => {
    span.addEventListener('focus', () => {
      // Strip "AC " prefix for editing
      span.textContent = span.textContent.replace(/^AC\s*/i, '');
    });
    span.addEventListener('blur', () => {
      const i = +span.dataset.i;
      const val = parseInt(span.textContent.trim(), 10);
      if (!isNaN(val)) { curBattle().combatants[i].ac = val; saveBattles(); }
      span.textContent = 'AC ' + (curBattle().combatants[i].ac ?? '—');
    });
    span.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); span.blur(); } });
  });

  // Dmg / Heal toggle buttons
  let _adjMode = {}; // per-row: 'dmg' | 'heal'
  listEl.querySelectorAll('[data-adjopen]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const i = +btn.dataset.adjopen;
      const mode = btn.dataset.adjmode;
      const panel = document.getElementById('badj-panel-' + i);
      if (!panel) return;
      const alreadyOpen = panel.classList.contains('open') && _adjMode[i] === mode;
      // Close all adj panels first
      listEl.querySelectorAll('.b-adj-panel.open').forEach(p => p.classList.remove('open'));
      if (!alreadyOpen) {
        _adjMode[i] = mode;
        document.getElementById('badj-label-' + i).textContent = mode === 'dmg' ? 'Damage:' : 'Heal:';
        panel.classList.add('open');
        document.getElementById('badj-' + i)?.focus();
      }
    });
  });

  // Apply dmg/heal
  listEl.querySelectorAll('[data-adjapply]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.adjapply;
      const inp = document.getElementById('badj-' + i);
      const amt = Math.max(0, parseInt(inp?.value) || 0);
      if (!amt) return;
      const c = curBattle().combatants[i];
      if (_adjMode[i] === 'dmg') {
        let rem = amt;
        if (c.tempHp > 0) { const absorbed = Math.min(c.tempHp, rem); c.tempHp -= absorbed; rem -= absorbed; }
        c.hp = Math.max(0, c.hp - rem);
      } else {
        c.hp = Math.min(c.maxHp, c.hp + amt);
      }
      saveBattles();
      renderBattleActive();
    });
  });
  listEl.querySelectorAll('[data-adjcancel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById('badj-panel-' + btn.dataset.adjcancel);
      if (panel) panel.classList.remove('open');
    });
  });
  // Enter in adj input triggers apply
  listEl.querySelectorAll('.b-adj-panel input').forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); inp.closest('.b-adj-panel').querySelector('[data-adjapply]')?.click(); }
    });
  });

  // Temp HP
  listEl.querySelectorAll('[data-setthp]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.setthp;
      const amt = Math.max(0, parseInt(document.getElementById('bthp-' + i)?.value) || 0);
      curBattle().combatants[i].tempHp = amt;
      saveBattles();
      renderBattleActive();
    });
  });

  // Notes — in-place save on blur
  listEl.querySelectorAll('.b-notes-input').forEach(inp => {
    inp.addEventListener('blur', () => {
      curBattle().combatants[+inp.dataset.i].notes = inp.value;
      saveBattles();
    });
  });

  // Condition checkboxes — in-place update (no full re-render, keeps dropdown open)
  listEl.querySelectorAll('.b-cond-dropdown-options').forEach(opts => {
    opts.addEventListener('change', e => {
      if (e.target.type !== 'checkbox') return;
      const i = +opts.dataset.condi;
      const c = curBattle().combatants[i];
      c.conditions = [...opts.querySelectorAll('input:checked')].map(cb => cb.value);
      saveBattles();
      // Update abbreviation and count in place without re-rendering
      const row = listEl.querySelector(`[data-bi="${i}"]`);
      if (row) {
        const abbr = c.conditions.slice(0,3).map(cd => cd.substring(0,3)).join(' ');
        let condsEl = row.querySelector('.b-conds');
        if (abbr && !condsEl) {
          // Insert before remove button
          condsEl = document.createElement('span');
          condsEl.className = 'b-conds';
          row.querySelector('.b-remove').before(condsEl);
        }
        if (condsEl) { condsEl.textContent = abbr; condsEl.title = c.conditions.join(', '); condsEl.style.display = abbr ? '' : 'none'; }
        const sum = row.querySelector('.b-cond-dropdown summary');
        if (sum) sum.innerHTML = `Conditions${c.conditions.length ? ` <strong style="color:var(--accent)">(${c.conditions.length})</strong>` : ''}`;
      }
    });
  });

  // Remove combatant
  listEl.querySelectorAll('[data-rm]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.rm;
      const b = curBattle();
      b.combatants.splice(i, 1);
      if (b.turnIdx >= b.combatants.length) b.turnIdx = 0;
      saveBattles();
      renderBattleActive();
    });
  });

  // Next Turn button
  const btnNext = document.getElementById('btnBattleNext');
  if (btnNext) btnNext.onclick = battleNextTurn;

  // End Battle button
  const btnEnd = document.getElementById('btnEndBattle');
  if (btnEnd) btnEnd.onclick = () => {
    if (!confirm('End this battle and return to setup?')) return;
    const b = curBattle();
    b.phase = 'setup';
    b.combatants = [];
    b.round = 1;
    b.turnIdx = 0;
    battleEnemyQueue = [];
    saveBattles();
    renderBattle();
  };

  // Mid-battle add-enemy panel
  const btnMidAdd  = document.getElementById('btnMidAddEnemy');
  const midPanel   = document.getElementById('battleMidAdd');
  const midSearch  = document.getElementById('battleMidSearch');
  const midResults = document.getElementById('battleMidResults');
  const midSelRow  = document.getElementById('battleMidSelected');
  const midName    = document.getElementById('battleMidName');

  if (btnMidAdd && midPanel) {
    btnMidAdd.onclick = () => {
      const open = midPanel.style.display !== 'none';
      midPanel.style.display = open ? 'none' : '';
      if (!open) { midSearch.value = ''; midSearch.focus(); midResults.innerHTML = ''; midResults.classList.remove('open'); midSelRow.style.display = 'none'; _midAddCreature = null; }
    };

    midSearch.addEventListener('input', () => {
      const q = midSearch.value.trim().toLowerCase();
      midResults.innerHTML = '';
      midSelRow.style.display = 'none'; _midAddCreature = null;
      if (q.length < 2) { midResults.classList.remove('open'); return; }
      const hits = (ALL_CREATURES || []).filter(m => m.name.toLowerCase().includes(q)).slice(0, 12);
      if (!hits.length) { midResults.classList.remove('open'); return; }
      midResults.innerHTML = hits.map(m =>
        `<div class="battle-enemy-result-row" data-name="${m.name.replace(/"/g,'&quot;')}">
          ${m.name}<span class="ber-cr">${m.cr ? 'CR ' + m.cr : ''}</span>
        </div>`
      ).join('');
      midResults.classList.add('open');
      midResults.querySelectorAll('.battle-enemy-result-row').forEach(row => {
        row.addEventListener('click', () => {
          _midAddCreature = (ALL_CREATURES || []).find(m => m.name === row.dataset.name);
          if (!_midAddCreature) return;
          midName.value = _midAddCreature.name;
          document.getElementById('battleMidHp').value = _midAddCreature.hp ? parseInt(_midAddCreature.hp) || '' : '';
          document.getElementById('battleMidAc').value = _midAddCreature.ac ? parseInt(_midAddCreature.ac) || '' : '';
          document.getElementById('battleMidCount').value = 1;
          midSelRow.style.display = '';
          midResults.classList.remove('open');
          midSearch.value = '';
        });
      });
    });

    document.getElementById('btnMidAddCancel').onclick = () => { _midAddCreature = null; midSelRow.style.display = 'none'; };

    document.getElementById('btnMidAddConfirm').onclick = () => {
      if (!_midAddCreature) return;
      const count   = Math.max(1, parseInt(document.getElementById('battleMidCount').value) || 1);
      const customHp = parseInt(document.getElementById('battleMidHp').value) || null;
      const baseHp  = customHp || parseInt(_midAddCreature.hp) || 10;
      const customAc = parseInt(document.getElementById('battleMidAc').value) || null;
      const baseAc  = customAc || parseInt(_midAddCreature.ac) || 10;
      const dexMod  = parseDexMod(_midAddCreature.dex);
      const baseName = (document.getElementById('battleMidName').value.trim()) || _midAddCreature.name;
      const b = curBattle();
      for (let n = 0; n < count; n++) {
        const label = count > 1 ? `${baseName} ${n + 1}` : baseName;
        b.combatants.push({
          id: Date.now() + '_mid_' + n + '_' + Math.random().toString(36).slice(2),
          name: label, creatureName: baseName,
          type: 'enemy',
          hp: baseHp, maxHp: baseHp,
          ac: baseAc,
          initiative: rollD20() + dexMod,
          tempHp: 0, conditions: [], notes: '', gone: false,
        });
      }
      b.combatants.sort((a, z) => z.initiative - a.initiative);
      saveBattles();
      _midAddCreature = null; midSelRow.style.display = 'none';
      midPanel.style.display = 'none';
      renderBattleActive();
    };
  }
}

function battleNextTurn() {
  const b = curBattle();
  const cs = b.combatants;
  if (!cs.length) return;

  // Mark current as gone
  if (cs[b.turnIdx]) cs[b.turnIdx].gone = true;

  // Find next non-gone, non-defeated combatant starting after current
  const n = cs.length;
  let found = -1;
  for (let offset = 1; offset < n; offset++) {
    const idx = (b.turnIdx + offset) % n;
    const c = cs[idx];
    if (!c.gone && c.hp > 0) { found = idx; break; }
  }

  if (found === -1) {
    // New round
    b.round++;
    cs.forEach(c => { c.gone = false; });
    // Find first non-defeated
    const firstAlive = cs.findIndex(c => c.hp > 0);
    b.turnIdx = firstAlive >= 0 ? firstAlive : 0;
  } else {
    b.turnIdx = found;
  }

  saveBattles();
  renderBattleActive();
}

// ── Battle slot management ────────────────────────────────────────────────────
document.getElementById('btnNewBattle').addEventListener('click', () => {
  const name = prompt('Battle name:', 'Battle ' + (battles.length + 1));
  if (!name) return;
  battles.push({ id: Date.now() + '_' + Math.random().toString(36).slice(2), name, phase: 'setup', round: 1, turnIdx: 0, combatants: [] });
  currentBattleIdx = battles.length - 1;
  battleEnemyQueue = [];
  saveBattles();
  renderBattle();
});

document.getElementById('btnRenameBattle').addEventListener('click', () => {
  const name = prompt('New name:', curBattle().name);
  if (name) { curBattle().name = name; saveBattles(); renderBattleSlots(); }
});

document.getElementById('btnDeleteBattle').addEventListener('click', () => {
  if (battles.length <= 1) { alert('Cannot delete the last battle.'); return; }
  if (!confirm('Delete "' + curBattle().name + '"?')) return;
  battles.splice(currentBattleIdx, 1);
  currentBattleIdx = Math.max(0, currentBattleIdx - 1);
  battleEnemyQueue = [];
  saveBattles();
  renderBattle();
});

// ── Top-level render ──────────────────────────────────────────────────────────
function showBattlePhase() {
  const phase = curBattle().phase;
  const setup  = document.getElementById('battleSetup');
  const active = document.getElementById('battleActive');
  if (setup)  setup.style.display  = phase === 'setup'  ? '' : 'none';
  if (active) active.style.display = phase === 'active' ? '' : 'none';
}

function renderBattle() {
  renderBattleSlots();
  showBattlePhase();
  const b = curBattle();
  if (b.phase === 'setup') {
    renderBattleSetup();
  } else {
    renderBattleActive();
  }
}

// ─── INITIALISE ──────────────────────────────────────────────────────────────
buildNarrative();
buildPlayerRolls();
renderSavedLists();
renderPlayerRoster();
renderNpcRoster();
renderBattle();

(async function init() {
  try {
    _topbar.showStatus('Loading configuration…');
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
    buildAllRollTables(allTables);
    buildWeaponsTable(srd.weapons);
    _topbar.showStatus(null);
  } catch(e) {
    console.error('SRD load failed:', e);
    _topbar.showStatus('Could not load SRD data — check your connection and refresh. Encounter builder and narrative rolls still work.', true);
    buildStatGrid('');
    buildAllRollTables(BUILTIN_ROLL_TABLES);
    buildWeaponsTable([]);
  }
})();
