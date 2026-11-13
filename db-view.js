require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_SCHEMA = process.env.DB_VIEW_SCHEMA || 'public';

const connectionString = process.env.DB || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ Укажите строку подключения в переменной окружения DB или DATABASE_URL');
  process.exit(1);
}
const pool = new Pool({ connectionString });

function ident(name) { return '"' + String(name).replace(/"/g, '""') + '"'; }
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function toQuery(obj) {
  return Object.entries(obj).filter(([_,v]) => v !== '' && v != null).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const style = `
<style>
  body { font-family: system-ui,-apple-system,Segoe UI,Roboto,sans-serif; margin: 0; background: #f3f4f6; color: #111827; }
  .topbar { background: #1f2937; color: #fff; padding: 0.75rem 2rem; display: flex; gap: 1.5rem; align-items: center; }
  .topbar a { color: #93c5fd; text-decoration: none; font-weight: 600; }
  .topbar a:hover { color: #fff; }
  .topbar .brand { font-size: 1.15rem; font-weight: 800; color: #fff; }
  .container { max-width: 1400px; margin: 0 auto; padding: 1.5rem 2rem; }
  h1 { margin: 0 0 1rem 0; font-size: 1.4rem; }
  h2 { margin: 1.5rem 0 0.75rem 0; font-size: 1.15rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.25rem; }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 1rem; margin-bottom: 1rem; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
  .stat { background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 0.75rem; }
  .stat .v { font-size: 1.5rem; font-weight: 700; color: #2563eb; }
  .stat .l { font-size: 0.8rem; color: #6b7280; }
  table { border-collapse: collapse; width: 100%; margin-top: 0.75rem; }
  th, td { border: 1px solid #e5e7eb; padding: 0.5rem 0.7rem; text-align: left; font-size: 0.85rem; }
  th { background: #f9fafb; font-weight: 600; position: sticky; top: 0; z-index: 2; }
  tr:nth-child(even) td { background: #fcfcfd; }
  .mono { font-family: ui-monospace,SFMono-Regular,Consolas,monospace; font-size: 0.82rem; }
  .btn { display: inline-block; padding: 0.35rem 0.75rem; background: #2563eb; color: #fff; border-radius: 4px; cursor: pointer; border: none; font-size: 0.85rem; text-decoration: none; }
  .btn:hover { background: #1d4ed8; }
  .btn-outline { background: transparent; color: #2563eb; border: 1px solid #2563eb; }
  .btn-danger { background: #dc2626; color: #fff; }
  .btn-sm { padding: 0.2rem 0.5rem; font-size: 0.78rem; }
  .badge { display: inline-block; padding: 0.1rem 0.45rem; background: #e5e7eb; border-radius: 999px; font-size: 0.75rem; color: #374151; margin-right: 0.3rem; }
  .form-group { margin-bottom: 0.6rem; }
  .form-group label { display: block; font-size: 0.8rem; font-weight: 600; color: #374151; margin-bottom: 0.2rem; }
  .form-group input, .form-group select, .form-group textarea { width: 100%; max-width: 400px; padding: 0.4rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.85rem; box-sizing: border-box; }
  .row { display: flex; gap: 1rem; flex-wrap: wrap; align-items: end; }
  .muted { color: #6b7280; font-size: 0.8rem; }
  .ok { color: #166534; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 0.6rem; border-radius: 4px; margin-top: 0.75rem; }
  .error { color: #dc2626; background: #fef2f2; border: 1px solid #fee2e2; padding: 0.6rem; border-radius: 4px; margin-top: 0.75rem; }
  .pagination { margin-top: 0.75rem; display: flex; gap: 0.3rem; align-items: center; }
  .pagination a { padding: 0.25rem 0.55rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.85rem; text-decoration: none; color: #1f2937; }
  .pagination a.active { background: #2563eb; color: #fff; border-color: #2563eb; }
  details.filter-details { border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 0.75rem; background: #fff; }
  details.filter-details summary { cursor: pointer; font-weight: 600; color: #2563eb; padding: 0.5rem 0.75rem; background: #f9fafb; border-bottom: 1px solid #e5e7eb; outline: none; list-style: none; }
  details.filter-details summary::after { content: ' ▾'; font-size: 0.8rem; }
  details.filter-details[open] summary::after { content: ' ▴'; }
  pre.sql { background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 4px; padding: 0.75rem; font-family: ui-monospace,SFMono-Regular,Consolas,monospace; font-size: 0.82rem; overflow: auto; max-height: 400px; }
  .nav-tabs { display: flex; gap: 0.5rem; margin-bottom: 1rem; border-bottom: 1px solid #e5e7eb; }
  .nav-tabs a { padding: 0.5rem 0.9rem; text-decoration: none; color: #4b5563; font-size: 0.85rem; border-bottom: 2px solid transparent; }
  .nav-tabs a.active { color: #2563eb; border-bottom-color: #2563eb; font-weight: 600; }
  .object-list { list-style: none; padding: 0; margin: 0; }
  .object-list li { padding: 0.45rem 0.75rem; border-bottom: 1px solid #f3f4f6; display: flex; justify-content: space-between; align-items: center; }
  .object-list li:last-child { border-bottom: none; }
  .object-list a { color: #2563eb; text-decoration: none; }
  .object-list a:hover { text-decoration: underline; }
</style>`;

function htmlHead(title) {
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(title)} | phpPgAdmin-like</title>${style}</head><body>
  <div class="topbar"><div class="brand">🐘 phpPgAdmin-like (Node.js + pg)</div>
    <a href="/">Обзор БД</a>
    <a href="/browser">Браузер объектов</a>
    <a href="/query">SQL-редактор</a>
    <a href="/export">Экспорт</a>
    <span style="margin-left:auto; font-size:0.8rem; color:#9ca3af;">${connectionString.replace(/:[^:@]*@/, ':***@')}</span>
  </div>
  <div class="container">`;
}
function htmlFoot() {
  return `</div><p class="muted" style="margin-top:1rem;">Node.js + Express + pg &middot; <a href="/">Обзор</a> &middot; <a href="/browser">Браузер объектов</a> &middot; <a href="/query">SQL</a></p></body></html>`;
}

// ---------- ГЛАВНАЯ — ОБЗОР БД ----------
app.get('/', async (req, res) => {
  try {
    const [{ rows: version }] = await Promise.all([pool.query('SELECT version() AS v')]);
    const [{ rows: dbsize }] = await Promise.all([pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`)]);
    const [{ rows: conns }] = await Promise.all([pool.query(`SELECT count(*) AS cnt FROM pg_stat_activity WHERE datname = current_database()`)]);
    const [{ rows: schemas }] = await Promise.all([pool.query(`SELECT schema_name FROM information_schema.schemata ORDER BY schema_name`)]);
    const [{ rows: tables }] = await Promise.all([pool.query(`SELECT count(*) AS cnt FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')`)]);
    let out = htmlHead('Обзор базы данных');
    out += `<h1>🐘 Обзор базы данных</h1>`;
    out += `<div class="grid">`;
    out += `<div class="stat"><div class="v">${escapeHtml(version[0].v)}</div><div class="l">Версия PostgreSQL</div></div>`;
    out += `<div class="stat"><div class="v">${escapeHtml(dbsize[0].size)}</div><div class="l">Размер базы</div></div>`;
    out += `<div class="stat"><div class="v">${escapeHtml(conns[0].cnt)}</div><div class="l">Активных подключений</div></div>`;
    out += `<div class="stat"><div class="v">${escapeHtml(tables[0].cnt)}</div><div class="l">Таблиц (все схемы)</div></div>`;
    out += `</div>`;
    out += `<div class="card"><h2>📁 Схемы</h2><ul class="object-list">`;
    for (const s of schemas) {
      out += `<li><span><a href="/schema/${encodeURIComponent(s.schema_name)}">${escapeHtml(s.schema_name)}</a></span><a href="/schema/${encodeURIComponent(s.schema_name)}" class="btn btn-sm btn-outline">Открыть</a></li>`;
    }
    out += `</ul></div>`;
    out += htmlFoot();
    res.send(out);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});

// ---------- БРАУЗЕР ОБЪЕКТОВ ----------
app.get('/browser', async (req, res) => {
  const schema = req.query.schema || DEFAULT_SCHEMA;
  try {
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_type='BASE TABLE' ORDER BY table_name`, [schema]);
    const views = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_type='VIEW' ORDER BY table_name`, [schema]);
    const seqs = await pool.query(
      `SELECT sequence_name AS name FROM information_schema.sequences WHERE sequence_schema=$1 ORDER BY sequence_name`, [schema]);
    const funcs = await pool.query(
      `SELECT routine_name AS name FROM information_schema.routines WHERE routine_schema=$1 ORDER BY routine_name`, [schema]);
    let out = htmlHead('Браузер объектов');
    out += `<h1>📂 Браузер объектов — схема <code>${escapeHtml(schema)}</code></h1>`;
    out += `<form method="get" action="/browser" style="display:inline; margin-bottom:1rem;">
      Схема: <input type="text" name="schema" value="${escapeHtml(schema)}" style="width:180px;">
      <button type="submit" class="btn btn-sm">Показать</button>
    </form>`;
    const section = (title, icon, rows, linkFn) => {
      if (!rows.length) return `<div class="card"><h2>${icon} ${title}</h2><p class="muted">Нет объектов</p></div>`;
      let html = `<div class="card"><h2>${icon} ${title} (${rows.length})</h2><ul class="object-list">`;
      for (const r of rows) {
        const name = r.table_name || r.name;
        html += `<li><span><a href="${linkFn(name)}">${escapeHtml(name)}</a></span>`;
        if (linkFn.name.includes('table')) html += `<a href="/table/${encodeURIComponent(name)}/ddl" class="btn btn-sm btn-outline">DDL</a>`;
        html += `</li>`;
      }
      html += `</ul></div>`;
      return html;
    };
    out += section('Таблицы', '📋', tables.rows, (n) => `/table/${encodeURIComponent(n)}`);
    out += section('Представления (Views)', '👁️', views.rows, (n) => `/view/${encodeURIComponent(n)}`);
    out += section('Последовательности', '🔢', seqs.rows, (n) => `/sequence/${encodeURIComponent(n)}`);
    out += section('Функции', '⚙️', funcs.rows, (n) => `/function/${encodeURIComponent(n)}`);
    out += htmlFoot();
    res.send(out);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});

app.get('/schema/:schema', (req, res) => {
  res.redirect(`/browser?schema=${encodeURIComponent(req.params.schema)}`);
});
// ---------- ТАБЛИЦА: ДАННЫЕ (с сортировкой попарно, фильтрами попарно, пагинацией) ----------
app.get('/table/:table', async (req, res) => {
  const table = req.params.table;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
  const offset = (page - 1) * limit;
  try {
    const colsRes = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`,
      [DEFAULT_SCHEMA, table]
    );
    const cols = colsRes.rows;
    if (cols.length === 0) return res.send(htmlHead('Ошибка') + `<div class="error">Таблица не найдена</div><p><a href="/browser">Назад</a></p>` + htmlFoot());
    const colNames = cols.map((c) => c.column_name);

    // --- Сортировка до 3 полей ---
    const sorts = [];
    for (let i = 1; i <= 3; i++) {
      const s = req.query[`sort_${i}`];
      const d = (req.query[`dir_${i}`] || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
      if (s && colNames.includes(s)) sorts.push({ col: s, dir: d, pos: i });
    }
    const orderBy = sorts.length ? `ORDER BY ${sorts.map((s) => `${ident(s.col)} ${s.dir}`).join(', ')}` : 'ORDER BY 1';

    // --- Фильтры до 3 по значению + до 2 по датам ---
    const whereParts = [];
    const params = [];
    for (let i = 1; i <= 3; i++) {
      const fc = req.query[`filter_col_${i}`];
      const fo = req.query[`filter_op_${i}`] || 'eq';
      const fv = req.query[`filter_val_${i}`];
      if (fc && colNames.includes(fc) && fv !== '') {
        let op = '=';
        if (fo === 'neq') op = '<>'; else if (fo === 'gt') op = '>'; else if (fo === 'lt') op = '<'; else if (fo === 'ilike') op = 'ILIKE';
        const v = op === 'ILIKE' ? `%${fv}%` : fv;
        whereParts.push(`${ident(fc)} ${op} $${params.length + 1}`);
        params.push(v);
      }
    }
    for (let i = 1; i <= 2; i++) {
      const dc = req.query[`date_col_${i}`];
      const df = req.query[`date_from_${i}`];
      const dt = req.query[`date_to_${i}`];
      if (dc && colNames.includes(dc)) {
        if (df) { whereParts.push(`${ident(dc)} >= $${params.length + 1}`); params.push(df); }
        if (dt) { whereParts.push(`${ident(dc)} <= $${params.length + 1}`); params.push(dt); }
      }
    }
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const lp = params.length + 1, op2 = params.length + 2;

    const [countRes, rowsRes] = await Promise.all([
      pool.query(`SELECT count(*) FROM ${ident(table)} ${whereClause}`, params),
      pool.query(`SELECT * FROM ${ident(table)} ${whereClause} ${orderBy} LIMIT $${lp} OFFSET $${op2}`, [...params, limit, offset]),
    ]);
    const total = parseInt(countRes.rows[0].count, 10);
    const totalPages = Math.ceil(total / limit) || 1;

    const baseQ = { ...req.query };
    function setQ(overrides) { return toQuery({ ...baseQ, ...overrides }); }
    function sortUrl(col) {
      const p = { ...baseQ };
      for (let i = 1; i <= 3; i++) { delete p[`sort_${i}`]; delete p[`dir_${i}`]; }
      let foundPos = null;
      for (let i = 1; i <= 3; i++) { if (baseQ[`sort_${i}`] === col) { foundPos = i; break; } }
      if (foundPos !== null) {
        p[`dir_${foundPos}`] = baseQ[`dir_${foundPos}`] === 'asc' ? 'desc' : 'asc';
      } else {
        let pos = 1; while (pos <= 3 && p[`sort_${pos}`]) pos++;
        if (pos <= 3) { p[`sort_${pos}`] = col; p[`dir_${pos}`] = 'asc'; }
      }
      return setQ(p);
    }
    function removeSortUrl(pos) {
      const p = { ...baseQ }; delete p[`sort_${pos}`]; delete p[`dir_${pos}`]; return setQ(p);
    }
    const pageQ = (pg) => setQ({ page: pg });

    let out = htmlHead(`Таблица ${table}`);
    out += `<div class="nav-tabs">
      <a href="/table/${encodeURIComponent(table)}" class="${!req.query.tab ? 'active' : ''}">Данные</a>
      <a href="/table/${encodeURIComponent(table)}/structure" class="${req.query.tab === 'structure' ? 'active' : ''}">Структура</a>
      <a href="/table/${encodeURIComponent(table)}/indexes" class="${req.query.tab === 'indexes' ? 'active' : ''}">Индексы</a>
      <a href="/table/${encodeURIComponent(table)}/constraints" class="${req.query.tab === 'constraints' ? 'active' : ''}">Ограничения</a>
      <a href="/table/${encodeURIComponent(table)}/triggers" class="${req.query.tab === 'triggers' ? 'active' : ''}">Триггеры</a>
      <a href="/table/${encodeURIComponent(table)}/ddl" class="${req.query.tab === 'ddl' ? 'active' : ''}">DDL</a>
    </div>`;
    out += `<h1>📋 Таблица <code>${escapeHtml(table)}</code></h1>`;
    out += `<p><span class="badge">строк: ${total}</span> <span class="badge">стр. ${page} / ${totalPages}</span> <span class="badge">по ${limit}</span></p>`;
    out += `<a href="/" class="btn btn-outline btn-sm">↩ Обзор</a> <a href="/browser" class="btn btn-outline btn-sm">Браузер</a> <a href="/table/${encodeURIComponent(table)}/new" class="btn btn-sm">+ Строка</a> <a href="/query?q=SELECT%20*%20FROM%20${encodeURIComponent(table)}%20LIMIT%20100" class="btn btn-outline btn-sm">SQL</a>`;

    // Чипы сортировки
    if (sorts.length) {
      out += `<div style="margin-bottom:0.5rem;">Сортировка: `;
      for (const s of sorts) {
        out += `<span class="badge">${s.pos}: ${escapeHtml(s.col)} ${s.dir === 'ASC' ? '▲' : '▼'} <a href="?${removeSortUrl(s.pos)}" style="color:#dc2626;text-decoration:none;font-weight:bold;">×</a></span>`;
      }
      out += `</div>`;
    }

    // Фильтры — свёрнутый блок
    out += `<details class="filter-details"><summary>🔍 Фильтры ▾</summary><form method="get" action="/table/${encodeURIComponent(table)}" class="card">`;
    out += `<div class="row"><h4 style="margin:0 0 0.5rem 0;">По значениям (до 3 полей)</h4>`;
    for (let i = 1; i <= 3; i++) {
      out += `<div class="form-group" style="width:auto;"><label>Поле ${i}</label><select name="filter_col_${i}"><option value="">—</option>`;
      for (const c of colNames) out += `<option value="${c}" ${req.query[`filter_col_${i}`] === c ? 'selected' : ''}>${escapeHtml(c)}</option>`;
      out += `</select></div>`;
      out += `<div class="form-group" style="width:auto;"><label>Оп. ${i}</label><select name="filter_op_${i}"><option value="eq" ${req.query[`filter_op_${i}`] === 'eq' ? 'selected' : ''}>=</option><option value="neq" ${req.query[`filter_op_${i}`] === 'neq' ? 'selected' : ''}>≠</option><option value="gt" ${req.query[`filter_op_${i}`] === 'gt' ? 'selected' : ''}>></option><option value="lt" ${req.query[`filter_op_${i}`] === 'lt' ? 'selected' : ''}><</option><option value="ilike" ${req.query[`filter_op_${i}`] === 'ilike' ? 'selected' : ''}>~</option></select></div>`;
      out += `<div class="form-group" style="width:auto;"><label>Знач. ${i}</label><input type="text" name="filter_val_${i}" value="${escapeHtml(req.query[`filter_val_${i}`] || '')}"></div>`;
    }
    out += `</div><div class="row" style="margin-top:0.5rem;"><h4 style="margin:0 0 0.5rem 0;">По датам (до 2 диапазонов)</h4>`;
    for (let i = 1; i <= 2; i++) {
      out += `<div class="form-group" style="width:auto;"><label>Колонка ${i}</label><select name="date_col_${i}"><option value="">—</option>`;
      for (const c of colNames) out += `<option value="${c}" ${req.query[`date_col_${i}`] === c ? 'selected' : ''}>${escapeHtml(c)}</option>`;
      out += `</select></div>`;
      out += `<div class="form-group" style="width:auto;"><label>От ${i}</label><input type="datetime-local" name="date_from_${i}" value="${escapeHtml(req.query[`date_from_${i}`] || '')}"></div>`;
      out += `<div class="form-group" style="width:auto;"><label>До ${i}</label><input type="datetime-local" name="date_to_${i}" value="${escapeHtml(req.query[`date_to_${i}`] || '')}"></div>`;
    }
    out += `</div><div style="margin-top:0.75rem;"><button type="submit" class="btn btn-sm">Применить фильтры</button> <a href="/table/${encodeURIComponent(table)}" class="btn btn-outline btn-sm">Сбросить всё</a></div></form></details>`;

    // Таблица данных
    if (rowsRes.rows.length === 0) {
      out += `<p>Нет данных.</p>`;
    } else {
      const pk = colNames[0];
      out += `<table><thead><tr>`;
      for (const c of colNames) {
        const inSort = sorts.find((s) => s.col === c);
        let sortHtml = '';
        if (inSort) sortHtml = ` ${inSort.dir === 'ASC' ? '▲' : '▼'} <a href="?${removeSortUrl(inSort.pos)}" style="color:#dc2626;text-decoration:none;">×</a>`;
        out += `<th><a href="?${sortUrl(c)}">${escapeHtml(c)}${sortHtml}</a></th>`;
      }
      out += `<th style="width:140px;">Действия</th></tr></thead><tbody>`;
      for (const row of rowsRes.rows) {
        out += `<tr>`;
        for (const c of colNames) {
          const v = row[c];
          out += `<td><span class="mono">${v === null ? '<em>null</em>' : escapeHtml(String(v))}</span></td>`;
        }
        const id = String(row[pk]);
        out += `<td><a href="/table/${encodeURIComponent(table)}/edit/${encodeURIComponent(id)}" class="btn btn-outline btn-sm">Ред.</a><form method="post" action="/table/${encodeURIComponent(table)}/delete" style="display:inline;" onsubmit="return confirm('Удалить строку?');"><input type="hidden" name="id" value="${escapeHtml(id)}"><button type="submit" class="btn btn-danger btn-sm">Удалить</button></form></td></tr>`;
      }
      out += `</tbody></table>`;
    }
    out += `<div class="pagination">`;
    if (page > 1) out += `<a href="?${pageQ(page - 1)}">‹ Назад</a>`;
    for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) out += `<a href="?${pageQ(i)}" class="${i === page ? 'active' : ''}">${i}</a>`;
    if (page < totalPages) out += `<a href="?${pageQ(page + 1)}">Вперёд ›</a>`;
    out += `</div><p class="muted">Размер: <form method="get" style="display:inline;"><input type="number" name="limit" value="${limit}" min="1" max="500" style="width:60px;"><button type="submit" class="btn btn-sm" style="padding:0.2rem 0.5rem;">OK</button></form></p>`;
    out += htmlFoot();
    res.send(out);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});

// ---------- ТАБЛИЦА: СТРУКТУРА КОЛОНОК ----------
app.get('/table/:table/structure', async (req, res) => {
  const table = req.params.table;
  try {
    const cols = await pool.query(
      `SELECT column_name, data_type, character_maximum_length, is_nullable, column_default, ordinal_position FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`,
      [DEFAULT_SCHEMA, table]
    );
    if (cols.rows.length === 0) return res.send(htmlHead('Ошибка') + `<div class="error">Таблица не найдена</div><p><a href="/browser">Назад</a></p>` + htmlFoot());
    let out = htmlHead(`Структура ${table}`);
    out += `<a href="/table/${encodeURIComponent(table)}" class="btn btn-outline btn-sm">↩ К данным</a>`;
    out += `<h1>🏗️ Структура таблицы <code>${escapeHtml(table)}</code></h1>`;
    out += `<table><thead><tr><th>#</th><th>Колонка</th><th>Тип</th><th>Длина</th><th>NULL</th><th>Знач. по умолчанию</th><th>Действие</th></tr></thead><tbody>`;
    for (const c of cols.rows) {
      out += `<tr><td>${c.ordinal_position}</td><td><code>${escapeHtml(c.column_name)}</code></td><td>${escapeHtml(c.data_type)}</td><td>${c.character_maximum_length ?? '—'}</td><td>${c.is_nullable === 'YES' ? '✓' : '—'}</td><td><span class="mono">${c.column_default ?? '—'}</span></td><td><a href="/table/${encodeURIComponent(table)}/drop-column/${encodeURIComponent(c.column_name)}" class="btn btn-danger btn-sm" onclick="return confirm('Удалить колонку?')">Удалить</a></td></tr>`;
    }
    out += `</tbody></table>`;
    out += `<div class="card"><h2>➕ Добавить колонку</h2><form method="post" action="/table/${encodeURIComponent(table)}/add-column">
      <div class="row">
        <div class="form-group" style="width:auto;"><label>Имя</label><input type="text" name="col_name" required></div>
        <div class="form-group" style="width:auto;"><label>Тип</label><select name="col_type"><option value="text">TEXT</option><option value="integer">INTEGER</option><option value="bigint">BIGINT</option><option value="numeric">NUMERIC</option><option value="boolean">BOOLEAN</option><option value="date">DATE</option><option value="timestamp">TIMESTAMP</option><option value="varchar">VARCHAR</option></select></div>
        <div class="form-group" style="width:auto;"><label>Длина (для VARCHAR)</label><input type="number" name="col_len" placeholder="255"></div>
        <div class="form-group" style="width:auto;"><label>NOT NULL</label><input type="checkbox" name="col_nn" value="1"></div>
        <div class="form-group" style="width:auto;"><label>DEFAULT</label><input type="text" name="col_def"></div>
        <button type="submit" class="btn btn-sm">Добавить</button>
      </div></form></div>`;
    out += htmlFoot();
    res.send(out);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});

// ---------- ТАБЛИЦА: ИНДЕКСЫ ----------
app.get('/table/:table/indexes', async (req, res) => {
  const table = req.params.table;
  try {
    const indexes = await pool.query(
      `SELECT indexname AS name, indexdef AS def FROM pg_indexes WHERE schemaname=$1 AND tablename=$2 ORDER BY indexname`,
      [DEFAULT_SCHEMA, table]
    );
    let out = htmlHead(`Индексы ${table}`);
    out += `<a href="/table/${encodeURIComponent(table)}" class="btn btn-outline btn-sm">↩ К данным</a>`;
    out += `<h1>🔍 Индексы таблицы <code>${escapeHtml(table)}</code></h1>`;
    if (indexes.rows.length === 0) out += `<p class="muted">Индексов нет.</p>`;
    else {
      out += `<table><thead><tr><th>Имя</th><th>Определение</th><th>Действие</th></tr></thead><tbody>`;
      for (const i of indexes.rows) {
        out += `<tr><td><code>${escapeHtml(i.name)}</code></td><td><span class="mono">${escapeHtml(i.def)}</span></td><td><a href="/table/${encodeURIComponent(table)}/drop-index/${encodeURIComponent(i.name)}" class="btn btn-danger btn-sm" onclick="return confirm('Удалить индекс?')">Удалить</a></td></tr>`;
      }
      out += `</tbody></table>`;
    }
    out += `<div class="card"><h2>➕ Создать индекс</h2><form method="post" action="/table/${encodeURIComponent(table)}/add-index">
      <div class="row">
        <div class="form-group" style="width:auto;"><label>Имя индекса</label><input type="text" name="idx_name" required></div>
        <div class="form-group" style="width:auto;"><label>Колонки</label><input type="text" name="idx_cols" placeholder="col1, col2" required></div>
        <div class="form-group" style="width:auto;"><label>Уникальный</label><input type="checkbox" name="idx_unique" value="1"></div>
        <button type="submit" class="btn btn-sm">Создать</button>
      </div></form></div>`;
    out += htmlFoot();
    res.send(out);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});

// ---------- ТАБЛИЦА: ОГРАНИЧЕНИЯ ----------
app.get('/table/:table/constraints', async (req, res) => {
  const table = req.params.table;
  try {
    const constraints = await pool.query(
      `SELECT conname AS name, contype AS type, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = $1::regclass ORDER BY conname`,
      [`${DEFAULT_SCHEMA}.${table}`]
    );
    let out = htmlHead(`Ограничения ${table}`);
    out += `<a href="/table/${encodeURIComponent(table)}" class="btn btn-outline btn-sm">↩ К данным</a>`;
    out += `<h1>🔒 Ограничения таблицы <code>${escapeHtml(table)}</code></h1>`;
    const typeLabels = { p: 'PRIMARY KEY', f: 'FOREIGN KEY', u: 'UNIQUE', c: 'CHECK', t: 'TRIGGER', x: 'EXCLUSION' };
    if (constraints.rows.length === 0) out += `<p class="muted">Ограничений нет.</p>`;
    else {
      out += `<table><thead><tr><th>Имя</th><th>Тип</th><th>Определение</th><th>Действие</th></tr></thead><tbody>`;
      for (const c of constraints.rows) {
        out += `<tr><td><code>${escapeHtml(c.name)}</code></td><td><span class="badge">${typeLabels[c.type] || c.type}</span></td><td><span class="mono">${escapeHtml(c.def)}</span></td><td><a href="/table/${encodeURIComponent(table)}/drop-constraint/${encodeURIComponent(c.name)}" class="btn btn-danger btn-sm" onclick="return confirm('Удалить ограничение?')">Удалить</a></td></tr>`;
      }
      out += `</tbody></table>`;
    }
    out += htmlFoot();
    res.send(out);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});

// ---------- ТАБЛИЦА: ТРИГГЕРЫ ----------
app.get('/table/:table/triggers', async (req, res) => {
  const table = req.params.table;
  try {
    const triggers = await pool.query(
      `SELECT trigger_name AS name, event_manipulation AS event, action_statement AS def FROM information_schema.triggers WHERE event_object_schema=$1 AND event_object_table=$2 ORDER BY trigger_name`,
      [DEFAULT_SCHEMA, table]
    );
    let out = htmlHead(`Триггеры ${table}`);
    out += `<a href="/table/${encodeURIComponent(table)}" class="btn btn-outline btn-sm">↩ К данным</a>`;
    out += `<h1>⚡ Триггеры таблицы <code>${escapeHtml(table)}</code></h1>`;
    if (triggers.rows.length === 0) out += `<p class="muted">Триггеров нет.</p>`;
    else {
      out += `<table><thead><tr><th>Имя</th><th>Событие</th><th>Действие</th></tr></thead><tbody>`;
      for (const t of triggers.rows) {
        out += `<tr><td><code>${escapeHtml(t.name)}</code></td><td>${escapeHtml(t.event)}</td><td><span class="mono">${escapeHtml(t.def ?? '—')}</span></td></tr>`;
      }
      out += `</tbody></table>`;
    }
    out += htmlFoot();
    res.send(out);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});

// ---------- ТАБЛИЦА: DDL ----------
app.get('/table/:table/ddl', async (req, res) => {
  const table = req.params.table;
  try {
    const cols = await pool.query(
      `SELECT column_name, data_type, character_maximum_length, is_nullable, column_default FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`,
      [DEFAULT_SCHEMA, table]
    );
    let ddl = `CREATE TABLE ${ident(table)} (\n`;
    ddl += cols.rows.map((c, i) => {
      let line = `  ${ident(c.column_name)} ${c.data_type.toUpperCase()}`;
      if (c.character_maximum_length) line += `(${c.character_maximum_length})`;
      if (c.is_nullable === 'NO') line += ' NOT NULL';
      if (c.column_default) line += ` DEFAULT ${c.column_default}`;
      return i < cols.rows.length - 1 ? line + ',' : line;
    }).join(',\n');
    ddl += `\n);`;
    let out = htmlHead(`DDL ${table}`);
    out += `<a href="/table/${encodeURIComponent(table)}" class="btn btn-outline btn-sm">↩ К данным</a>`;
    out += `<h1>📄 DDL таблицы <code>${escapeHtml(table)}</code></h1>`;
    out += `<pre class="sql">${escapeHtml(ddl)}</pre>`;
    out += htmlFoot();
    res.send(out);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});

// ---------- УДАЛЕНИЕ СТРОКИ ----------
app.post('/table/:table/delete', async (req, res) => {
  const table = req.params.table;
  const id = req.body.id;
  try {
    const colsRes = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position LIMIT 1`, [DEFAULT_SCHEMA, table]);
    const pk = colsRes.rows[0].column_name;
    await pool.query(`DELETE FROM ${ident(table)} WHERE ${ident(pk)} = $1`, [id]);
    res.redirect(`/table/${encodeURIComponent(table)}`);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});

// ---------- НОВАЯ СТРОКА ----------
app.get('/table/:table/new', async (req, res) => {
  const table = req.params.table;
  try {
    const cols = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`, [DEFAULT_SCHEMA, table]);
    if (cols.rows.length === 0) return res.send(htmlHead('Ошибка') + `<div class="error">Таблица не найдена</div>` + htmlFoot());
    let out = htmlHead(`Новая строка в ${table}`);
    out += `<a href="/table/${encodeURIComponent(table)}" class="btn btn-outline btn-sm">↩ К данным</a>`;
    out += `<h1>➕ Новая строка в <code>${escapeHtml(table)}</code></h1><form method="post" action="/table/${encodeURIComponent(table)}/new" class="card">`;
    for (const c of cols.rows) {
      out += `<div class="form-group"><label>${escapeHtml(c.column_name)} (${c.data_type})</label><input type="text" name="col_${c.column_name}"></div>`;
    }
    out += `<button type="submit" class="btn btn-sm">Создать</button> <a href="/table/${encodeURIComponent(table)}" class="btn btn-outline btn-sm">Отмена</a></form>`;
    out += htmlFoot();
    res.send(out);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});
app.post('/table/:table/new', async (req, res) => {
  const table = req.params.table;
  const keys = Object.keys(req.body).filter((k) => k.startsWith('col_')).map((k) => k.slice(4));
  if (keys.length === 0) return res.send(htmlHead('Ошибка') + `<div class="error">Нет данных</div>` + htmlFoot());
  const cols = keys.map((k) => ident(k)).join(', ');
  const vals = keys.map((_, i) => `$${i + 1}`).join(', ');
  const params = keys.map((k) => req.body[`col_${k}`] === '' ? null : req.body[`col_${k}`]);
  try {
    await pool.query(`INSERT INTO ${ident(table)} (${cols}) VALUES (${vals})`, params);
    res.redirect(`/table/${encodeURIComponent(table)}`);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});
// ---------- РЕДАКТИРОВАНИЕ СТРОКИ ----------
app.get('/table/:table/edit/:id', async (req, res) => {
  const table = req.params.table;
  const id = req.params.id;
  try {
    const cols = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`, [DEFAULT_SCHEMA, table]);
    const pk = cols.rows[0].column_name;
    const { rows } = await pool.query(`SELECT * FROM ${ident(table)} WHERE ${ident(pk)} = $1`, [id]);
    if (rows.length === 0) return res.send(htmlHead('Ошибка') + `<div class="error">Строка не найдена</div><p><a href="/table/${encodeURIComponent(table)}">Назад</a></p>` + htmlFoot());
    const row = rows[0];
    let out = htmlHead(`Редактирование ${table}`);
    out += `<a href="/table/${encodeURIComponent(table)}" class="btn btn-outline btn-sm">↩ К данным</a>`;
    out += `<h1>✏️ Редактирование строки в <code>${escapeHtml(table)}</code></h1><form method="post" action="/table/${encodeURIComponent(table)}/edit/${encodeURIComponent(id)}" class="card">`;
    for (const c of cols.rows) {
      const val = row[c.column_name] ?? '';
      out += `<div class="form-group"><label>${escapeHtml(c.column_name)} (${c.data_type})${c.column_name === pk ? ' (PK)' : ''}</label><input type="text" name="col_${c.column_name}" value="${escapeHtml(String(val))}"></div>`;
    }
    out += `<button type="submit" class="btn btn-sm">Сохранить</button> <a href="/table/${encodeURIComponent(table)}" class="btn btn-outline btn-sm">Отмена</a></form>`;
    out += htmlFoot();
    res.send(out);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});
app.post('/table/:table/edit/:id', async (req, res) => {
  const table = req.params.table;
  const id = req.params.id;
  const keys = Object.keys(req.body).filter((k) => k.startsWith('col_')).map((k) => k.slice(4));
  if (keys.length === 0) return res.send(htmlHead('Ошибка') + `<div class="error">Нет данных</div>` + htmlFoot());
  const setClause = keys.map((k, i) => `${ident(k)} = $${i + 1}`).join(', ');
  const params = keys.map((k) => req.body[`col_${k}`] === '' ? null : req.body[`col_${k}`]);
  try {
    const colsRes = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position LIMIT 1`, [DEFAULT_SCHEMA, table]);
    const pk = colsRes.rows[0].column_name;
    await pool.query(`UPDATE ${ident(table)} SET ${setClause} WHERE ${ident(pk)} = $${keys.length + 1}`, [...params, id]);
    res.redirect(`/table/${encodeURIComponent(table)}`);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});

// ---------- СОЗДАНИЕ ТАБЛИЦЫ ----------
app.get('/create-table', (req, res) => {
  let out = htmlHead('Создать таблицу');
  out += `<h1>🆕 Новая таблица</h1><form method="post" action="/create-table" class="card">
    <div class="form-group"><label>Имя таблицы</label><input type="text" name="table_name" required></div>
    <h3 style="margin-top:1rem;">Колонки (до 10)</h3>`;
  for (let i = 0; i < 10; i++) {
    out += `<div class="row" style="margin-bottom:0.5rem;">
      <div class="form-group" style="width:auto;"><label>Имя ${i + 1}</label><input type="text" name="col_name_${i}"></div>
      <div class="form-group" style="width:auto;"><label>Тип</label><select name="col_type_${i}"><option value="text">TEXT</option><option value="integer">INTEGER</option><option value="bigint">BIGINT</option><option value="numeric">NUMERIC</option><option value="boolean">BOOLEAN</option><option value="date">DATE</option><option value="timestamp">TIMESTAMP</option><option value="varchar">VARCHAR</option></select></div>
      <div class="form-group" style="width:auto;"><label>Длина</label><input type="number" name="col_len_${i}" placeholder="255"></div>
      <div class="form-group" style="width:auto;"><label>PK</label><input type="checkbox" name="col_pk_${i}" value="1"></div>
      <div class="form-group" style="width:auto;"><label>NOT NULL</label><input type="checkbox" name="col_nn_${i}" value="1"></div>
    </div>`;
  }
  out += `<button type="submit" class="btn btn-sm">Создать таблицу</button> <a href="/browser" class="btn btn-outline btn-sm">Назад</a></form>`;
  out += htmlFoot();
  res.send(out);
});
app.post('/create-table', async (req, res) => {
  const { table_name } = req.body;
  if (!table_name) return res.send(htmlHead('Ошибка') + `<div class="error">Укажите имя таблицы</div><p><a href="/create-table">Назад</a></p>` + htmlFoot());
  const cols = [];
  for (let i = 0; i < 10; i++) {
    const n = req.body[`col_name_${i}`];
    if (!n) continue;
    let t = req.body[`col_type_${i}`] || 'text';
    if (!['text','integer','bigint','numeric','boolean','date','timestamp','varchar'].includes(t)) t = 'text';
    let def = `${ident(n)} ${t.toUpperCase()}`;
    if (t === 'varchar' && req.body[`col_len_${i}`]) def += `(${req.body[`col_len_${i}`]})`;
    if (req.body[`col_pk_${i}`]) def += ' PRIMARY KEY';
    if (req.body[`col_nn_${i}`]) def += ' NOT NULL';
    cols.push(def);
  }
  if (cols.length === 0) return res.send(htmlHead('Ошибка') + `<div class="error">Добавьте хотя бы одну колонку</div><p><a href="/create-table">Назад</a></p>` + htmlFoot());
  try {
    await pool.query(`CREATE TABLE ${ident(table_name)} (${cols.join(', ')})`);
    res.redirect(`/table/${encodeURIComponent(table_name)}`);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div><p><a href="/create-table">Назад</a></p>` + htmlFoot());
  }
});

// ---------- УДАЛЕНИЕ ТАБЛИЦЫ ----------
app.post('/table/:table/drop', async (req, res) => {
  const table = req.params.table;
  try {
    await pool.query(`DROP TABLE ${ident(table)} CASCADE`);
    res.redirect('/browser');
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});

// ---------- ДОБАВИТЬ КОЛОНКУ ----------
app.post('/table/:table/add-column', async (req, res) => {
  const table = req.params.table;
  const { col_name, col_type, col_len, col_nn, col_def } = req.body;
  if (!col_name) return res.send(htmlHead('Ошибка') + `<div class="error">Укажите имя колонки</div>` + htmlFoot());
  let sql = `ALTER TABLE ${ident(table)} ADD COLUMN ${ident(col_name)} ${col_type.toUpperCase()}`;
  if (col_type === 'varchar' && col_len) sql += `(${col_len})`;
  if (col_nn) sql += ' NOT NULL';
  if (col_def) sql += ` DEFAULT ${col_def}`;
  try {
    await pool.query(sql);
    res.redirect(`/table/${encodeURIComponent(table)}/structure`);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});

// ---------- УДАЛИТЬ КОЛОНКУ ----------
app.post('/table/:table/drop-column/:col', async (req, res) => {
  const table = req.params.table;
  const col = req.params.col;
  try {
    await pool.query(`ALTER TABLE ${ident(table)} DROP COLUMN ${ident(col)}`);
    res.redirect(`/table/${encodeURIComponent(table)}/structure`);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});

// ---------- СОЗДАТЬ ИНДЕКС ----------
app.post('/table/:table/add-index', async (req, res) => {
  const table = req.params.table;
  const { idx_name, idx_cols, idx_unique } = req.body;
  if (!idx_name || !idx_cols) return res.send(htmlHead('Ошибка') + `<div class="error">Укажите имя и колонки</div>` + htmlFoot());
  const cols = idx_cols.split(',').map((c) => ident(c.trim())).join(', ');
  let sql = `CREATE ${idx_unique ? 'UNIQUE ' : ''}INDEX ${ident(idx_name)} ON ${ident(table)} (${cols})`;
  try {
    await pool.query(sql);
    res.redirect(`/table/${encodeURIComponent(table)}/indexes`);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});

// ---------- УДАЛИТЬ ИНДЕКС ----------
app.post('/table/:table/drop-index/:idx', async (req, res) => {
  const table = req.params.table;
  const idx = req.params.idx;
  try {
    await pool.query(`DROP INDEX ${ident(idx)}`);
    res.redirect(`/table/${encodeURIComponent(table)}/indexes`);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});

// ---------- УДАЛИТЬ ОГРАНИЧЕНИЕ ----------
app.post('/table/:table/drop-constraint/:con', async (req, res) => {
  const table = req.params.table;
  const con = req.params.con;
  try {
    await pool.query(`ALTER TABLE ${ident(table)} DROP CONSTRAINT ${ident(con)}`);
    res.redirect(`/table/${encodeURIComponent(table)}/constraints`);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});
// ---------- ПРЕДСТАВЛЕНИЯ (VIEWS) ----------
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
    const totalPages = Math.ceil(total / limit) || 1;
    let out = htmlHead(`Представление ${view}`);
    out += `<a href="/browser" class="btn btn-outline btn-sm">↩ Браузер</a>`;
    out += `<h1>👁️ Представление <code>${escapeHtml(view)}</code></h1>`;
    out += `<h3>Определение</h3><pre class="sql">${escapeHtml(def.rows[0].ddl)}</pre>`;
    out += `<p><span class="badge">строк: ${total}</span> <span class="badge">стр. ${page} / ${totalPages}</span></p>`;
    if (rows.rows.length) {
      const cols = Object.keys(rows.rows[0]);
      out += `<table><thead><tr>`;
      for (const c of cols) out += `<th>${escapeHtml(c)}</th>`;
      out += `<th>Действие</th></tr></thead><tbody>`;
      for (const row of rows.rows) {
        out += `<tr>`;
        for (const c of cols) out += `<td><span class="mono">${row[c] === null ? '<em>null</em>' : escapeHtml(String(row[c]))}</span></td>`;
        out += `<td>только чтение</td></tr>`;
      }
      out += `</tbody></table>`;
    }
    out += htmlFoot();
    res.send(out);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});

// ---------- ПОСЛЕДОВАТЕЛЬНОСТИ ----------
app.get('/sequence/:seq', async (req, res) => {
  const seq = req.params.seq;
  try {
    const info = await pool.query(`SELECT last_value, is_called FROM ${ident(seq)}`);
    let out = htmlHead(`Последовательность ${seq}`);
    out += `<a href="/browser" class="btn btn-outline btn-sm">↩ Браузер</a>`;
    out += `<h1>🔢 Последовательность <code>${escapeHtml(seq)}</code></h1>`;
    out += `<table><tr><td>Последнее значение</td><td><span class="mono">${info.rows[0].last_value}</span></td></tr>`;
    out += `<tr><td>Вызывалось</td><td>${info.rows[0].is_called ? 'Да' : 'Нет'}</td></tr></table>`;
    out += htmlFoot();
    res.send(out);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});

// ---------- ФУНКЦИИ ----------
app.get('/function/:fn', async (req, res) => {
  const fn = req.params.fn;
  try {
    const src = await pool.query(`SELECT prosrc AS source FROM pg_proc WHERE proname = $1 LIMIT 1`, [fn]);
    let out = htmlHead(`Функция ${fn}`);
    out += `<a href="/browser" class="btn btn-outline btn-sm">↩ Браузер</a>`;
    out += `<h1>⚙️ Функция <code>${escapeHtml(fn)}</code></h1>`;
    if (src.rows.length) out += `<pre class="sql">${escapeHtml(src.rows[0].source)}</pre>`;
    else out += `<p class="muted">Исходный код не найден.</p>`;
    out += htmlFoot();
    res.send(out);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});

// ---------- SQL-РЕДАКТОР ----------
app.get('/query', async (req, res) => {
  const q = req.query.q || '';
  let out = htmlHead('SQL-редактор');
  out += `<h1>🔍 SQL-редактор</h1>`;
  out += `<form method="get" action="/query" class="card">
    <textarea name="q" placeholder="SELECT * FROM candles LIMIT 50;">${escapeHtml(q)}</textarea><br>
    <button type="submit" class="btn btn-sm">Выполнить</button>
    <a href="/" class="btn btn-outline btn-sm">к обзору</a>
  </form>`;
  if (q) {
    try {
      const { rows, rowCount, fields, command } = await pool.query(q);
      out += `<div class="ok">Команда: ${command} &middot; Строк: ${rowCount ?? '—'}</div>`;
      if (fields && fields.length && rows.length) {
        const cols = fields.map((f) => f.name);
        out += `<table><thead><tr>`;
        for (const c of cols) out += `<th>${escapeHtml(c)}</th>`;
        out += `</tr></thead><tbody>`;
        for (const row of rows) {
          out += `<tr>`;
          for (const c of cols) {
            const v = row[c];
            out += `<td><span class="mono">${v === null ? '<em>null</em>' : escapeHtml(String(v))}</span></td>`;
          }
          out += `</tr>`;
        }
        out += `</tbody></table>`;
      }
    } catch (err) {
      out += `<div class="error">${escapeHtml(err.message)}</div>`;
    }
  }
  out += htmlFoot();
  res.send(out);
});

// ---------- ЭКСПОРТ ----------
app.get('/export', async (req, res) => {
  const table = req.query.table || '';
  const format = req.query.format || 'csv';
  if (!table) {
    let out = htmlHead('Экспорт');
    out += `<h1>📤 Экспорт данных</h1><form method="get" action="/export" class="card">
      <div class="form-group"><label>Таблица</label><input type="text" name="table" required></div>
      <div class="form-group"><label>Формат</label><select name="format"><option value="csv">CSV</option><option value="json">JSON</option></select></div>
      <button type="submit" class="btn btn-sm">Экспорт</button>
    </form>`;
    out += htmlFoot();
    return res.send(out);
  }
  try {
    const { rows } = await pool.query(`SELECT * FROM ${ident(table)}`);
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${table}.json"`);
      return res.send(JSON.stringify(rows, null, 2));
    }
    // CSV
    if (!rows.length) return res.send('Нет данных');
    const cols = Object.keys(rows[0]);
    const esc = (v) => String(v ?? '').replace(/"/g, '""');
    let csv = cols.join(',') + '\n';
    for (const row of rows) csv += cols.map((c) => `"${esc(row[c])}"`).join(',') + '\n';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${table}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).send(htmlHead('Ошибка') + `<div class="error">${escapeHtml(err.message)}</div>` + htmlFoot());
  }
});

// ---------- ЗАПУСК ----------
app.listen(PORT, () => {
  console.log(`🌐 phpPgAdmin-like запущен: http://localhost:${PORT}`);
  console.log(`📦 PostgreSQL: ${connectionString.replace(/:[^:@]*@/, ':***@')}`);
});
