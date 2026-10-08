const COLORS = ['#2a6fdb', '#e0562f', '#2a9d5b', '#b8860b', '#8e44ad', '#16a2b8', '#d6336c', '#7f8c8d'];
const $ = s => document.querySelector(s);
const f1 = v => (Number.isInteger(v) ? v + '.0' : String(v));
const cache = {};
const D = () => window.TOURNOIS_DATA;

// Échappement HTML (noms de joueurs, descriptions, messages d'erreur)
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const loadList = () => cache.list || (cache.list = fetch('tournois/index.json').then(r => r.json())
  .catch(e => { if (D()) return D().list; throw e; }));

const loadText = t => cache[t.id] || (cache[t.id] = fetch('tournois/' + t.fichier)
  .then(r => { if (!r.ok) throw new Error(t.fichier); return r.text(); })
  .catch(e => { if (D() && t.id in D().texts) return D().texts[t.id]; throw e; }));

/* ---------- Métadonnées d'un tournoi ---------- */

const getStartTime = t => t.time || t.heure || 'TBA';
const isTBA = v => v === undefined || v === null || v === 'TBA';
const getFormat = t => t.format || 'TBA';
const getRounds = t => (t.rounds !== undefined ? `${t.rounds} × (all vs all)` : 'TBA');

// Ligne "Format · Rounds" ; les parties inconnues sont omises plutôt qu'affichées en TBA
const formatLine = (t, fallbackRounds) => {
  const parts = [];
  if (!isTBA(t.format)) parts.push(`<strong>Format:</strong> ${esc(t.format)}`);
  const r = t.rounds !== undefined ? t.rounds : fallbackRounds;
  if (r !== undefined) parts.push(`<strong>Rounds:</strong> ${esc(r)} × (all vs all)`);
  return parts.length ? parts.join(' · ') : '<strong>Format:</strong> TBA';
};

// Date/heure : heure locale du visiteur + rappel de l'heure de Paris
const getDateTime = t => {
  const timeStr = getStartTime(t);
  if (timeStr === 'TBA') return `${t.date} · TBA`;

  // Décalage de Paris à cette date (GMT+1 ou GMT+2), via Intl
  const probe = new Date(`${t.date}T${timeStr}:00Z`);
  const off = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', timeZoneName: 'shortOffset' })
    .formatToParts(probe).find(p => p.type === 'timeZoneName').value; // ex. "GMT+2"
  const hours = parseInt(off.replace('GMT', '') || '0', 10);
  const offset = (hours < 0 ? '-' : '+') + String(Math.abs(hours)).padStart(2, '0') + ':00';
  const parisDate = new Date(`${t.date}T${timeStr}:00${offset}`);

  const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localTime = parisDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); // 24 h
  const localDate = parisDate.toLocaleDateString('sv'); // AAAA-MM-JJ
  const tzName = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
    .formatToParts(parisDate).find(p => p.type === 'timeZoneName').value;

  const base = `${localDate} · ${localTime} (${tzName})`;
  return userTz === 'Europe/Paris' ? base : `${base} — ${timeStr} Paris`;
};

/* ---------- Crosstable ---------- */

function crosstable(c) {
  const { st, ps, pts, gp } = c;
  let h = '<table class="ct" translate="no"><tr><th></th><th class="l">Player</th>' + ps.map(p => `<th>${esc(p)}</th>`).join('') + '<th>Total</th></tr>';

  // Rang avec ex æquo : même rang si mêmes points, affiché "=" pour les suivants
  const ranks = ps.map((p, i) => (i > 0 && pts[p] === pts[ps[i - 1]]) ? null : i + 1);
  let shown = 0;

  ps.forEach((a, i) => {
    if (ranks[i] !== null) shown = ranks[i];
    const tie = (ranks[i] === null) || (i + 1 < ps.length && pts[ps[i + 1]] === pts[a]);
    h += `<tr><td class="rank">${shown}${tie ? '=' : ''}</td><td class="l">${esc(a)}</td>`;
    for (const b of ps) {
      if (a === b) { h += '<td class="c self"></td>'; continue; }
      const x = (st[a] || {})[b] || { w: 0, d: 0, l: 0 }, g = x.w + x.d + x.l;
      if (!g) { h += '<td class="c empty">–</td>'; continue; }
      const p = x.w + x.d / 2, r = p / g, dev = Math.min(Math.abs(r - .5) * 2, 1);
      const bg = `rgba(var(${r >= .5 ? '--win' : '--loss'}),${(dev * .6).toFixed(2)})`;
      h += `<td class="c" style="background:${bg}"><span class="score-main">${f1(p)}</span><br><small class="wdl-sub">${x.w}-${x.d}-${x.l}</small></td>`;
    }
    h += `<td class="tot">${f1(pts[a])}<br><small>${(100 * pts[a] / gp[a]).toFixed(1)} %</small></td></tr>`;
  });
  return `<div class="scroll">${h}</table></div>`;
}

/* ---------- Courbe ---------- */

// Pas "agréable" (1, 2, 5, 10, 20, 50…) pour avoir ~target graduations
const niceStep = (max, target) => {
  const raw = max / target, mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / mag;
  return Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag);
};

function curve(c) {
  const W = 900, H = 640, L = 44, R = 20, T = 15, B = 30;
  const nRounds = c.rounds;

  const best = Math.max(0, ...c.ps.map(p => Math.max(0, ...(c.series[p] || []))));
  const yStep = niceStep(Math.max(best, 5), 8);
  const hi = Math.max(5, Math.ceil(best / yStep) * yStep);

  const x = i => L + (W - L - R) * (nRounds > 0 ? i / nRounds : 0);
  const y = v => T + (H - T - B) * (1 - v / hi);

  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative score by round">`;

  for (let v = 0; v <= hi; v += yStep) {
    s += `<line class="ax" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" opacity=".3"/><text class="tx" x="${L - 6}" y="${y(v) + 5}" text-anchor="end">${v}</text>`;
  }

  const xStep = nRounds <= 10 ? 1 : nRounds <= 30 ? 5 : niceStep(nRounds, 8);
  let lastTick = 0;
  for (let i = 0; i <= nRounds; i += xStep) {
    s += `<line class="ax" x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${H - B}" opacity=".15"/>`;
    s += `<text class="tx" x="${x(i)}" y="${H - 8}" text-anchor="middle">R${i}</text>`;
    lastTick = i;
  }
  // Dernier round, seulement s'il ne chevauche pas la dernière graduation
  if (nRounds - lastTick >= xStep / 2) {
    s += `<text class="tx" x="${x(nRounds)}" y="${H - 8}" text-anchor="middle">R${nRounds}</text>`;
  }

  // Segments droits : un score cumulé ne doit jamais sembler baisser ou rebondir
  c.ps.forEach((p, k) => {
    const vals = [0, ...(c.series[p] || [])];
    const d = vals.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const col = COLORS[k % COLORS.length];
    s += `<path fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" d="${d}"><title>${esc(p)}</title></path>`;
    const last = vals[vals.length - 1];
    s += `<circle cx="${x(vals.length - 1).toFixed(1)}" cy="${y(last).toFixed(1)}" r="4" fill="${col}"><title>${esc(p)} : ${f1(last)}</title></circle>`;
  });

  s += `</svg>`;

  const lg = c.ps.map((p, k) => `<span><span class="sw" style="background:${COLORS[k % COLORS.length]}"></span>${esc(p)} (${f1(c.pts[p])})</span>`).join('');
  return `<div class="card"><h3>Cumulative score by round</h3><div class="scroll"><div class="chart">${s}</div></div><div class="legend" translate="no">${lg}</div></div>`;
}

/* ---------- Listes ---------- */

const RECENT_COUNT = 5;

// Terminés : du plus récent au plus ancien
const sortDone = list => list.filter(t => t.fichier).sort((x, y) => y.date.localeCompare(x.date));
// À venir : du plus proche au plus lointain
const sortPending = list => list.filter(t => !t.fichier).sort((x, y) => (x.date + getStartTime(x)).localeCompare(y.date + getStartTime(y)));

const tournamentTable = items => `<div class="card table-card"><table class="list"><thead><tr><th>Tournament</th><th>Date</th></tr></thead><tbody>` +
  items.map(t => `<tr><td><a class="tournament-link" href="#/t/${esc(t.id)}">${esc(t.nom)}</a></td><td class="date-cell">${esc(t.date)}</td></tr>`).join('') +
  `</tbody></table></div>`;

const yearOf = t => t.date.slice(0, 4);

const yearTabs = (years, current, done) =>
  `<nav class="year-tabs" aria-label="Years">` +
  years.map(y => {
    const n = done.filter(t => yearOf(t) === y).length;
    return `<a class="year-tab${y === current ? ' active' : ''}"${y === current ? ' aria-current="page"' : ''} href="#/archive/${y}">${y}<span class="count">${n}</span></a>`;
  }).join('') +
  `</nav>`;

/* ---------- Rendu ---------- */

async function render() {
  const app = $('#app');
  const route = location.hash.slice(1) || '/';
  document.title = 'GGS Tournaments';

  try {
    const list = await loadList();

    if (route === '/') {
      const pending = sortPending(list);
      const done = sortDone(list);

      let html = `<div class="hero"><div><span class="badge-hero">Othello AI</span><h1>The best AIs battle it out at Othello</h1><p class="hero-desc">Stay informed — follow tournament results and rankings.</p></div><div class="othello-discs" aria-hidden="true"><div class="othello-disc-3d black"></div><div class="othello-disc-3d white"></div></div></div>`;

      if (pending.length) {
        html += `<section class="section-block"><div class="section-header"><h2>Upcoming tournaments</h2></div><div class="next-grid">` +
          pending.map(t => `<div class="card-next"><div class="card-next-header"><span class="badge-status pending">Announcement</span><span class="date-tag">${esc(getDateTime(t))}</span></div><h3>${esc(t.nom)}</h3>${t.description ? `<p class="desc">${esc(t.description)}</p>` : ''}<p class="format-info"><strong>Format:</strong> ${esc(getFormat(t))} · <strong>Rounds:</strong> ${esc(getRounds(t))}</p><p class="registration-note">Registration opens 15 minutes before the start.</p></div>`).join('') +
          `</div></section>`;
      }

      const recent = done.slice(0, RECENT_COUNT);
      const moreLink = done.length > RECENT_COUNT ? `<a class="nav-link highlight" href="#/archive">All tournaments (${done.length})</a>` : '';
      html += `<section class="section-block"><div class="section-header"><h2>Latest tournaments</h2>${moreLink}</div>${tournamentTable(recent)}</section>`;

      app.innerHTML = html;

    } else if (route === '/archive' || route.startsWith('/archive/')) {
      const done = sortDone(list);
      const years = [...new Set(done.map(yearOf))];
      const asked = route.split('/')[2];
      const year = years.includes(asked) ? asked : years[0];
      const items = done.filter(t => yearOf(t) === year);
      app.innerHTML = `<p class="back-nav"><a class="nav-link" href="#/">← Home</a></p><section class="section-block"><div class="section-header"><h2>All tournaments</h2></div>${yearTabs(years, year, done)}${tournamentTable(items)}</section>`;

    } else if (route.startsWith('/t/')) {
      const id = route.split('/t/')[1];
      const t = list.find(x => x.id === id);
      if (!t || !t.fichier) throw new Error('Tournament not found');
      const c = compute(await loadText(t));
      if (!c.n) throw new Error('No games could be parsed from ' + t.fichier);
      document.title = `${t.nom} · GGS Tournaments`;
      app.innerHTML = `<p class="back-nav"><a class="nav-link" href="#/archive/${yearOf(t)}">← All tournaments</a></p><h2>${esc(t.nom)} (${esc(t.date)})</h2><p class="format-info results-format">${formatLine(t, c.rounds)}</p><section class="standings-section"><h3>Tournament standings</h3><div class="card">${crosstable(c)}</div><p class="table-note">W-D-L = Wins – Draws – Losses · 1 point for a win, 0.5 for a draw, 0 for a loss.</p></section>${curve(c)}`;

    } else {
      throw new Error('Page not found');
    }
  } catch (err) {
    app.innerHTML = `<div class="card"><p class="error">Error: ${esc(err.message)}</p><p><a class="nav-link" href="#/">← Home</a></p></div>`;
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);
