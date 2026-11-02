'use strict';

/**
 * The listening step for a trained voice version, in the browser (`mlx-audio listen`).
 *
 *   listen <profile> [--version vN] [--no-open] [--minutes 30]
 *
 * Serves the newest unanswered blind A/B test (made by `compare`) on 127.0.0.1 and opens it: each line
 * with players A and B and a pick (A, B, can't tell), then the reveal, and, if the new version won, the
 * user's choice to switch narration to it or keep the current voice. The command waits until the user is
 * done on the page, or until it has been idle for --minutes (the test then stays unanswered), and prints
 * the outcome. Picks are recorded as `compare --answer` records them; switching is `use-version`.
 *
 * Only 127.0.0.1 is served, under a random token, and only the test's own clips. POSTs must be JSON with
 * the right Host header, so other pages open in the browser can't answer or switch.
 */

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const core = require('../../scripts/lib/integrations');
const { listVersions, versionsDir, readKey, recordAnswer, summarizeAnswer, switchVersion } = require('./train');

const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const CLIP = /^[AB]-\d{1,2}\.wav$/;
const DEFAULT_MINUTES = 30;
const MAX_MINUTES = 240;
const MAX_BODY_BYTES = 10 * 1024;
const EXIT = { ok: 0, failed: 1, usage: 2 };

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Finished listening tests across all versions, newest first. */
function listeningTests(profileDir) {
  const tests = [];
  for (const v of listVersions(profileDir).filter((x) => !x.broken)) {
    const root = path.join(versionsDir(profileDir), v.id, 'compare');
    for (const run of fs.existsSync(root) ? fs.readdirSync(root) : []) {
      const runDir = path.join(root, run);
      if (fs.existsSync(path.join(runDir, 'key.json'))) tests.push({ version: v.id, run, runDir, answered: fs.existsSync(path.join(runDir, 'answer.json')) });
    }
  }
  return tests.sort((a, b) => b.run.localeCompare(a.run));
}

const STYLE = `
  :root { --bg: #f4f1ea; --card: #fffdf8; --ink: #1d1b18; --muted: #6b665d; --rule: #e2dccf; --a: #2f5d50; --b: #9a4f27; --pick: #1d1b18; }
  @media (prefers-color-scheme: dark) { :root { --bg: #141311; --card: #1e1c19; --ink: #f1ede6; --muted: #a59f93; --rule: #353129; --a: #86c2ac; --b: #e8a47c; --pick: #f1ede6; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 -apple-system, "SF Pro Text", system-ui, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 48px 16px 64px; }
  h1 { font: 600 clamp(26px, 4vw, 34px)/1.15 ui-serif, "New York", Georgia, serif; margin: 0 0 10px; letter-spacing: -0.01em; }
  .lead { color: var(--muted); margin: 0 0 32px; max-width: 60ch; }
  .line { background: var(--card); border: 1px solid var(--rule); border-radius: 16px; padding: 22px; margin: 0 0 18px; }
  .line legend { font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); font-weight: 600; padding: 0; }
  .quote { font: 19px/1.45 ui-serif, "New York", Georgia, serif; margin: 6px 0 18px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 560px) { .pair { grid-template-columns: 1fr; } }
  .side { border: 1px solid var(--rule); border-radius: 12px; padding: 12px 14px 14px; }
  .side-a { border-top: 3px solid var(--a); } .side-b { border-top: 3px solid var(--b); }
  .tag { font-weight: 700; font-size: 20px; } .side-a .tag { color: var(--a); } .side-b .tag { color: var(--b); }
  .who { font-size: 13px; color: var(--muted); margin-left: 8px; }
  audio { width: 100%; margin-top: 8px; }
  .choices { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
  .choices label { cursor: pointer; position: relative; }
  .choices input { position: absolute; opacity: 0; pointer-events: none; }
  .choices span { display: inline-block; padding: 8px 16px; border: 1px solid var(--rule); border-radius: 999px; font-weight: 600; transition: background 150ms, color 150ms, border-color 150ms; }
  .choices label:hover span { border-color: var(--muted); }
  .choices input:focus-visible + span { outline: 2px solid var(--a); outline-offset: 2px; }
  .choices input:checked + span { background: var(--pick); color: var(--card); border-color: var(--pick); }
  .choices input:disabled + span { cursor: default; opacity: 0.75; }
  button { font: inherit; font-weight: 600; border-radius: 12px; padding: 12px 20px; border: 1px solid var(--ink); background: var(--ink); color: var(--card); cursor: pointer; }
  button.secondary { background: transparent; color: var(--ink); }
  button:disabled { opacity: 0.4; cursor: default; }
  button:focus-visible { outline: 2px solid var(--a); outline-offset: 2px; }
  .actions { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
  .hint { color: var(--muted); font-size: 14px; }
  .panel { background: var(--card); border: 1px solid var(--rule); border-radius: 16px; padding: 22px; margin-top: 24px; }
  .panel h2 { font: 600 22px/1.25 ui-serif, "New York", Georgia, serif; margin: 0 0 8px; }
  .panel p { margin: 0 0 14px; }
  .error { color: var(--b); font-weight: 600; }
  footer { color: var(--muted); font-size: 14px; margin-top: 28px; }
  [hidden] { display: none !important; }
`;

/** The page: players A and B per line, a pick per line, then reveal and the switch decision. */
function listenPage(lines, versionId) {
  const cards = lines.map((text, i) => {
    const n = i + 1;
    const sides = ['A', 'B'].map((s) => `
          <div class="side side-${s.toLowerCase()}"><span class="tag">${s}</span><span class="who" data-who="${s}"></span>
            <audio controls preload="metadata" src="${s}-${n}.wav" aria-label="Line ${n}, voice ${s}"></audio></div>`).join('');
    const choices = [['A', 'A'], ['B', 'B'], ['-', "Can't tell"]].map(([value, label]) => `
          <label><input type="radio" name="line-${n}" value="${value}" required><span>${label}</span></label>`).join('');
    return `
      <fieldset class="line">
        <legend>Line ${n}</legend>
        <p class="quote">“${escapeHtml(text)}”</p>
        <div class="pair">${sides}
        </div>
        <div class="choices" role="radiogroup" aria-label="Line ${n}: which sounds more like you?">${choices}
        </div>
      </fieldset>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Voice listening test</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <h1>Which one sounds more like you?</h1>
  <p class="lead">Each line is read by two voices, A and B. One is the voice your narration uses now; the other is trained version ${escapeHtml(versionId)}. Which is which stays hidden until you submit. Listen to both, pick one per line, then submit.</p>
  <form id="picks">
${cards}
    <div class="actions">
      <button type="submit" id="submit" disabled>Submit my picks</button>
      <span class="hint" id="remaining">Pick A, B, or can't tell on every line.</span>
    </div>
  </form>
  <section class="panel" id="result" hidden aria-live="polite">
    <h2 id="result-title"></h2>
    <p id="result-text"></p>
    <div class="actions" id="decide" hidden>
      <button type="button" id="switch"></button>
      <button type="button" class="secondary" id="keep">Keep my current voice</button>
    </div>
    <p class="hint" id="done" hidden>All done. You can close this tab; Claude has your answer.</p>
  </section>
  <p class="error" id="error" role="alert" hidden></p>
  <footer>Headphones help, and so does playing each pair more than once. Nothing leaves your Mac: this page is served by Nexus on 127.0.0.1 only while the test is open.</footer>
</main>
<script>
  const LINES = ${lines.length};
  const base = location.pathname.endsWith('/') ? location.pathname : location.pathname + '/';
  const $ = (id) => document.getElementById(id);
  const form = $('picks');

  // One player at a time, so A and B never overlap.
  document.addEventListener('play', (e) => { for (const a of document.querySelectorAll('audio')) if (a !== e.target) a.pause(); }, true);

  function picks() { const data = new FormData(form); return Array.from({ length: LINES }, (_, i) => data.get('line-' + (i + 1))); }
  form.addEventListener('change', () => {
    const left = picks().filter((p) => !p).length;
    $('submit').disabled = left > 0;
    $('remaining').textContent = left ? left + ' line' + (left === 1 ? '' : 's') + ' left to pick.' : 'Ready to submit.';
  });

  async function post(what, body) {
    $('error').hidden = true;
    try {
      const res = await fetch(base + what, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      return data;
    } catch (err) {
      $('error').textContent = 'Something went wrong: ' + err.message + '. If the test was closed, run /voice-listen again.';
      $('error').hidden = false;
      return null;
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    $('submit').disabled = true;
    const r = await post('answer', { picks: picks() });
    if (!r) { $('submit').disabled = false; return; }
    for (const input of form.querySelectorAll('input')) input.disabled = true;
    for (const el of document.querySelectorAll('[data-who]')) el.textContent = el.dataset.who === r.candidateSide ? r.candidate : 'current voice';
    $('remaining').textContent = '';
    const tally = r.candidate + ' won ' + r.versionWins + ' of ' + LINES + '; your current voice won ' + r.currentWins + (r.unsure ? '; ' + r.unsure + " can't tell" : '') + '.';
    $('result-text').textContent = 'A was ' + r.A + '. B was ' + r.B + '. ' + tally;
    $('result').hidden = false;
    if (r.winner === 'version') {
      $('result-title').textContent = 'You preferred ' + r.candidate;
      $('switch').textContent = 'Switch my narration to ' + r.candidate;
      $('decide').hidden = false;
    } else {
      $('result-title').textContent = r.winner === 'tie' ? 'A tie: your current voice stays' : 'Your current voice stays';
      $('done').hidden = false;
    }
    $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  async function decide(doSwitch) {
    $('switch').disabled = true; $('keep').disabled = true;
    const r = await post('decision', { switch: doSwitch });
    if (!r) { $('switch').disabled = false; $('keep').disabled = false; return; }
    $('decide').hidden = true;
    $('result-title').textContent = r.switched ? 'Switched' : 'Kept your current voice';
    $('result-text').textContent = r.message;
    $('done').hidden = false;
  }
  $('switch').addEventListener('click', () => decide(true));
  $('keep').addEventListener('click', () => decide(false));
</script>
</body>
</html>
`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { reject(new Error('request too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Streams one clip, honouring a single byte range (Safari's player asks for ranges). */
function sendClip(req, res, file) {
  const size = fs.statSync(file).size;
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  const headers = { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (!m || (!m[1] && !m[2])) {
    res.writeHead(200, { ...headers, 'Content-Length': size });
    fs.createReadStream(file).pipe(res);
    return;
  }
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start > end || start >= size) { res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }); res.end(); return; }
  res.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}` });
  fs.createReadStream(file, { start, end }).pipe(res);
}

/**
 * Serves one test until the user is done (or it has been idle for `minutes`). `ready` resolves with the
 * URL once listening; `done` with { answer, decision: 'none'|'switched'|'kept', message, timedOut }.
 */
function startSession({ runDir, key, ref, voicesDir, minutes }) {
  const token = crypto.randomBytes(16).toString('hex');
  const prefix = `/${token}/`;
  const state = { answer: null, decision: null, message: null };
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });
  let idle = null;
  let server = null;
  let finished = false;
  const finish = (extra = {}) => {
    if (finished) return;
    finished = true;
    clearTimeout(idle);
    server.close();
    server.closeAllConnections(); // the browser keeps connections open; don't let them hold the command
    resolveDone({ ...state, ...extra });
  };
  const touch = () => { clearTimeout(idle); idle = setTimeout(() => finish({ timedOut: true }), minutes * 60 * 1000); };
  const json = (res, status, body, then) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(body), then);
  };

  async function onPost(name, req, res) {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'send JSON' });
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (err) { return json(res, 400, { error: err.message }); }
    if (name === 'answer') {
      if (state.answer) return json(res, 409, { error: 'this test is already answered' });
      const r = recordAnswer(runDir, body && body.picks);
      if (r.error) return json(res, 400, { error: r.error });
      state.answer = r;
      const reply = { A: r.A, B: r.B, candidate: r.candidate, candidateSide: r.candidateSide, versionWins: r.versionWins, currentWins: r.currentWins, unsure: r.unsure, winner: r.winner };
      // Nothing left to decide unless the new version won.
      return json(res, 200, reply, r.winner === 'version' ? undefined : () => { state.decision = 'none'; finish(); });
    }
    if (!state.answer || state.answer.winner !== 'version' || state.decision) return json(res, 409, { error: 'there is no switch to decide' });
    if (body && body.switch === true) {
      const s = switchVersion(voicesDir, ref, state.answer.candidate);
      if (s.error) return json(res, 500, { error: s.error });
      state.decision = 'switched';
      state.message = `Your narration now uses ${state.answer.candidate}. Anything narrated with the old voice re-renders the next time it's generated, and you can switch back any time.`;
    } else {
      state.decision = 'kept';
      state.message = `Your narration keeps its current voice. ${state.answer.candidate} stays on disk if you change your mind.`;
    }
    return json(res, 200, { switched: state.decision === 'switched', message: state.message }, () => finish());
  }

  server = http.createServer((req, res) => {
    touch();
    const { port } = server.address();
    if (req.headers.host !== `127.0.0.1:${port}` || !req.url.startsWith(prefix)) return json(res, 404, { error: 'not found' });
    const name = req.url.slice(prefix.length).split('?')[0];
    if (req.method === 'GET' && name === '') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'none'; media-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'",
      });
      return res.end(listenPage(key.lines, key.candidate));
    }
    if (req.method === 'GET' && CLIP.test(name) && fs.existsSync(path.join(runDir, name))) return sendClip(req, res, path.join(runDir, name));
    if (req.method === 'POST' && (name === 'answer' || name === 'decision')) {
      return onPost(name, req, res).catch((err) => json(res, 500, { error: err.message }));
    }
    return json(res, 404, { error: 'not found' });
  });
  const ready = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { touch(); resolve(`http://127.0.0.1:${server.address().port}${prefix}`); });
  });
  return { ready, done };
}

async function listenCommand(args, ctx, { voicesDir }) {
  const { flags, positional } = core.parseFlags(args, ['no-open']);
  const ref = positional[0];
  const minutes = flags.minutes === undefined ? DEFAULT_MINUTES : Number(flags.minutes);
  if (!ID.test(ref || '') || !(minutes > 0 && minutes <= MAX_MINUTES)) {
    console.error(`usage: mlx-audio ${commands.listen.usage} (minutes: up to ${MAX_MINUTES})`);
    return EXIT.usage;
  }
  const dir = path.join(voicesDir, ref);
  if (!fs.existsSync(path.join(dir, 'profile.json'))) { console.error(`no voice profile "${ref}" in ${voicesDir}`); return EXIT.failed; }
  const waiting = listeningTests(dir).filter((t) => !t.answered && (!flags.version || t.version === flags.version));
  if (!waiting.length) {
    console.log(`No listening test is waiting for "${ref}". Train and compare a new version first (the voice-train skill, or: mlx-audio train ${ref}).`);
    return EXIT.ok;
  }
  const test = waiting[0];
  const key = readKey(test.runDir);
  const session = startSession({ runDir: test.runDir, key, ref, voicesDir, minutes });
  const url = await session.ready;
  console.log(`Listening test for ${test.version}: ${key.lines.length} lines, each in voices A and B.`);
  console.log(`Open: ${url}`);
  if (!flags['no-open']) {
    const opened = ctx.run(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { timeoutMs: 15000 });
    if (opened.code !== 0) console.log('(Couldn\'t open the browser automatically; open the address above.)');
  }
  console.log(`Waiting for the picks in the browser (closes after ${minutes} idle minutes)...`);

  const outcome = await session.done;
  if (!outcome.answer) {
    console.log(`No picks after ${minutes} idle minutes; the test is still waiting. Run listen again, or answer here: mlx-audio compare ${ref} ${test.version} --answer A,B,-`);
    return EXIT.ok;
  }
  const [revealLine, tallyLine, nextLine] = summarizeAnswer(outcome.answer, ref);
  console.log(revealLine);
  console.log(tallyLine);
  if (outcome.decision === 'switched') console.log(`Switched on the page: "${ref}" now narrates with trained version ${outcome.answer.candidate}.`);
  else if (outcome.decision === 'kept') console.log(`Kept on the page: "${ref}" keeps its current voice; ${outcome.answer.candidate} stays on disk.`);
  else console.log(outcome.answer.winner === 'version' ? `No switch was chosen on the page before it closed. ${nextLine}` : nextLine);
  return EXIT.ok;
}

const commands = {
  listen: { usage: 'listen <profile> [--version vN] [--no-open] [--minutes 30]', summary: 'open the newest listening test in the browser: pick A/B per line, reveal, and switch or keep', run: listenCommand },
};

module.exports = { commands, listenPage };
