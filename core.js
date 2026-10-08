// Calcul pur (aucun DOM) : testable avec node
function compute(text) {
  const RE = /^\s*(\d+)\.\d+\s+(\S+)\s+(\S+)\s+([+-]?\d+(?:\.\d+)?)\s*$/gm;
  const games = []; let m;
  while ((m = RE.exec(text))) games.push({ r: +m[1], a: m[2], b: m[3], s: parseFloat(m[4]) });
  const st = {};
  const cell = (a, b) => ((st[a] = st[a] || {})[b] = st[a][b] || { w: 0, d: 0, l: 0 });
  for (const g of games) {
    const x = cell(g.a, g.b), y = cell(g.b, g.a);
    if (g.s > 0) { x.w++; y.l++; } else if (g.s < 0) { x.l++; y.w++; } else { x.d++; y.d++; }
  }
  const pts = {}, gp = {};
  for (const a in st) {
    pts[a] = 0; gp[a] = 0;
    for (const b in st[a]) { const c = st[a][b]; pts[a] += c.w + c.d / 2; gp[a] += c.w + c.d + c.l; }
  }
  const ps = Object.keys(st).sort((a, b) => pts[b] - pts[a] || a.localeCompare(b));
  
  // Courbe : points cumulés bruts (W=1, D=0.5, L=0) par round
  const R = games.reduce((m, g) => Math.max(m, g.r), 0);
  const byR = {}; games.forEach(g => (byR[g.r] = byR[g.r] || []).push(g));
  const cp = {}, series = {};
  ps.forEach(p => { cp[p] = 0; series[p] = []; });
  
  for (let r = 1; r <= R; r++) {
    for (const g of byR[r] || []) {
      const pa = g.s > 0 ? 1 : g.s < 0 ? 0 : 0.5;
      cp[g.a] += pa; 
      cp[g.b] += 1 - pa;
    }
    // Stockage du score réel cumulé (toujours >= 0)
    ps.forEach(p => series[p].push(cp[p]));
  }
  
  return { st, ps, pts, gp, n: games.length, rounds: R, series };
}

if (typeof module !== 'undefined') module.exports = { compute };