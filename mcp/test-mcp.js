const { spawn } = require('child_process');
const path = require('path');

const server = spawn('node', [path.join(__dirname, 'image-search-server.js')], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

let out = '';
let pending = null;

function frame(payload) {
  const s = JSON.stringify(payload);
  return 'Content-Length: ' + Buffer.byteLength(s, 'utf8') + '\r\n\r\n' + s;
}

function parseFrames() {
  while (true) {
    const idx = out.indexOf('\r\n\r\n');
    if (idx === -1) break;
    const head = out.slice(0, idx);
    const m = head.match(/Content-Length:\s*(\d+)/i);
    if (!m) { out = ''; break; }
    const len = parseInt(m[1], 10);
    const start = idx + 4;
    if (out.length < start + len) break;
    const body = out.slice(start, start + len);
    out = out.slice(start + len);
    try {
      const msg = JSON.parse(body);
      console.log('RAW <-', JSON.stringify(msg));
      if (pending) { const cb = pending; pending = null; cb(msg); }
    } catch (e) { /* ignore */ }
  }
}

server.stdout.on('data', (d) => { out += d.toString(); parseFrames(); });
server.stderr.on('data', (d) => process.stderr.write(d));

function send(payload, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let t;
    pending = (msg) => { clearTimeout(t); resolve(msg); };
    t = setTimeout(() => { pending = null; reject(new Error('TIMEOUT ' + payload.method)); }, timeoutMs);
    server.stdin.write(frame(payload));
  });
}

(async () => {
  try {
    console.log('== initialize ==');
    await send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    console.log('== tools/list ==');
    await send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    console.log('== search ==');
    const r = await send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_images', arguments: { query: 'postgresql logo', limit: 3 } } }, 40000);
    console.log('SEARCH RESULT items:', (r.result && r.result.items ? r.result.items.length : 0));
    console.log(JSON.stringify(r.result && r.result.items ? r.result.items : r, null, 2));
  } catch (e) {
    console.error('ERR', e.message);
  } finally {
    server.kill();
    process.exit(0);
  }
})();
