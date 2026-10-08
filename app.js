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

// Instant correspondant à une heure de Paris (date AAAA-MM-JJ + HH:MM)
const parisInstant = (date, timeStr) => {
  const probe = new Date(`${date}T${timeStr}:00Z`);
  const off = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', timeZoneName: 'shortOffset' })
    .formatToParts(probe).find(p => p.type === 'timeZoneName').value; // ex. "GMT+2"
  const hours = parseInt(off.replace('GMT', '') || '0', 10);
  const offset = (hours < 0 ? '-' : '+') + String(Math.abs(hours)).padStart(2, '0') + ':00';
  return new Date(`${date}T${timeStr}:00${offset}`);
};
const inParis = () => Intl.DateTimeFormat().resolvedOptions().timeZone === 'Europe/Paris';
const tzShort = d => new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
  .formatToParts(d).find(p => p.type === 'timeZoneName').value;

// Date/heure : heure locale du visiteur + rappel de l'heure de Paris
const getDateTime = t => {
  const timeStr = getStartTime(t);
  if (timeStr === 'TBA') return `${t.date} · TBA`;
  const d = parisInstant(t.date, timeStr);
  const base = `${d.toLocaleDateString('sv')} · ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} (${tzShort(d)})`;
  return inParis() ? base : `${base} — ${timeStr} Paris`;
};

// Prochain samedi (AAAA-MM-JJ), aujourd'hui compris
const nextSaturday = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  return d.toLocaleDateString('sv');
};

// Heure locale du visiteur pour une heure de Paris le prochain samedi ; '' si le visiteur est à Paris
const localStart = timeStr => {
  if (inParis()) return '';
  const d = parisInstant(nextSaturday(), timeStr);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const day = d.toLocaleDateString('en-US', { weekday: 'long' });
  return `; ${day !== 'Saturday' ? day + ' ' : ''}${time} ${tzShort(d)} in your time zone`;
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


/* ---------- Envoi du formulaire de contact via mailto ---------- */
window.handleContactSubmit = function(event) {
  event.preventDefault();
  const name = document.getElementById('contact-name').value;
  const email = document.getElementById('contact-email').value;
  const message = document.getElementById('contact-message').value;

  const user = 'hcyrano';
  const domain = 'free.fr';
  const recipient = `${user}@${domain}`;

  const subject = encodeURIComponent(`[GGS Tournament] Inquiry from ${name}`);
  const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`);

  window.location.href = `mailto:${recipient}?subject=${subject}&body=${body}`;
};

/* ---------- Page « How to join » ---------- */

const joinPage = () => `
<p class="back-nav"><a class="nav-link" href="#/">← Home</a></p>
<h2>How to participate</h2>
<p class="lead">Every month, an online Othello AI tournament is organized on the GGS server, open to all programs.</p>

<section class="card prose">
  <h3>When</h3>
  <p>The tournament usually takes place on a Saturday and starts at 9:00 AM (Paris time${localStart('09:00')}). Registration opens 15 minutes before the start of the competition.</p>
</section>

<section class="section-block">
  <h3 class="block-title">Registration procedure</h3>
  <div class="card prose">
    <p>To register for the tournament, you must have an active GGS account.</p>
    <p><strong>Account creation:</strong> send an email to Michael Buro (contact details in the Contact section of the <a href="https://skatgame.net/mburo/ggsa/index.html">GGSA website</a>) with the following information:</p>
    <ul>
      <li>Your name</li>
      <li>Your desired login</li>
      <li>A password</li>
    </ul>
    <p class="tip"><strong>Tip:</strong> I recommend requesting 2 or 3 logins.</p>
    <p>To follow the tournament as a human observer, I suggest using the dedicated Java application <a href="https://skatgame.net/mburo/ggsa/index.html">GGSA</a> (contact us for the latest version).</p>
  </div>
</section>

<section class="section-block">
  <h3 class="block-title">Tournament rules and details</h3>
  <div class="rules">
    <div class="card prose">
      <h4>1. Match format</h4>
      <p>Each match between two AIs consists of two synchronized mirror games (Game A and Game B):</p>
      <ul>
        <li>In Game A, your AI plays with White (or Black).</li>
        <li>In Game B, your AI plays with Black (or White).</li>
      </ul>
    </div>
    <div class="card prose">
      <h4>2. Gameplay and starting positions</h4>
      <ul>
        <li>Both games start from identical positions, randomly generated with 14 discs already placed on the board.</li>
        <li>Moves are revealed and transmitted simultaneously once both AIs have made their move.</li>
        <li>Clocks and thinking time are managed individually for each game.</li>
      </ul>
    </div>
    <div class="card prose">
      <h4>3. Scoring and standings</h4>
      <p>A match winner is determined by the total number of discs accumulated across both games.</p>
      <p>Tournament points are awarded as follows:</p>
      <ul>
        <li><strong>Win:</strong> 1 point</li>
        <li><strong>Draw:</strong> 0.5 points</li>
        <li><strong>Loss:</strong> 0 points</li>
      </ul>
    </div>
    <div class="card prose">
      <h4>4. Time management</h4>
      <ul>
        <li>The time control alternates every month: either 1 minute or 3 minutes per match.</li>
        <li><strong>Time overrun:</strong> if a program exceeds the allocated time, it receives an extra 30 seconds to finish the game, but its score for that game will be capped at −2 discs.</li>
      </ul>
    </div>
    <div class="card prose">
      <h4>5. Hardware limits</h4>
      <p>To ensure fairness between machines, programs are limited to a maximum of 8 threads, which you can allocate as you wish between the two games (e.g. 8+0, 6+2, 4+4).</p>
    </div>
  </div>
</section>

<section class="section-block">
  <h3 class="block-title">Contact us</h3>
  <div class="card prose">
    <p>Have questions? Send a message directly using the form below:</p>
    <form onsubmit="handleContactSubmit(event)" style="display: flex; flex-direction: column; gap: 12px; margin-top: 15px;">
      <div>
        <label for="contact-name" style="display: block; font-weight: bold; margin-bottom: 4px;">Your Name</label>
        <input type="text" id="contact-name" required style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
      </div>
      <div>
        <label for="contact-email" style="display: block; font-weight: bold; margin-bottom: 4px;">Your Email</label>
        <input type="email" id="contact-email" required style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
      </div>
      <div>
        <label for="contact-message" style="display: block; font-weight: bold; margin-bottom: 4px;">Message</label>
        <textarea id="contact-message" rows="4" required style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; resize: vertical;"></textarea>
      </div>
      <button type="submit" style="align-self: flex-start; padding: 8px 16px; background-color: #2a6fdb; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Send Message</button>
    </form>
  </div>
</section>
`;

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
          pending.map(t => `<div class="card-next"><div class="card-next-header"><span class="badge-status pending">Announcement</span><span class="date-tag">${esc(getDateTime(t))}</span></div><h3>${esc(t.nom)}</h3>${t.description ? `<p class="desc">${esc(t.description)}</p>` : ''}<p class="format-info"><strong>Format:</strong> ${esc(getFormat(t))} · <strong>Rounds:</strong> ${esc(getRounds(t))}</p><p class="registration-note">Registration opens 15 minutes before the start. <a href="#/join">How to participate</a></p></div>`).join('') +
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

    } else if (route === '/join') {
      document.title = 'How to participate · GGS Tournaments';
      app.innerHTML = joinPage();

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
