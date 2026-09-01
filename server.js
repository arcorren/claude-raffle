// Claude Raffle — meetup giveaway server.
// Zero dependencies. `node server.js` (or ./start.sh for the tunnel).

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = process.env.PORT || 4747;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ENTRIES_FILE = path.join(__dirname, 'entries.json');
const MAX_NAME_LEN = 24;

// entries: [{ name, token }] — token is the phone's private key to drive its critter
let entries = [];
try {
  const raw = JSON.parse(fs.readFileSync(ENTRIES_FILE, 'utf8'));
  if (Array.isArray(raw)) {
    entries = raw
      .map((e) => (typeof e === 'string' ? { name: e, token: newToken() } : e))
      .filter((e) => e && typeof e.name === 'string' && typeof e.token === 'string');
  }
} catch {
  entries = [];
}

function newToken() {
  return crypto.randomBytes(12).toString('hex');
}

// Name filter: blocks genuinely hateful stuff only — crude humor is allowed
// on purpose. ANYWHERE terms are safe to match as substrings; WORD terms
// appear inside innocent words (spice, raccoon, therapist) so they must
// stand alone.
const BLOCK_ANYWHERE = [
  'nigger', 'nigga', 'faggot', 'kike', 'wetback', 'beaner',
  'towelhead', 'raghead', 'tranny', 'retard', 'hitler', 'nazi', 'chink',
];
// 'dyke' deliberately absent: real surname (Van Dyke) and ordinary word
const BLOCK_AS_WORD = ['fag', 'spic', 'coon', 'rape', 'rapist', 'kys'];

function deleet(s) {
  return s.toLowerCase()
    .replace(/[@4]/g, 'a').replace(/3/g, 'e').replace(/[1!|]/g, 'i')
    .replace(/0/g, 'o').replace(/[5$]/g, 's').replace(/7/g, 't').replace(/8/g, 'b');
}

function isHateful(name) {
  const squashed = deleet(name).replace(/[^a-z]/g, '');
  if (BLOCK_ANYWHERE.some((w) => squashed.includes(w))) return true;
  const words = deleet(name).split(/[^a-z]+/).filter(Boolean);
  return words.some((w) => BLOCK_AS_WORD.includes(w));
}

function names() {
  return entries.map((e) => e.name);
}

// what the SSE stream is allowed to see: names + looks, never tokens
function entriesPayload() {
  return {
    names: names(),
    entries: entries.map((e) => ({ name: e.name, look: e.look || null })),
  };
}

function saveEntries() {
  fs.writeFile(ENTRIES_FILE, JSON.stringify(entries, null, 2), () => {});
}

// --- SSE ---
const sseClients = new Set();

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) res.write(msg);
}

function lanUrl() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return `http://${net.address}:${PORT}`;
      }
    }
  }
  return `http://localhost:${PORT}`;
}

// Only the screen page on Alex's laptop may draw/reset. Tunnel traffic
// arrives via localhost too, but cloudflared always adds forwarding
// headers — a genuine screen-page request has neither. Origin check
// blocks CSRF from other sites open in the laptop's browser (browsers
// always send Origin on POST; header-less requests are CLI tools).
function isLocalRequest(req) {
  const addr = req.socket.remoteAddress || '';
  const loopback = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  const proxied = 'cf-connecting-ip' in req.headers || 'x-forwarded-for' in req.headers;
  if (req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.headers.host) return false;
    } catch {
      return false;
    }
  }
  return loopback && !proxied;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 4096) {
        reject(new Error('too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // --- API ---
  if (url.pathname === '/api/enter' && req.method === 'POST') {
    let name;
    try {
      name = String(JSON.parse(await readBody(req)).name || '');
    } catch {
      return json(res, 400, { error: 'Bad request' });
    }
    name = name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LEN);
    if (!name) return json(res, 400, { error: 'Enter a name first' });
    if (isHateful(name)) return json(res, 400, { error: "Let's keep it friendly — pick a different name" });
    const taken = entries.some((e) => e.name.toLowerCase() === name.toLowerCase());
    if (taken) return json(res, 409, { error: "That name's taken — add a last initial?" });
    const entry = { name, token: newToken() };
    entries.push(entry);
    saveEntries();
    broadcast('entries', entriesPayload());
    return json(res, 200, { ok: true, name, token: entry.token, count: entries.length });
  }

  if (url.pathname === '/api/move' && req.method === 'POST') {
    let name, token, dir;
    try {
      const body = JSON.parse(await readBody(req));
      name = String(body.name || '');
      token = String(body.token || '');
      dir = String(body.dir || '');
    } catch {
      return json(res, 400, { error: 'Bad request' });
    }
    if (!['up', 'down', 'left', 'right'].includes(dir)) return json(res, 400, { error: 'Bad direction' });
    const entry = entries.find((e) => e.name === name);
    if (!entry) return json(res, 404, { error: 'Not entered' });
    if (entry.token !== token) return json(res, 403, { error: 'Not your critter' });
    broadcast('move', { name, dir });
    return json(res, 200, { ok: true });
  }

  if (url.pathname === '/api/look' && req.method === 'POST') {
    let name, token, look;
    try {
      const body = JSON.parse(await readBody(req));
      name = String(body.name || '');
      token = String(body.token || '');
      look = body.look;
    } catch {
      return json(res, 400, { error: 'Bad request' });
    }
    if (!look || !Number.isInteger(look.c) || !Number.isInteger(look.e) ||
        look.c < 0 || look.c > 63 || look.e < 0 || look.e > 63) {
      return json(res, 400, { error: 'Bad look' });
    }
    const entry = entries.find((e) => e.name === name);
    if (!entry) return json(res, 404, { error: 'Not entered' });
    if (entry.token !== token) return json(res, 403, { error: 'Not your critter' });
    entry.look = { c: look.c, e: look.e };
    saveEntries();
    broadcast('entries', entriesPayload());
    return json(res, 200, { ok: true });
  }

  if (url.pathname === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`event: entries\ndata: ${JSON.stringify(entriesPayload())}\n\n`);
    sseClients.add(res);
    const keepalive = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(keepalive);
      sseClients.delete(res);
    });
    return;
  }

  if (url.pathname === '/api/draw' && req.method === 'POST') {
    if (!isLocalRequest(req)) return json(res, 403, { error: 'Draw runs from the big screen only' });
    if (entries.length === 0) return json(res, 400, { error: 'No entries yet' });
    const winner = entries[crypto.randomInt(entries.length)].name;
    broadcast('draw', { winner, names: names() });
    return json(res, 200, { ok: true, winner });
  }

  if (url.pathname === '/api/reset' && req.method === 'POST') {
    if (!isLocalRequest(req)) return json(res, 403, { error: 'Reset runs from the big screen only' });
    entries = [];
    saveEntries();
    broadcast('entries', entriesPayload());
    return json(res, 200, { ok: true });
  }

  if (url.pathname === '/api/config' && req.method === 'GET') {
    return json(res, 200, {
      publicUrl: process.env.PUBLIC_URL || lanUrl(),
      count: entries.length,
    });
  }

  // --- Static files ---
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  if (filePath === '/screen') filePath = '/screen.html';
  const resolved = path.join(PUBLIC_DIR, path.normalize(filePath));
  if (!resolved.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(resolved)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`claude-raffle running:`);
  console.log(`  big screen  → http://localhost:${PORT}/screen`);
  console.log(`  entry page  → ${process.env.PUBLIC_URL || lanUrl()}`);
});
