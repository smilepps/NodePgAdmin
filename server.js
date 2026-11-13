require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const app = express();
const PORT = process.env.PORT || 3000;

const connectionString = process.env.DB || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ Укажите строку подключения в переменной окружения DB или DATABASE_URL');
  process.exit(1);
}

const pool = new Pool({ connectionString });

const STORE_FILE = path.join(__dirname, 'store.json');
let store = { themes: {}, templates: [], history: [], descriptions: {}, columnOrder: {}, tableOrder: [] };
function loadStore() {
  try {
    if (fs.existsSync(STORE_FILE)) store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch (e) { console.warn('Не удалось загрузить store:', e.message); }
}
function saveStore() {
  try { fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2)); } catch (e) { console.warn('Не удалось сохранить store:', e.message); }
}
loadStore();

// ---------- Middleware ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const upload = multer({ dest: path.join(__dirname, 'uploads'), limits: { fileSize: 50 * 1024 * 1024 } });

function ident(name) { return '"' + String(name).replace(/"/g, '""') + '"'; }
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }

// ---------- Input type mapping for PostgreSQL data types ----------
function pgInputType(dataType) {
  const dt = String(dataType).toLowerCase();
  if (dt === 'date') return 'date';
  if (dt === 'time' || dt === 'time with time zone') return 'time';
  if (dt === 'timestamp' || dt === 'timestamp with time zone') return 'datetime-local';
  return 'text';
}
function pgFormatValue(val, dataType) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  const dt = String(dataType).toLowerCase();
  if (dt === 'timestamp' || dt === 'timestamp with time zone') {
    // PostgreSQL: "2024-01-15 10:30:00" or "2024-01-15 10:30:00.123456+00"
    // datetime-local expects: "2024-01-15T10:30"
    return s.replace(' ', 'T').substring(0, 16);
  }
  if (dt === 'date') return s.substring(0, 10);
  if (dt === 'time' || dt === 'time with time zone') return s.substring(0, 5);
  return s;
}
function inputHtml(name, dataType, value) {
  const type = pgInputType(dataType);
  const formatted = pgFormatValue(value, dataType);
  return `<input type="${type}" name="${name}" value="${esc(formatted)}">`;
}

// ---------- PostgreSQL data types (all supported) ----------
const PG_TYPES = [
  { name: 'bigint', label: 'BIGINT', group: 'numeric' },
  { name: 'bigserial', label: 'BIGSERIAL', group: 'serial' },
  { name: 'bit', label: 'BIT', group: 'bitstring' },
  { name: 'bit varying', label: 'BIT VARYING', group: 'bitstring' },
  { name: 'boolean', label: 'BOOLEAN', group: 'boolean' },
  { name: 'box', label: 'BOX', group: 'geometric' },
  { name: 'bytea', label: 'BYTEA', group: 'binary' },
  { name: 'character', label: 'CHARACTER (CHAR)', group: 'character' },
  { name: 'character varying', label: 'CHARACTER VARYING (VARCHAR)', group: 'character' },
  { name: 'cidr', label: 'CIDR', group: 'network' },
  { name: 'circle', label: 'CIRCLE', group: 'geometric' },
  { name: 'date', label: 'DATE', group: 'datetime' },
  { name: 'double precision', label: 'DOUBLE PRECISION', group: 'numeric' },
  { name: 'inet', label: 'INET', group: 'network' },
  { name: 'integer', label: 'INTEGER (INT)', group: 'numeric' },
  { name: 'interval', label: 'INTERVAL', group: 'datetime' },
  { name: 'json', label: 'JSON', group: 'json' },
  { name: 'jsonb', label: 'JSONB', group: 'json' },
  { name: 'line', label: 'LINE', group: 'geometric' },
  { name: 'lseg', label: 'LSEG', group: 'geometric' },
  { name: 'macaddr', label: 'MACADDR', group: 'network' },
  { name: 'macaddr8', label: 'MACADDR8', group: 'network' },
  { name: 'money', label: 'MONEY', group: 'numeric' },
  { name: 'numeric', label: 'NUMERIC (DECIMAL)', group: 'numeric' },
  { name: 'path', label: 'PATH', group: 'geometric' },
  { name: 'pg_lsn', label: 'PG_LSN', group: 'misc' },
  { name: 'pg_snapshot', label: 'PG_SNAPSHOT', group: 'misc' },
  { name: 'point', label: 'POINT', group: 'geometric' },
  { name: 'polygon', label: 'POLYGON', group: 'geometric' },
  { name: 'real', label: 'REAL (FLOAT4)', group: 'numeric' },
  { name: 'smallint', label: 'SMALLINT (INT2)', group: 'numeric' },
  { name: 'smallserial', label: 'SMALLSERIAL', group: 'serial' },
  { name: 'serial', label: 'SERIAL', group: 'serial' },
  { name: 'text', label: 'TEXT', group: 'character' },
  { name: 'time', label: 'TIME', group: 'datetime' },
  { name: 'time with time zone', label: 'TIME WITH TIME ZONE', group: 'datetime' },
  { name: 'timestamp', label: 'TIMESTAMP', group: 'datetime' },
  { name: 'timestamp with time zone', label: 'TIMESTAMP WITH TIME ZONE (TIMESTAMPTZ)', group: 'datetime' },
  { name: 'tsquery', label: 'TSQUERY', group: 'fulltext' },
  { name: 'tsvector', label: 'TSVECTOR', group: 'fulltext' },
  { name: 'txid_snapshot', label: 'TXID_SNAPSHOT', group: 'misc' },
  { name: 'uuid', label: 'UUID', group: 'misc' },
  { name: 'xml', label: 'XML', group: 'xml' },
];

// ---------- HTML shell ----------
const APP_NAME = 'NodePgAdmin smile';

function shell(title, bodyHtml, extraJs = '') {
  const themeKey = 'ui_theme';
  const currentTheme = store.themes[themeKey] || 'dark';
  const isDark = currentTheme === 'dark';
  const themeToggle = isDark ? '☀️ Светлая' : '🌙 Тёмная';
  const themeBtnClass = isDark ? 'theme-btn-light' : 'theme-btn-dark';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} | ${APP_NAME}</title>
<link rel="stylesheet" href="/style.css">
<style>
:root{--bg:#1e1e1e;--card:#252526;--text:#cccccc;--muted:#858585;--accent:#007acc;--accent-hover:#0067b5;--border:#333333;--success:#4ec9b0;--danger:#f44747;--warning:#dcdcaa;--input:#3c3c3c;--input-border:#464647;--table-bg:#1e1e1e;--table-hover:#2d2d2d;}
[data-theme="light"]{--bg:#ffffff;--card:#f3f3f3;--text:#000000;--muted:#6e6e6e;--accent:#007acc;--accent-hover:#0067b5;--border:#cccccc;--success:#117a01;--danger:#d13438;--warning:#986603;--input:#ffffff;--input-border:#a9a9a9;--table-bg:#ffffff;--table-hover:#f3f3f3;}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.topbar { background: var(--card); border-bottom: 1px solid var(--border); padding: 0.75rem 1.5rem; display: flex; align-items: center; gap: 1rem; position: sticky; top: 0; z-index: 100; }
.brand { font-size: 1.25rem; font-weight: 800; color: var(--text); display: flex; align-items: center; gap: 0.5rem; }
.brand emoji { font-size: 1.5rem; }
.nav { display: flex; align-items: center; gap: 0.5rem; margin-left: auto; }
.nav a { padding: 0.4rem 0.8rem; border-radius: 6px; font-size: 0.85rem; color: var(--text); background: var(--bg); border: 1px solid var(--border); }
.nav a:hover { background: var(--accent); color: #fff; }
.theme-btn { padding: 0.35rem 0.75rem; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer; font-size: 0.85rem; margin-left: 0.5rem; }
.theme-btn:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
.container { max-width: 1400px; margin: 0 auto; padding: 1.5rem; }
h1 { font-size: 1.5rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; color: var(--text); }
h2 { font-size: 1.15rem; margin: 1.25rem 0 0.75rem; color: var(--accent); border-bottom: 1px solid var(--border); padding-bottom: 0.3rem; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem; margin-bottom: 1rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
.stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
.stat { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; display: flex; align-items: center; gap: 0.75rem; }
.stat .v { font-size: 1.5rem; font-weight: 800; color: var(--accent); }
.stat .l { font-size: 0.8rem; color: var(--muted); }
.stat .icon { font-size: 1.5rem; }
table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; background: var(--table-bg); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
th, td { border: 1px solid var(--border); padding: 0.6rem 0.75rem; text-align: left; font-size: 0.85rem; }
th { background: var(--card); color: var(--muted); font-weight: 700; position: sticky; top: 0; z-index: 3; white-space: nowrap; cursor: grab; user-select: none; }
th:hover { background: var(--table-hover); }
td { vertical-align: top; }
tr:nth-child(even) td { background: var(--table-hover); }
tr.drag-over td { background: var(--accent) !important; color: #fff; opacity: 0.8; }
.mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.82rem; }
.null { color: var(--muted); font-style: italic; }
.btn { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.45rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); background: var(--card); color: var(--text); cursor: pointer; font-size: 0.85rem; transition: all 0.2s; }
.btn:hover { border-color: var(--accent); color: var(--accent); background: var(--table-hover); }
.btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn.primary:hover { background: var(--accent-hover); }
.btn.danger { background: var(--danger); color: #fff; border-color: var(--danger); }
.btn.danger:hover { opacity: 0.9; }
.btn.small { padding: 0.25rem 0.55rem; font-size: 0.78rem; }
.btn.reset { background: transparent; color: var(--warning); border-color: var(--warning); }
.btn.reset:hover { background: var(--warning); color: #fff; }
.btn.ghost { background: transparent; border: none; color: var(--muted); padding: 0.35rem; }
.btn.ghost:hover { color: var(--text); background: var(--table-hover); border-radius: 4px; }
.form-group { margin-bottom: 0.75rem; }
.form-group label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--muted); margin-bottom: 0.25rem; }
.form-group input, .form-group select, .form-group textarea { width: 100%; max-width: 500px; padding: 0.5rem; border: 1px solid var(--input-border); border-radius: 6px; background: var(--input); color: var(--text); font-size: 0.85rem; }
.form-group input:focus, .form-group select:focus, .form-group textarea:focus { outline: none; border-color: var(--accent); ring: 2px solid var(--accent); }
.row { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: end; }
.ok { background: rgba(34,197,94,0.15); border: 1px solid var(--success); color: var(--success); padding: 0.75rem; border-radius: 6px; margin-top: 0.75rem; font-size: 0.85rem; }
.error { background: rgba(239,68,68,0.15); border: 1px solid var(--danger); color: var(--danger); padding: 0.75rem; border-radius: 6px; margin-top: 0.75rem; font-size: 0.85rem; }
.warn { background: rgba(245,158,11,0.15); border: 1px solid var(--warning); color: var(--warning); padding: 0.75rem; border-radius: 6px; margin-top: 0.75rem; font-size: 0.85rem; }
.pagination { display: flex; gap: 0.3rem; margin-top: 0.75rem; align-items: center; }
.pagination a { padding: 0.35rem 0.65rem; border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 0.85rem; background: var(--card); }
.pagination a.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.badge { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.15rem 0.5rem; border-radius: 999px; font-size: 0.75rem; background: var(--card); border: 1px solid var(--border); color: var(--muted); }
.badge.accent { background: var(--accent); color: #fff; border-color: var(--accent); }
textarea.sql { width: 100%; min-height: 220px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.85rem; padding: 0.75rem; border: 1px solid var(--input-border); border-radius: 8px; background: var(--input); color: var(--text); resize: vertical; }
textarea.sql:focus { outline: none; border-color: var(--accent); }
.templates { margin-bottom: 1rem; }
.templates select { padding: 0.5rem; border-radius: 6px; border: 1px solid var(--input-border); background: var(--input); color: var(--text); font-size: 0.85rem; }
.draggable { cursor: grab; user-select: none; }
.draggable:active { cursor: grabbing; }
.cell-edit { border: 2px solid var(--accent); background: var(--accent) !important; color: #000 !important; padding: 0.25rem; border-radius: 4px; }
.cell-edit input { width: 100%; background: transparent; border: none; color: #000; font-weight: 700; font-size: 0.85rem; }
.cell-edit input:focus { outline: none; }
.desc-badge { font-size: 0.72rem; color: var(--muted); margin-left: 0.4rem; border: 1px solid var(--border); padding: 0.1rem 0.35rem; border-radius: 4px; background: var(--input); }
.icon-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.5rem; }
.icon-item { border: 1px solid var(--border); border-radius: 8px; padding: 0.5rem; text-align: center; cursor: pointer; background: var(--card); }
.icon-item:hover { border-color: var(--accent); background: var(--table-hover); }
.icon-item img { max-width: 64px; max-height: 64px; border-radius: 4px; margin-bottom: 0.3rem; display: block; margin: 0 auto 0.25rem; }
.import-zone { border: 2px dashed var(--border); border-radius: 8px; padding: 2rem; text-align: center; background: var(--card); cursor: pointer; transition: all 0.2s; }
.import-zone:hover { border-color: var(--accent); background: var(--table-hover); }
.history-item { padding: 0.5rem; border-bottom: 1px solid var(--border); font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
.history-item:last-child { border-bottom: none; }
.history-sql { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; color: var(--accent); max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-time { color: var(--muted); font-size: 0.75rem; margin-left: 0.5rem; }
.nav-tabs { display: flex; gap: 0.25rem; margin-bottom: 1rem; border-bottom: 1px solid var(--border); overflow-x: auto; }
.nav-tabs a { padding: 0.5rem 1rem; border: 1px solid var(--border); border-bottom: none; border-radius: 6px 6px 0 0; color: var(--muted); font-size: 0.85rem; background: var(--card); }
.nav-tabs a.active { color: var(--text); border-color: var(--border); border-bottom: 1px solid var(--card); background: var(--bg); }
.modal { position: fixed; inset: 0; z-index: 1000; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); }
.modal.open { display: flex; }
.modal-content { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 1.5rem; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto; }
.modal-close { position: absolute; top: 0.75rem; right: 1rem; background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--muted); }
@media (max-width: 768px) { .container { padding: 1rem; } .row { flex-direction: column; } table { font-size: 0.75rem; } th, td { padding: 0.4rem 0.5rem; } }
</style>
${extraJs}
</head>
<body>
<div class="topbar">
  <div class="brand"><emoji>🐘</emoji><strong>${APP_NAME}</strong></div>
  <div class="nav">
    <a href="/">🏠 Дашборд</a>
    <a href="/browser">📂 Браузер</a>
    <a href="/query">🔍 SQL</a>
    <a href="/import">📥 Импорт</a>
    <button class="theme-btn" onclick="toggleTheme()" id="themeBtn">${themeToggle}</button>
  </div>
</div>
<div class="container">${bodyHtml}</div>
<script>
const THEME_KEY='ui_theme';function toggleTheme(){const html=document.documentElement;const isDark=html.getAttribute('data-theme')!=='light';html.setAttribute('data-theme',isDark?'light':'dark');localStorage.setItem(THEME_KEY,isDark?'light':'dark');const btn=document.getElementById('themeBtn');if(btn)btn.textContent=isDark?'🌙 Тёмная':'☀️ Светлая';}
window.addEventListener('DOMContentLoaded',()=>{const saved=localStorage.getItem(THEME_KEY);if(saved){document.documentElement.setAttribute('data-theme',saved);const btn=document.getElementById('themeBtn');if(btn)btn.textContent=saved==='light'?'🌙 Тёмная':'☀️ Светлая';}});
</script>
</body>
</html>`;
}

// ---------- Helpers ----------
function apiErr(res, status, msg) { res.status(status).json({ error: msg }); }
async function queryStats() {
  const vRes = await pool.query('SELECT version() AS v');
  const sRes = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`);
  const cRes = await pool.query(`SELECT count(*) AS cnt FROM pg_stat_activity WHERE datname = current_database()`);
  const idleRes = await pool.query(`SELECT count(*) AS cnt FROM pg_stat_activity WHERE datname = current_database() AND state = 'idle'`);
  const activeRes = await pool.query(`SELECT count(*) AS cnt FROM pg_stat_activity WHERE datname = current_database() AND state = 'active'`);
  let hitRatio = 0;
  try {
    const hitsRes = await pool.query(`SELECT sum(blks_hit)::float / NULLIF(sum(blks_hit + blks_read),0) AS ratio FROM pg_stat_database WHERE datname = current_database()`);
    hitRatio = hitsRes.rows[0].ratio ? Math.round(hitsRes.rows[0].ratio * 100) : 0;
  } catch (e) { /* ignore */ }
  return {
    version: vRes.rows[0].v,
    size: sRes.rows[0].size,
    conns: parseInt(cRes.rows[0].cnt),
    idle: parseInt(idleRes.rows[0].cnt),
    active: parseInt(activeRes.rows[0].cnt),
    hitRatio
  };
}

// ============================================================================
// ROUTES
// ============================================================================

// ---------- Dashboard ----------
app.get('/', async (req, res) => {
  try {
    const stats = await queryStats();
    const recent = (store.history || []).slice(0, 10).reverse();
    const tables = await pool.query(
      `SELECT table_name AS name,
              (SELECT count(*) FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.table_name) AS cols
       FROM information_schema.tables t
       WHERE table_schema='public' AND table_type='BASE TABLE'
       ORDER BY table_name LIMIT 20`);
    let html = `<h1><emoji>📊</emoji>${APP_NAME} — Дашборд</h1>`;
    html += `<div class="stat-grid">`;
    html += `<div class="stat"><div class="icon">🐘</div><div><div class="v">${esc(stats.version)}</div><div class="l">PostgreSQL</div></div></div>`;
    html += `<div class="stat"><div class="icon">💾</div><div><div class="v">${esc(stats.size)}</div><div class="l">Размер БД</div></div></div>`;
    html += `<div class="stat"><div class="icon">🔌</div><div><div class="v">${stats.conns}</div><div class="l">Подключений</div></div></div>`;
    html += `<div class="stat"><div class="icon">⚡</div><div><div class="v">${stats.active}</div><div class="l">Активных запросов</div></div></div>`;
    html += `<div class="stat"><div class="icon">💤</div><div><div class="v">${stats.idle}</div><div class="l">Ожидающих</div></div></div>`;
    html += `<div class="stat"><div class="icon">🎯</div><div><div class="v">${stats.hitRatio}%</div><div class="l">Кэш попаданий</div></div></div>`;
    html += `</div>`;

    html += `<div class="card"><h2><emoji>🕒</emoji> Последние запросы</h2>`;
    if (recent.length === 0) html += `<p class="muted">Нет сохранённых запросов.</p>`;
    else {
      html += `<table><thead><tr><th>Время</th><th>SQL</th><th>Время выполнения</th><th>Статус</th><th>Действие</th></tr></thead><tbody>`;
      for (const h of recent) {
        html += `<tr><td><span class="mono">${esc(h.time)}</span></td><td><span class="history-sql">${esc(h.sql)}</span></td><td><span class="badge accent">${esc(h.durationMs)} мс</span></td><td><span class="badge">${esc(h.status)}</span></td><td><button class="btn ghost small" onclick="fillSql('${esc(h.sql).replace(/'/g, "&#39;")}')">▶ Вставь</button></td></tr>`;
      }
      html += `</tbody></table>`;
      html += `<button class="btn reset small" onclick="clearHistory()">🗑️ Очистить историю</button>`;
    }
    html += `</div>`;

    html += `<div class="card"><h2><emoji>📋</emoji> Таблицы</h2>`;
    if (tables.rows.length === 0) html += `<p class="muted">Таблиц не найдено.</p>`;
    else {
      html += `<table><thead><tr><th style="cursor:grab;" draggable="true">Таблица</th><th>Колонок</th><th>Действие</th></tr></thead><tbody>`;
      for (const t of tables.rows) {
        html += `<tr><td><a href="/table/${encodeURIComponent(t.name)}">${esc(t.name)}</a></td><td>${t.cols}</td><td><a href="/query?q=SELECT+*+FROM+${encodeURIComponent(t.name)}+LIMIT+50" class="btn ghost small">🔍 Данные</a></td></tr>`;
      }
      html += `</tbody></table>`;
    }
    html += `</div>`;

    res.send(shell('Дашборд', html));
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});

// ---------- Browser ----------
app.get('/browser', async (req, res) => {
  try {
    const tables = await pool.query(
      `SELECT table_name AS name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);
    const views = await pool.query(
      `SELECT table_name AS name FROM information_schema.tables WHERE table_schema='public' AND table_type='VIEW' ORDER BY table_name`);
    let html = `<h1><emoji>📂</emoji> Браузер объектов</h1>`;
    html += `<div class="card"><h2><emoji>📋</emoji> Таблицы (${tables.rows.length})</h2>`;
    if (tables.rows.length === 0) html += `<p class="muted">Нет таблиц.</p>`;
    else {
      html += `<table><thead><tr><th style="cursor:grab;" draggable="true">Имя</th><th>Действие</th></tr></thead><tbody>`;
      for (const t of tables.rows) {
        html += `<tr><td><a href="/table/${encodeURIComponent(t.name)}">${esc(t.name)}</a></td><td><a href="/table/${encodeURIComponent(t.name)}" class="btn small">Открыть</a> <a href="/table/${encodeURIComponent(t.name)}/ddl" class="btn ghost small">DDL</a></td></tr>`;
      }
      html += `</tbody></table>`;
    }
    html += `</div>`;
    html += `<div class="card"><h2><emoji>👁️</emoji> Представления (${views.rows.length})</h2>`;
    if (views.rows.length === 0) html += `<p class="muted">Нет представлений.</p>`;
    else {
      html += `<ul>`;
      for (const v of views.rows) html += `<li><a href="/view/${encodeURIComponent(v.name)}">${esc(v.name)}</a></li>`;
      html += `</ul>`;
    }
    html += `</div>`;
    res.send(shell('Браузер объектов', html));
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});

// ---------- Table: data ----------
app.get('/table/:table', async (req, res) => {
  const table = req.params.table;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
  const offset = (page - 1) * limit;
  try {
    const colsRes = await pool.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table]);
    const cols = colsRes.rows;
    if (cols.length === 0) return res.status(404).send(shell('Ошибка', `<div class="error">Таблица не найдена</div><a href="/browser">Назад</a>`));
    const colNames = cols.map(c => c.column_name);
    const orderCol = req.query.sort || colNames[0];
    const orderDir = (req.query.dir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const whereParts = [], params = [];
    if (req.query.q) {
      whereParts.push(`(${colNames.map(c => `${ident(c)}::text ILIKE $${params.length + 1}`).join(' OR ')})`);
      params.push(`%${req.query.q}%`);
    }
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const lp = params.length + 1, op2 = params.length + 2;
    const [countRes, rowsRes] = await Promise.all([
      pool.query(`SELECT count(*) FROM ${ident(table)} ${whereClause}`, params),
      pool.query(`SELECT * FROM ${ident(table)} ${whereClause} ORDER BY ${ident(orderCol)} ${orderDir} LIMIT $${lp} OFFSET $${op2}`, [...params, limit, offset])
    ]);
    const total = parseInt(countRes.rows[0].count, 10);
    const totalPages = Math.ceil(total / limit) || 1;

    // descriptions
    const descRes = await pool.query(`SELECT col.column_name, d.description FROM information_schema.columns col LEFT JOIN pg_description d ON d.objoid = ('public.'||$1)::regclass AND d.objsubid = col.ordinal_position WHERE col.table_schema='public' AND col.table_name=$1 ORDER BY col.ordinal_position`, [table]);
    const colDesc = {}; for (const d of descRes.rows) colDesc[d.column_name] = d.description;

    let html = `<h1><emoji>📋</emoji> Таблица <code>${esc(table)}</code></h1>`;
    html += `<div class="nav-tabs"><a href="/table/${encodeURIComponent(table)}" class="${!req.query.tab ? 'active' : ''}">Данные</a><a href="/table/${encodeURIComponent(table)}/structure" class="${req.query.tab==='structure'?'active':''}">Структура</a><a href="/table/${encodeURIComponent(table)}/indexes" class="${req.query.tab==='indexes'?'active':''}">Индексы</a><a href="/table/${encodeURIComponent(table)}/constraints" class="${req.query.tab==='constraints'?'active':''}">Ограничения</a><a href="/table/${encodeURIComponent(table)}/ddl" class="${req.query.tab==='ddl'?'active':''}">DDL</a></div>`;
    html += `<div class="row" style="margin-bottom:1rem;"><input type="text" id="searchInput" placeholder="🔍 Поиск по таблице…" value="${esc(req.query.q || '')}" style="flex:1;max-width:400px;"><button class="btn primary" onclick="doSearch()">Поиск</button> <button class="btn reset" onclick="resetSearch()">🔄 Сброс</button> <a href="/table/${encodeURIComponent(table)}/new" class="btn primary">+ Строка</a> <a href="/query?q=SELECT+*+FROM+${encodeURIComponent(table)}+LIMIT+100" class="btn ghost small">SQL</a></div>`;
    html += `<p><span class="badge">${total}</span> строк <span class="badge">стр. ${page}/${totalPages}</span> <span class="badge">${limit}</span> на стр.</p>`;

    if (rowsRes.rows.length === 0) {
      html += `<p>Нет данных.</p>`;
    } else {
      // column order from store
      const order = store.columnOrder && store.columnOrder[table] ? store.columnOrder[table] : colNames;
      const orderedCols = order.filter(c => colNames.includes(c)).concat(colNames.filter(c => !order.includes(c)));
      const pk = colNames[0];

      // build column type map for inline editing
      const colTypeMap = {}; for (const c of cols) colTypeMap[c.column_name] = c.data_type;
      const colTypeMapJson = JSON.stringify(colTypeMap);

      html += `<table id="dataTable"><thead><tr>`;
      for (const c of orderedCols) {
        const sortIcon = orderCol === c ? (orderDir === 'ASC' ? '▲' : '▼') : '';
        const desc = colDesc[c] ? `<span class="desc-badge" title="${esc(colDesc[c])}">📝</span>` : '';
        html += `<th class="draggable" data-col="${c}" onclick="sortTable('${esc(c)}')">${esc(c)}${desc} ${sortIcon}</th>`;
      }
      html += `<th>Действия</th></tr></thead><tbody>`;
      for (const row of rowsRes.rows) {
        html += `<tr>`;
        for (const c of orderedCols) {
          const v = row[c];
          const isNull = v === null || v === undefined;
          html += `<td data-col="${c}" data-type="${esc(colTypeMap[c] || 'text')}" onclick="startCellEdit(this, '${esc(table)}', '${esc(String(row[pk]))}', '${esc(c)}', '${esc(String(v))}')" ${isNull ? 'class="null"' : ''}>${isNull ? '<em>null</em>' : esc(String(v))}</td>`;
        }
        const id = String(row[pk]);
        html += `<td><div style="display:flex;gap:0.3rem;"><a href="/table/${encodeURIComponent(table)}/edit/${encodeURIComponent(id)}" class="btn ghost small">✏️</a><button class="btn danger small" onclick="if(confirm('Удалить строку?')) fetchDeleteRow('${esc(table)}', '${esc(id)}')">🗑️</button></div></td>`;
        html += `</tr>`;
      }
      html += `</tbody></table>`;
      html += `<div class="pagination">`;
      if (page > 1) html += `<a href="?page=${page - 1}&limit=${limit}&sort=${encodeURIComponent(orderCol)}&dir=${orderDir}&q=${encodeURIComponent(req.query.q || '')}">‹ Назад</a>`;
      for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) html += `<a href="?page=${i}&limit=${limit}&sort=${encodeURIComponent(orderCol)}&dir=${orderDir}&q=${encodeURIComponent(req.query.q || '')}" class="${i === page ? 'active' : ''}">${i}</a>`;
      if (page < totalPages) html += `<a href="?page=${page + 1}&limit=${limit}&sort=${encodeURIComponent(orderCol)}&dir=${orderDir}&q=${encodeURIComponent(req.query.q || '')}">Вперёд ›</a>`;
      html += `</div>`;
    }
res.send(shell(`Таблица ${table}`, html, `<script>
const colTypeMap = ${colTypeMapJson};
function pgInputType(dt){const d=String(dt).toLowerCase();if(d==='date')return 'date';if(d==='time'||d==='time with time zone')return 'time';if(d==='timestamp'||d==='timestamp with time zone')return 'datetime-local';return 'text';}
function pgFormatVal(val,dt){if(val==null||val==='')return'';const s=String(val);const d=String(dt).toLowerCase();if(d==='timestamp'||d==='timestamp with time zone')return s.replace(' ','T').substring(0,16);if(d==='date')return s.substring(0,10);if(d==='time'||d==='time with time zone')return s.substring(0,5);return s;}
function doSearch(){const q=document.getElementById('searchInput').value;const url=new URL(location.href);url.searchParams.set('q',q);url.searchParams.set('page','1');location.href=url.toString();}
function resetSearch(){const url=new URL(location.href);url.searchParams.delete('q');url.searchParams.set('page','1');location.href=url.toString();}
function sortTable(col){const url=new URL(location.href);const cur=url.searchParams.get('sort');const dir=url.searchParams.get('dir')==='asc'?'desc':'asc';url.searchParams.set('sort',col);url.searchParams.set('dir',dir);url.searchParams.set('page','1');location.href=url.toString();}
async function fetchDeleteRow(table,id){if(!confirm('Удалить строку?'))return;const r=await fetch('/api/table/'+encodeURIComponent(table)+'/row/'+encodeURIComponent(id),{method:'DELETE'});if(r.ok)location.reload();else alert(await r.text());}
async function startCellEdit(cell,table,pkId,col,curVal){if(cell.classList.contains('cell-edit'))return;cell.classList.add('cell-edit');const dt=cell.getAttribute('data-type')||'text';const type=pgInputType(dt);const formatted=pgFormatVal(curVal,dt);cell.innerHTML='<input type="'+type+'" value="'+escAttr(formatted)+'" autofocus>';const input=cell.querySelector('input');input.select();async function save(){const val=input.value;cell.classList.remove('cell-edit');cell.textContent='…';try{const r=await fetch('/api/table/'+encodeURIComponent(table)+'/row/'+encodeURIComponent(pkId),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({[col]:val===''?null:val})});if(r.ok){location.reload();}else{const t=await r.text();alert('Ошибка: '+t);cell.textContent=curVal;}}catch(e){alert(e.message);cell.textContent=curVal;}}input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();save();}});input.addEventListener('blur',save);}
function escAttr(s){return String(s??'').replace(/"/g,'"').replace(/'/g,'&#039;');}

// Column drag-and-drop reordering
document.addEventListener('DOMContentLoaded', () => {
  const tableEl = document.getElementById('dataTable');
  if (!tableEl) return;
  const ths = tableEl.querySelectorAll('thead th.draggable');
  let draggedTh = null;

  ths.forEach(th => {
    th.setAttribute('draggable', 'true');
    th.addEventListener('dragstart', e => {
      draggedTh = th;
      th.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    th.addEventListener('dragend', () => {
      th.classList.remove('dragging');
      draggedTh = null;
      document.querySelectorAll('th.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
    th.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (th !== draggedTh) th.classList.add('drag-over');
    });
    th.addEventListener('dragleave', () => th.classList.remove('drag-over'));
    th.addEventListener('drop', async e => {
      e.preventDefault();
      th.classList.remove('drag-over');
      if (!draggedTh || draggedTh === th) return;

      const allThs = Array.from(ths);
      const fromIdx = allThs.indexOf(draggedTh);
      const toIdx = allThs.indexOf(th);
      if (fromIdx === -1 || toIdx === -1) return;

      // Reorder DOM
      if (fromIdx < toIdx) th.after(draggedTh); else th.before(draggedTh);

      // Build new order from visible ths (excluding Actions column)
      const newOrder = Array.from(tableEl.querySelectorAll('thead th.draggable')).map(th => th.getAttribute('data-col'));

      // Save to server
      try {
        const resp = await fetch('/api/column-order/' + encodeURIComponent('${table}'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order: newOrder })
        });
        if (!resp.ok) throw new Error(await resp.text());
      } catch (err) {
        alert('Ошибка сохранения порядка: ' + err.message);
        location.reload(); // revert on error
      }
    });
  });
});
</script>`));
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div><a href="/browser">Назад</a>`));
  }
});

// ---------- Table: structure ----------
app.get('/table/:table/structure', async (req, res) => {
  const table = req.params.table;
  try {
    const cols = await pool.query(`SELECT column_name, data_type, character_maximum_length, is_nullable, column_default, ordinal_position FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table]);
    const descRes = await pool.query(`SELECT col.column_name, d.description FROM information_schema.columns col LEFT JOIN pg_description d ON d.objoid = ('public.'||$1)::regclass AND d.objsubid = col.ordinal_position WHERE col.table_schema='public' AND col.table_name=$1`, [table]);
    const colDesc = {}; for (const d of descRes.rows) colDesc[d.column_name] = d.description;
    if (cols.rows.length === 0) return res.status(404).send(shell('Ошибка', `<div class="error">Таблица не найдена</div>`));
    let html = `<h1><emoji>🏗️</emoji> Структура <code>${esc(table)}</code></h1>`;
    html += `<a href="/table/${encodeURIComponent(table)}" class="btn ghost small">↩ К данным</a>`;
    html += `<div class="card"><h2>Колонки</h2><table><thead><tr><th>#</th><th style="cursor:grab;" draggable="true">Колонка</th><th>Тип</th><th>Длина</th><th>NULL</th><th>DEFAULT</th><th>Описание</th><th>Действия</th></tr></thead><tbody>`;
    for (const c of cols.rows) {
      html += `<tr><td>${c.ordinal_position}</td><td data-col="${esc(c.column_name)}" ondblclick="editColDesc('${esc(table)}','${esc(c.column_name)}','${esc(colDesc[c.column_name] || '')}')">${esc(c.column_name)}${colDesc[c.column_name] ? `<span class="desc-badge" title="${esc(colDesc[c.column_name])}">📝</span>` : ''}</td><td><span class="mono">${esc(c.data_type)}</span></td><td>${c.character_maximum_length ?? '—'}</td><td>${c.is_nullable === 'YES' ? '✓' : '—'}</td><td><span class="mono">${c.column_default ?? '—'}</span></td><td>${esc(colDesc[c.column_name] || '—')}</td><td><a href="/table/${encodeURIComponent(table)}/drop-column/${encodeURIComponent(c.column_name)}" class="btn danger small" onclick="return confirm('Удалить колонку?')">🗑️</a></td></tr>`;
    }
    html += `</tbody></table></div>`;
    html += `<div class="card"><h2><emoji>➕</emoji> Добавить колонку</h2><form method="post" action="/table/${encodeURIComponent(table)}/add-column" class="card" style="border:none;box-shadow:none;padding:0;">
    <div class="row"><div class="form-group" style="width:auto;"><label>Имя</label><input type="text" name="col_name" required></div>
    <div class="form-group" style="width:auto;"><label>Тип</label><select name="col_type">`;
    for (const t of PG_TYPES) html += `<option value="${esc(t.name)}">${esc(t.label)}</option>`;
    html += `</select></div><div class="form-group" style="width:auto;"><label>Длина</label><input type="number" name="col_len" placeholder="255"></div><div class="form-group" style="width:auto;"><label>NOT NULL</label><input type="checkbox" name="col_nn" value="1"></div><div class="form-group" style="width:auto;"><label>DEFAULT</label><input type="text" name="col_def"></div><div class="form-group" style="width:auto;"><label>Описание</label><input type="text" name="col_desc" placeholder="Описание колонки"></div><button type="submit" class="btn primary small">Добавить</button></div></form></div>`;
    html += `<button class="btn reset small" onclick="location.href='/table/${encodeURIComponent(table)}/structure'">🔄 Сброс вида</button>`;
    res.send(shell(`Структура ${table}`, html, `<script>
function editColDesc(table,col,cur){const v=prompt('Описание колонки:',cur);if(v!==null){fetch('/api/table/'+encodeURIComponent(table)+'/column/'+encodeURIComponent(col)+'/description',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({description:v})}).then(r=>r.ok?location.reload():alert('Ошибка')).catch(e=>alert(e.message));}}
</script>`));
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});

// ---------- Table: indexes ----------
app.get('/table/:table/indexes', async (req, res) => {
  const table = req.params.table;
  try {
    const indexes = await pool.query(`SELECT indexname AS name, indexdef AS def FROM pg_indexes WHERE schemaname='public' AND tablename=$1 ORDER BY indexname`, [table]);
    let html = `<h1><emoji>🔍</emoji> Индексы <code>${esc(table)}</code></h1>`;
    html += `<a href="/table/${encodeURIComponent(table)}" class="btn ghost small">↩ К данным</a>`;
    if (indexes.rows.length === 0) html += `<p class="muted">Индексов нет.</p>`;
    else {
      html += `<table><thead><tr><th>Имя</th><th>Определение</th><th>Действие</th></tr></thead><tbody>`;
      for (const i of indexes.rows) html += `<tr><td><code>${esc(i.name)}</code></td><td><span class="mono">${esc(i.def)}</span></td><td><a href="/table/${encodeURIComponent(table)}/drop-index/${encodeURIComponent(i.name)}" class="btn danger small" onclick="return confirm('Удалить индекс?')">🗑️</a></td></tr>`;
      html += `</tbody></table>`;
    }
    html += `<div class="card"><h2>Создать индекс</h2><form method="post" action="/table/${encodeURIComponent(table)}/add-index">
    <div class="row"><div class="form-group" style="width:auto;"><label>Имя</label><input type="text" name="idx_name" required></div><div class="form-group" style="width:auto;"><label>Колонки</label><input type="text" name="idx_cols" placeholder="col1, col2" required></div><div class="form-group" style="width:auto;"><label>Уникальный</label><input type="checkbox" name="idx_unique" value="1"></div><button type="submit" class="btn primary small">Создать</button></div></form></div>`;
    res.send(shell(`Индексы ${table}`, html));
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});

// ---------- Table: constraints ----------
app.get('/table/:table/constraints', async (req, res) => {
  const table = req.params.table;
  try {
    const constraints = await pool.query(`SELECT conname AS name, contype AS type, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = $1::regclass ORDER BY conname`, [`public.${table}`]);
    const typeLabels = { p: 'PRIMARY KEY', f: 'FOREIGN KEY', u: 'UNIQUE', c: 'CHECK', t: 'TRIGGER', x: 'EXCLUSION' };
    let html = `<h1><emoji>🔒</emoji> Ограничения <code>${esc(table)}</code></h1>`;
    html += `<a href="/table/${encodeURIComponent(table)}" class="btn ghost small">↩ К данным</a>`;
    if (constraints.rows.length === 0) html += `<p class="muted">Ограничений нет.</p>`;
    else {
      html += `<table><thead><tr><th>Имя</th><th>Тип</th><th>Определение</th><th>Действие</th></tr></thead><tbody>`;
      for (const c of constraints.rows) html += `<tr><td><code>${esc(c.name)}</code></td><td><span class="badge">${typeLabels[c.type] || c.type}</span></td><td><span class="mono">${esc(c.def)}</span></td><td><a href="/table/${encodeURIComponent(table)}/drop-constraint/${encodeURIComponent(c.name)}" class="btn danger small" onclick="return confirm('Удалить ограничение?')">🗑️</a></td></tr>`;
      html += `</tbody></table>`;
    }
    res.send(shell(`Ограничения ${table}`, html));
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});

// ---------- Table: foreign keys ----------
app.get('/table/:table/foreign-keys', async (req, res) => {
  const table = req.params.table;
  try {
    const fks = await pool.query(`
      SELECT
        con.conname AS name,
        pg_get_constraintdef(con.oid) AS def,
        kcu.column_name AS col_name,
        ccu.table_name AS ref_table,
        ccu.column_name AS ref_column
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = con.conname AND kcu.table_schema = 'public'
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = con.conname AND ccu.table_schema = 'public'
      WHERE con.contype = 'f' AND rel.relname = $1
      ORDER BY con.conname
    `, [table]);
    const allTables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);
    const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY column_name`, [table]);
    let html = `<h1><emoji>🔗</emoji> Внешние ключи <code>${esc(table)}</code></h1>`;
    html += `<a href="/table/${encodeURIComponent(table)}" class="btn ghost small">↩ К данным</a>`;
    if (fks.rows.length === 0) html += `<p class="muted">Внешних ключей нет.</p>`;
    else {
      html += `<table><thead><tr><th>Имя</th><th>Колонка</th><th>Ссылается на</th><th>Определение</th><th>Действие</th></tr></thead><tbody>`;
      for (const f of fks.rows) {
        html += `<tr><td><code>${esc(f.name)}</code></td><td>${esc(f.col_name)}</td><td><a href="/table/${encodeURIComponent(f.ref_table)}">${esc(f.ref_table)}</a>.<code>${esc(f.ref_column)}</code></td><td><span class="mono">${esc(f.def)}</span></td><td><a href="/table/${encodeURIComponent(table)}/drop-foreign-key/${encodeURIComponent(f.name)}" class="btn danger small" onclick="return confirm('Удалить внешний ключ?')">🗑️</a></td></tr>`;
      }
      html += `</tbody></table>`;
    }
    html += `<div class="card"><h2>Создать внешний ключ</h2><form method="post" action="/table/${encodeURIComponent(table)}/add-foreign-key">
    <div class="row"><div class="form-group" style="width:auto;"><label>Имя ключа</label><input type="text" name="fk_name" required></div>
    <div class="form-group" style="width:auto;"><label>Колонка</label><select name="fk_col" required>`;
    for (const c of cols.rows) html += `<option value="${esc(c.column_name)}">${esc(c.column_name)}</option>`;
    html += `</select></div>
    <div class="form-group" style="width:auto;"><label>Таблица</label><select name="fk_ref_table" required>`;
    for (const t of allTables.rows) html += `<option value="${esc(t.table_name)}">${esc(t.table_name)}</option>`;
    html += `</select></div>
    <div class="form-group" style="width:auto;"><label>Колонка таблицы</label><select name="fk_ref_col" required><option value="">— выберите таблицу сначала —</option></select></div>
    <button type="submit" class="btn primary small">Создать</button></form></div>`;
    res.send(shell(`Внешние ключи ${table}`, html));
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});

app.post('/table/:table/add-foreign-key', async (req, res) => {
  const table = req.params.table;
  const { fk_name, fk_col, fk_ref_table, fk_ref_col } = req.body;
  if (!fk_name || !fk_col || !fk_ref_table || !fk_ref_col) return res.send(shell('Ошибка', `<div class="error">Заполните все поля</div>`));
  try {
    await pool.query(`ALTER TABLE ${ident(table)} ADD CONSTRAINT ${ident(fk_name)} FOREIGN KEY (${ident(fk_col)}) REFERENCES ${ident(fk_ref_table)}(${ident(fk_ref_col)})`);
    res.redirect(`/table/${encodeURIComponent(table)}/foreign-keys`);
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});

app.post('/table/:table/drop-foreign-key/:name', async (req, res) => {
  const table = req.params.table;
  const name = req.params.name;
  try {
    await pool.query(`ALTER TABLE ${ident(table)} DROP CONSTRAINT ${ident(name)}`);
    res.redirect(`/table/${encodeURIComponent(table)}/foreign-keys`);
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});

// ---------- Table: DDL ----------
app.get('/table/:table/ddl', async (req, res) => {
  const table = req.params.table;
  try {
    const cols = await pool.query(`SELECT column_name, data_type, character_maximum_length, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table]);
    let ddl = `CREATE TABLE ${ident(table)} (\n`;
    ddl += cols.rows.map((c, i) => {
      let line = `  ${ident(c.column_name)} ${c.data_type.toUpperCase()}`;
      if (c.character_maximum_length) line += `(${c.character_maximum_length})`;
      if (c.is_nullable === 'NO') line += ' NOT NULL';
      if (c.column_default) line += ` DEFAULT ${c.column_default}`;
      return i < cols.rows.length - 1 ? line + ',' : line;
    }).join(',\n');
    ddl += `\n);`;
    let html = `<h1><emoji>📄</emoji> DDL <code>${esc(table)}</code></h1>`;
    html += `<a href="/table/${encodeURIComponent(table)}" class="btn ghost small">↩ К данным</a>`;
    html += `<div class="card"><pre class="sql mono">${esc(ddl)}</pre><button class="btn primary small" onclick="copyDdl()">📋 Копировать</button> <button class="btn reset small">🔄 Сброс</button></div>`;
    res.send(shell(`DDL ${table}`, html, `<script>function copyDdl(){navigator.clipboard.writeText(document.querySelector('.mono').textContent).then(()=>alert('Скопировано'));</script>`));
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});

// ---------- Table: new row ----------
app.get('/table/:table/new', async (req, res) => {
  const table = req.params.table;
  try {
    const cols = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table]);
    if (cols.rows.length === 0) return res.status(404).send(shell('Ошибка', `<div class="error">Таблица не найдена</div>`));
    let html = `<h1><emoji>➕</emoji> Новая строка в <code>${esc(table)}</code></h1>`;
    html += `<a href="/table/${encodeURIComponent(table)}" class="btn ghost small">↩ К данным</a>`;
    html += `<form method="post" action="/table/${encodeURIComponent(table)}/new" class="card">`;
    for (const c of cols.rows) {
      html += `<div class="form-group"><label>${esc(c.column_name)} (${esc(c.data_type)})</label>${inputHtml('col_' + c.column_name, c.data_type, '')}</div>`;
    }
    html += `<button type="submit" class="btn primary small">Создать</button> <a href="/table/${encodeURIComponent(table)}" class="btn ghost small">Отмена</a></form>`;
    res.send(shell(`Новая строка ${table}`, html));
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});
app.post('/table/:table/new', async (req, res) => {
  const table = req.params.table;
  const keys = Object.keys(req.body).filter(k => k.startsWith('col_')).map(k => k.slice(4));
  if (keys.length === 0) return res.send(shell('Ошибка', `<div class="error">Нет данных</div>`));
  const cols = keys.map(k => ident(k)).join(', ');
  const vals = keys.map((_, i) => `$${i + 1}`).join(', ');
  const params = keys.map(k => req.body[`col_${k}`] === '' ? null : req.body[`col_${k}`]);
  try {
    await pool.query(`INSERT INTO ${ident(table)} (${cols}) VALUES (${vals})`, params);
    res.redirect(`/table/${encodeURIComponent(table)}`);
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});

// ---------- Table: edit row ----------
app.get('/table/:table/edit/:id', async (req, res) => {
  const table = req.params.table;
  const id = req.params.id;
  try {
    const cols = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table]);
    const pk = cols.rows[0].column_name;
    const { rows } = await pool.query(`SELECT * FROM ${ident(table)} WHERE ${ident(pk)} = $1`, [id]);
    if (rows.length === 0) return res.status(404).send(shell('Ошибка', `<div class="error">Строка не найдена</div>`));
    const row = rows[0];
    let html = `<h1><emoji>✏️</emoji> Редактирование строки в <code>${esc(table)}</code></h1>`;
    html += `<a href="/table/${encodeURIComponent(table)}" class="btn ghost small">↩ К данным</a>`;
    html += `<form method="post" action="/table/${encodeURIComponent(table)}/edit/${encodeURIComponent(id)}" class="card">`;
    for (const c of cols.rows) {
      const val = row[c.column_name] ?? '';
      html += `<div class="form-group"><label>${esc(c.column_name)} (${esc(c.data_type)})${c.column_name === pk ? ' (PK)' : ''}</label>${inputHtml('col_' + c.column_name, c.data_type, val)}</div>`;
    }
    html += `<button type="submit" class="btn primary small">Сохранить</button> <a href="/table/${encodeURIComponent(table)}" class="btn ghost small">Отмена</a> <button class="btn reset small" type="button" onclick="location.href='/table/${encodeURIComponent(table)}'">🔄 Сброс</button></form>`;
    res.send(shell(`Редактирование ${table}`, html));
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});
app.post('/table/:table/edit/:id', async (req, res) => {
  const table = req.params.table;
  const id = req.params.id;
  const keys = Object.keys(req.body).filter(k => k.startsWith('col_')).map(k => k.slice(4));
  if (keys.length === 0) return res.send(shell('Ошибка', `<div class="error">Нет данных</div>`));
  const setClause = keys.map((k, i) => `${ident(k)} = $${i + 1}`).join(', ');
  const params = keys.map(k => req.body[`col_${k}`] === '' ? null : req.body[`col_${k}`]);
  try {
    const colsRes = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position LIMIT 1`, [table]);
    const pk = colsRes.rows[0].column_name;
    await pool.query(`UPDATE ${ident(table)} SET ${setClause} WHERE ${ident(pk)} = $${keys.length + 1}`, [...params, id]);
    res.redirect(`/table/${encodeURIComponent(table)}`);
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});

// ---------- Create table ----------
app.get('/create-table', (req, res) => {
  let html = `<h1><emoji>🆕</emoji> Новая таблица</h1><form method="post" action="/create-table" class="card">
    <div class="form-group"><label>Имя таблицы</label><input type="text" name="table_name" required></div>
    <h3 style="margin-top:1rem;">Колонки</h3>`;
  for (let i = 0; i < 10; i++) {
    html += `<div class="row" style="margin-bottom:0.5rem;"><div class="form-group" style="width:auto;"><label>Имя ${i + 1}</label><input type="text" name="col_name_${i}"></div><div class="form-group" style="width:auto;"><label>Тип</label><select name="col_type_${i}">`;
    for (const t of PG_TYPES) html += `<option value="${esc(t.name)}">${esc(t.label)}</option>`;
    html += `</select></div><div class="form-group" style="width:auto;"><label>Длина</label><input type="number" name="col_len_${i}" placeholder="255"></div><div class="form-group" style="width:auto;"><label>PK</label><input type="checkbox" name="col_pk_${i}" value="1"></div><div class="form-group" style="width:auto;"><label>NOT NULL</label><input type="checkbox" name="col_nn_${i}" value="1"></div></div>`;
  }
  html += `<button type="submit" class="btn primary small">Создать таблицу</button> <a href="/browser" class="btn ghost small">Назад</a> <button class="btn reset small" type="button" onclick="location.href='/create-table'">🔄 Сброс</button></form>`;
  res.send(shell('Новая таблица', html));
});
app.post('/create-table', async (req, res) => {
  const { table_name } = req.body;
  if (!table_name) return res.send(shell('Ошибка', `<div class="error">Укажите имя таблицы</div>`));
  const cols = [];
  for (let i = 0; i < 10; i++) {
    const n = req.body[`col_name_${i}`];
    if (!n) continue;
    let t = req.body[`col_type_${i}`] || 'text';
    let def = `${ident(n)} ${t.toUpperCase()}`;
    if (t === 'varchar' && req.body[`col_len_${i}`]) def += `(${req.body[`col_len_${i}`]})`;
    if (req.body[`col_pk_${i}`]) def += ' PRIMARY KEY';
    if (req.body[`col_nn_${i}`]) def += ' NOT NULL';
    cols.push(def);
  }
  if (cols.length === 0) return res.send(shell('Ошибка', `<div class="error">Добавьте хотя бы одну колонку</div>`));
  try {
    await pool.query(`CREATE TABLE ${ident(table_name)} (${cols.join(', ')})`);
    res.redirect(`/table/${encodeURIComponent(table_name)}`);
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});

// ---------- Drop table ----------
app.post('/table/:table/drop', async (req, res) => {
  const table = req.params.table;
  try {
    await pool.query(`DROP TABLE ${ident(table)} CASCADE`);
    res.redirect('/browser');
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});

// ---------- Rename table ----------
app.post('/table/:table/rename', async (req, res) => {
  const table = req.params.table;
  const { new_name } = req.body;
  if (!new_name) return res.send(shell('Ошибка', `<div class="error">Укажите новое имя таблицы</div>`));
  try {
    await pool.query(`ALTER TABLE ${ident(table)} RENAME TO ${ident(new_name)}`);
    res.redirect(`/table/${encodeURIComponent(new_name)}`);
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});

// ---------- Add column ----------
app.post('/table/:table/add-column', async (req, res) => {
  const table = req.params.table;
  const { col_name, col_type, col_len, col_nn, col_def, col_desc } = req.body;
  if (!col_name) return res.send(shell('Ошибка', `<div class="error">Укажите имя колонки</div>`));
  let sql = `ALTER TABLE ${ident(table)} ADD COLUMN ${ident(col_name)} ${col_type.toUpperCase()}`;
  if (col_type === 'varchar' && col_len) sql += `(${col_len})`;
  if (col_nn) sql += ' NOT NULL';
  if (col_def) sql += ` DEFAULT ${col_def}`;
  try {
    await pool.query(sql);
    if (col_desc) await pool.query(`COMMENT ON COLUMN ${ident(table)}.${ident(col_name)} IS $1`, [col_desc]);
    res.redirect(`/table/${encodeURIComponent(table)}/structure`);
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});

// ---------- Drop column ----------
app.post('/table/:table/drop-column/:col', async (req, res) => {
  const table = req.params.table;
  const col = req.params.col;
  try {
    await pool.query(`ALTER TABLE ${ident(table)} DROP COLUMN ${ident(col)}`);
    res.redirect(`/table/${encodeURIComponent(table)}/structure`);
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});

// ---------- Create index ----------
app.post('/table/:table/add-index', async (req, res) => {
  const table = req.params.table;
  const { idx_name, idx_cols, idx_unique } = req.body;
  if (!idx_name || !idx_cols) return res.send(shell('Ошибка', `<div class="error">Укажите имя и колонки</div>`));
  const cols = idx_cols.split(',').map(c => ident(c.trim())).join(', ');
  let sql = `CREATE ${idx_unique ? 'UNIQUE ' : ''}INDEX ${ident(idx_name)} ON ${ident(table)} (${cols})`;
  try {
    await pool.query(sql);
    res.redirect(`/table/${encodeURIComponent(table)}/indexes`);
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});

// ---------- Drop index ----------
app.post('/table/:table/drop-index/:idx', async (req, res) => {
  const table = req.params.table;
  const idx = req.params.idx;
  try {
    await pool.query(`DROP INDEX ${ident(idx)}`);
    res.redirect(`/table/${encodeURIComponent(table)}/indexes`);
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});

// ---------- Drop constraint ----------
app.post('/table/:table/drop-constraint/:con', async (req, res) => {
  const table = req.params.table;
  const con = req.params.con;
  try {
    await pool.query(`ALTER TABLE ${ident(table)} DROP CONSTRAINT ${ident(con)}`);
    res.redirect(`/table/${encodeURIComponent(table)}/constraints`);
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});

// ---------- Views ----------
app.get('/view/:view', async (req, res) => {
  const view = req.params.view;
  try {
    const def = await pool.query(`SELECT pg_get_viewdef($1::regclass, true) AS ddl`, [view]);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
    const offset = (page - 1) * limit;
    const [{ rows: cnt }] = await pool.query(`SELECT count(*) AS c FROM ${ident(view)}`);
    const rows = await pool.query(`SELECT * FROM ${ident(view)} LIMIT $1 OFFSET $2`, [limit, offset]);
    const total = parseInt(cnt[0].c, 10);
    let html = `<h1><emoji>👁️</emoji> Представление <code>${esc(view)}</code></h1>`;
    html += `<a href="/browser" class="btn ghost small">↩ Браузер</a>`;
    html += `<h3>Определение</h3><pre class="sql mono">${esc(def.rows[0].ddl)}</pre>`;
    html += `<p><span class="badge">${total}</span> строк <span class="badge">стр. ${page}/${Math.ceil(total / limit) || 1}</span></p>`;
    if (rows.rows.length) {
      const cols = Object.keys(rows.rows[0]);
      html += `<table><thead><tr>`;
      for (const c of cols) html += `<th>${esc(c)}</th>`;
      html += `<th>Режим</th></tr></thead><tbody>`;
      for (const row of rows.rows) {
        html += `<tr>`;
        for (const c of cols) html += `<td><span class="mono">${row[c] === null ? '<em class="null">null</em>' : esc(String(row[c]))}</span></td>`;
        html += `<td>только чтение</td></tr>`;
      }
      html += `</tbody></table>`;
    }
    res.send(shell(`Представление ${view}`, html));
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});

// ---------- Drop view ----------
app.post('/view/:view/drop', async (req, res) => {
  const view = req.params.view;
  try {
    await pool.query(`DROP VIEW ${ident(view)}`);
    res.redirect('/browser');
  } catch (err) {
    res.status(500).send(shell('Ошибка', `<div class="error">${esc(err.message)}</div>`));
  }
});

// ---------- SQL editor ----------
app.get('/query', async (req, res) => {
  const q = req.query.q || '';
  const templates = store.templates || [];
  let html = `<h1><emoji>🔍</emoji> SQL-редактор</h1>`;
  html += `<div class="templates"><label>Шаблон: <select id="tplSelect" onchange="applyTpl()"><option value="">— выберите шаблон —</option>`;
  for (const t of templates) html += `<option value="${esc(t.name)}">${esc(t.name)}</option>`;
  html += `</select> <button class="btn small" onclick="saveTpl()">💾 Сохранить текущий как шаблон</button> <button class="btn reset small" onclick="clearTpls()">🗑️ Очистить шаблоны</button></label></div>`;
  html += `<form method="get" action="/query" class="card"><textarea name="q" class="sql" placeholder="SELECT * FROM candles LIMIT 50;">${esc(q)}</textarea><br><button type="submit" class="btn primary small">▶ Выполнить (Ctrl+Enter)</button> <a href="/" class="btn ghost small">Дашборд</a> <button class="btn reset small" type="button" onclick="clearSql()">🔄 Сброс</button></form>`;
  if (q) {
    const start = Date.now();
    try {
      const { rows, rowCount, fields, command } = await pool.query(q);
      const durationMs = Date.now() - start;
      store.history = store.history || [];
      store.history.unshift({ time: new Date().toISOString(), sql: q, durationMs, status: 'OK' });
      if (store.history.length > 100) store.history.length = 100;
      saveStore();
      html += `<div class="ok">Команда: ${command} &middot; Строк: ${rowCount ?? '—'} &middot; Время: ${durationMs} мс</div>`;
      if (fields && fields.length && rows.length) {
        const cols = fields.map(f => f.name);
        html += `<table><thead><tr>`;
        for (const c of cols) html += `<th>${esc(c)}</th>`;
        html += `</tr></thead><tbody>`;
        for (const row of rows) {
          html += `<tr>`;
          for (const c of cols) {
            const v = row[c];
            html += `<td><span class="mono">${v === null ? '<em class="null">null</em>' : esc(String(v))}</span></td>`;
          }
          html += `</tr>`;
        }
        html += `</tbody></table>`;
      }
    } catch (err) {
      const durationMs = Date.now() - start;
      store.history = store.history || [];
      store.history.unshift({ time: new Date().toISOString(), sql: q, durationMs, status: 'ERR' });
      if (store.history.length > 100) store.history.length = 100;
      saveStore();
      html += `<div class="error">${esc(err.message)} &middot; ${durationMs} мс</div>`;
    }
  }
  html += `<script>
function applyTpl(){const s=document.getElementById('tplSelect');if(!s.value)return;fetch('/api/templates').then(r=>r.json()).then(ts=>{const t=ts.find(x=>x.name===s.value);if(t){document.querySelector('textarea[name=q]').value=t.sql;document.querySelector('form').requestSubmit?document.querySelector('form').requestSubmit():null;}});}
function saveTpl(){const name=prompt('Имя шаблона:');if(!name)return;const sql=document.querySelector('textarea[name=q]').value;fetch('/api/templates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,sql})}).then(r=>r.ok?location.reload():alert('Ошибка')).catch(e=>alert(e.message));}
function clearTpls(){if(confirm('Удалить все шаблоны?')){fetch('/api/templates',{method:'DELETE'}).then(r=>r.ok?location.reload():alert('Ошибка')).catch(e=>alert(e.message));}}
function clearSql(){document.querySelector('textarea[name=q]').value='';}
function fillSql(sql){document.querySelector('textarea[name=q]').value=decodeURIComponent(sql.replace(/&#39;/g,"'"));}
</script>`;
  res.send(shell('SQL-редактор', html));
});

// ---------- Import ----------
app.get('/import', (req, res) => {
  let html = `<h1><emoji>📥</emoji> Импорт данных</h1>`;
  html += `<div class="card"><h2>Импорт CSV/JSON в таблицу</h2><form method="post" action="/import" enctype="multipart/form-data">
    <div class="form-group"><label>Таблица</label><input type="text" name="table" required placeholder="имя таблицы"></div>
    <div class="form-group"><label>Файл (.csv или .json)</label><input type="file" name="file" accept=".csv,.json" required></div>
    <div class="form-group"><label>Разделитель CSV</label><input type="text" name="delimiter" value="," maxlength="1" style="width:40px;"></div>
    <button type="submit" class="btn primary small">Импортировать</button> <button class="btn reset small" type="button" onclick="location.href='/import'">🔄 Сброс</button>
  </form></div>`;
  html += `<div class="card"><h2><emoji>📋</emoji> Пример CSV</h2><pre class="mono">name,email,created_at\nИван,ivan@test.ru,2024-01-01\nМария,maria@test.ru,2024-01-02</pre></div>`;
  res.send(shell('Импорт данных', html));
});
app.post('/import', upload.single('file'), async (req, res) => {
  const { table, delimiter = ',' } = req.body;
  const file = req.file;
  if (!table || !file) return res.send(shell('Ошибка', `<div class="error">Укажите таблицу и файл</div>`));
  const content = fs.readFileSync(file.path, 'utf8');
  try {
    let rows;
    if (file.originalname.endsWith('.json')) {
      rows = JSON.parse(content);
      if (!Array.isArray(rows)) rows = [rows];
    } else {
      const lines = content.trim().split('\n');
      const headers = lines[0].split(delimiter).map(h => h.trim());
      rows = lines.slice(1).map(line => {
        const vals = line.split(delimiter);
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] !== undefined ? vals[i] : null; });
        return obj;
      });
    }
    if (rows.length === 0) return res.send(shell('Ошибка', `<div class="error">Нет данных для импорта</div>`));
    const cols = Object.keys(rows[0]);
    let inserted = 0;
    for (const row of rows) {
      const keys = cols.filter(c => row[c] !== undefined && row[c] !== null);
      if (keys.length === 0) continue;
      const cIdent = keys.map(k => ident(k)).join(', ');
      const vals = keys.map((_, i) => `$${i + 1}`).join(', ');
      const params = keys.map(k => row[k]);
      await pool.query(`INSERT INTO ${ident(table)} (${cIdent}) VALUES (${vals})`, params);
      inserted++;
    }
    fs.unlinkSync(file.path);
    res.send(shell('Импорт завершён', `<div class="ok">Импортировано строк: ${inserted} из ${rows.length} в таблицу <code>${esc(table)}</code></div><a href="/table/${encodeURIComponent(table)}">Открыть таблицу</a> <a href="/import">Ещё импорт</a>`));
  } catch (err) {
    res.status(500).send(shell('Ошибка импорта', `<div class="error">${esc(err.message)}</div>`));
  }
});

// ============================================================================
// API endpoints
// ============================================================================

// Table row CRUD (inline edit)
app.delete('/api/table/:table/row/:id', async (req, res) => {
  const table = req.params.table;
  const id = req.params.id;
  try {
    const colsRes = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position LIMIT 1`, [table]);
    const pk = colsRes.rows[0].column_name;
    await pool.query(`DELETE FROM ${ident(table)} WHERE ${ident(pk)} = $1`, [id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/table/:table/row/:id', async (req, res) => {
  const table = req.params.table;
  const id = req.params.id;
  const updates = req.body;
  const keys = Object.keys(updates);
  if (keys.length === 0) return res.status(400).json({ error: 'Нет полей для обновления' });
  const setClause = keys.map((k, i) => `${ident(k)} = $${i + 1}`).join(', ');
  const params = keys.map(k => updates[k]);
  try {
    const colsRes = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position LIMIT 1`, [table]);
    const pk = colsRes.rows[0].column_name;
    await pool.query(`UPDATE ${ident(table)} SET ${setClause} WHERE ${ident(pk)} = $${keys.length + 1}`, [...params, id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Column description
app.post('/api/table/:table/column/:col/description', async (req, res) => {
  const { table, col } = req.params;
  const { description } = req.body;
  try {
    // drop existing comment
    try { await pool.query(`COMMENT ON COLUMN ${ident(table)}.${ident(col)} IS NULL`); } catch (e) {}
    if (description && description.trim()) {
      await pool.query(`COMMENT ON COLUMN ${ident(table)}.${ident(col)} IS $1`, [description]);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Templates
app.get('/api/templates', async (req, res) => { res.json(store.templates || []); });
app.post('/api/templates', async (req, res) => {
  const { name, sql } = req.body;
  if (!name || !sql) return res.status(400).json({ error: 'name and sql required' });
  store.templates = store.templates || [];
  store.templates = store.templates.filter(t => t.name !== name);
  store.templates.push({ name, sql });
  saveStore();
  res.json({ ok: true });
});
app.delete('/api/templates', async (req, res) => {
  store.templates = [];
  saveStore();
  res.json({ ok: true });
});

// Stats
app.get('/api/stats', async (req, res) => {
  try { res.json(await queryStats()); } catch (err) { res.status(500).json({ error: err.message }); }
});

// History
app.get('/api/history', async (req, res) => { res.json((store.history || []).slice(0, 50)); });
app.delete('/api/history', async (req, res) => {
  store.history = [];
  saveStore();
  res.json({ ok: true });
});

// Column order API
app.get('/api/column-order/:table', async (req, res) => {
  const table = req.params.table;
  const order = store.columnOrder && store.columnOrder[table] ? store.columnOrder[table] : [];
  res.json({ order });
});

app.post('/api/column-order/:table', async (req, res) => {
  const table = req.params.table;
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be array' });
  store.columnOrder = store.columnOrder || {};
  store.columnOrder[table] = order;
  saveStore();
  res.json({ ok: true });
});

// ---------- Static ----------
app.get('/style.css', (req, res) => {
  res.type('text/css').send(`
:root{--bg:#1e1e1e;--card:#252526;--text:#cccccc;--muted:#858585;--accent:#007acc;--accent-hover:#0067b5;--border:#333333;--success:#4ec9b0;--danger:#f44747;--warning:#dcdcaa;--input:#3c3c3c;--input-border:#464647;--table-bg:#1e1e1e;--table-hover:#2d2d2d;}
[data-theme="light"]{--bg:#ffffff;--card:#f3f3f3;--text:#000000;--muted:#6e6e6e;--accent:#007acc;--accent-hover:#0067b5;--border:#cccccc;--success:#117a01;--danger:#d13438;--warning:#986603;--input:#ffffff;--input-border:#a9a9a9;--table-bg:#ffffff;--table-hover:#f3f3f3;}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.topbar { background: var(--card); border-bottom: 1px solid var(--border); padding: 0.75rem 1.5rem; display: flex; align-items: center; gap: 1rem; position: sticky; top: 0; z-index: 100; }
.brand { font-size: 1.25rem; font-weight: 800; color: var(--text); display: flex; align-items: center; gap: 0.5rem; }
.brand emoji { font-size: 1.5rem; }
.nav { display: flex; align-items: center; gap: 0.5rem; margin-left: auto; }
.nav a { padding: 0.4rem 0.8rem; border-radius: 6px; font-size: 0.85rem; color: var(--text); background: var(--bg); border: 1px solid var(--border); }
.nav a:hover { background: var(--accent); color: #fff; }
.theme-btn { padding: 0.35rem 0.75rem; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer; font-size: 0.85rem; margin-left: 0.5rem; }
.theme-btn:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
.container { max-width: 1400px; margin: 0 auto; padding: 1.5rem; }
h1 { font-size: 1.5rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; color: var(--text); }
h2 { font-size: 1.15rem; margin: 1.25rem 0 0.75rem; color: var(--accent); border-bottom: 1px solid var(--border); padding-bottom: 0.3rem; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem; margin-bottom: 1rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
.stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
.stat { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; display: flex; align-items: center; gap: 0.75rem; }
.stat .v { font-size: 1.5rem; font-weight: 800; color: var(--accent); }
.stat .l { font-size: 0.8rem; color: var(--muted); }
.stat .icon { font-size: 1.5rem; }
table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; background: var(--table-bg); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
th, td { border: 1px solid var(--border); padding: 0.6rem 0.75rem; text-align: left; font-size: 0.85rem; }
th { background: var(--card); color: var(--muted); font-weight: 700; position: sticky; top: 0; z-index: 3; white-space: nowrap; cursor: grab; user-select: none; }
th:hover { background: var(--table-hover); }
td { vertical-align: top; }
tr:nth-child(even) td { background: var(--table-hover); }
.mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.82rem; }
.null { color: var(--muted); font-style: italic; }
.btn { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.45rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); background: var(--card); color: var(--text); cursor: pointer; font-size: 0.85rem; transition: all 0.2s; }
.btn:hover { border-color: var(--accent); color: var(--accent); background: var(--table-hover); }
.btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn.primary:hover { background: var(--accent-hover); }
.btn.danger { background: var(--danger); color: #fff; border-color: var(--danger); }
.btn.danger:hover { opacity: 0.9; }
.btn.small { padding: 0.25rem 0.55rem; font-size: 0.78rem; }
.btn.reset { background: transparent; color: var(--warning); border-color: var(--warning); }
.btn.reset:hover { background: var(--warning); color: #fff; }
.btn.ghost { background: transparent; border: none; color: var(--muted); padding: 0.35rem; }
.btn.ghost:hover { color: var(--text); background: var(--table-hover); border-radius: 4px; }
.form-group { margin-bottom: 0.75rem; }
.form-group label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--muted); margin-bottom: 0.25rem; }
.form-group input, .form-group select, .form-group textarea { width: 100%; max-width: 500px; padding: 0.5rem; border: 1px solid var(--input-border); border-radius: 6px; background: var(--input); color: var(--text); font-size: 0.85rem; }
.form-group input:focus, .form-group select:focus, .form-group textarea:focus { outline: none; border-color: var(--accent); }
.row { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: end; }
.ok { background: rgba(34,197,94,0.15); border: 1px solid var(--success); color: var(--success); padding: 0.75rem; border-radius: 6px; margin-top: 0.75rem; font-size: 0.85rem; }
.error { background: rgba(239,68,68,0.15); border: 1px solid var(--danger); color: var(--danger); padding: 0.75rem; border-radius: 6px; margin-top: 0.75rem; font-size: 0.85rem; }
.pagination { display: flex; gap: 0.3rem; margin-top: 0.75rem; align-items: center; }
.pagination a { padding: 0.35rem 0.65rem; border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 0.85rem; background: var(--card); }
.pagination a.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.badge { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.15rem 0.5rem; border-radius: 999px; font-size: 0.75rem; background: var(--card); border: 1px solid var(--border); color: var(--muted); }
.badge.accent { background: var(--accent); color: #fff; border-color: var(--accent); }
textarea.sql { width: 100%; min-height: 220px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.85rem; padding: 0.75rem; border: 1px solid var(--input-border); border-radius: 8px; background: var(--input); color: var(--text); resize: vertical; }
textarea.sql:focus { outline: none; border-color: var(--accent); }
.templates { margin-bottom: 1rem; }
.templates select { padding: 0.5rem; border-radius: 6px; border: 1px solid var(--input-border); background: var(--input); color: var(--text); font-size: 0.85rem; }
.draggable { cursor: grab; user-select: none; }
.draggable:active { cursor: grabbing; }
.desc-badge { font-size: 0.72rem; color: var(--muted); margin-left: 0.4rem; border: 1px solid var(--border); padding: 0.1rem 0.35rem; border-radius: 4px; background: var(--input); }
.import-zone { border: 2px dashed var(--border); border-radius: 8px; padding: 2rem; text-align: center; background: var(--card); cursor: pointer; }
.import-zone:hover { border-color: var(--accent); background: var(--table-hover); }
.nav-tabs { display: flex; gap: 0.25rem; margin-bottom: 1rem; border-bottom: 1px solid var(--border); overflow-x: auto; }
.nav-tabs a { padding: 0.5rem 1rem; border: 1px solid var(--border); border-bottom: none; border-radius: 6px 6px 0 0; color: var(--muted); font-size: 0.85rem; background: var(--card); }
.nav-tabs a.active { color: var(--text); border-color: var(--border); border-bottom: 1px solid var(--card); background: var(--bg); }
@media (max-width: 768px) { .container { padding: 1rem; } .row { flex-direction: column; } table { font-size: 0.75rem; } th, td { padding: 0.4rem 0.5rem; } }
`);
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`🌐 ${APP_NAME} запущен: http://localhost:${PORT}`);
  console.log(`📦 PostgreSQL: ${connectionString.replace(/:[^:@]*@/, ':***@')}`);
});
