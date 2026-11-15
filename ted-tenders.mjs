#!/usr/bin/env node
// ted-tenders: search EU public tenders (TED, Tenders Electronic Daily) by CPV code, buyer country and keywords,
// optionally only notices not seen on the previous run. No dependencies, Node 18+.
// Same logic as the hosted Apify Actor https://apify.com/datakit/ted-tenders-feed (built by datakit457).
// Usage: node ted-tenders.mjs [--cpv 72000000,48000000] [--countries DEU,IRL] [--keywords "cloud hosting"]
//          [--kind competition|result|planning|all] [--days 7] [--max 100] [--new] [--state .ted-seen.json] [--format csv|jsonl]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const API = 'https://api.ted.europa.eu/v3/notices/search';
const FIELDS = ['publication-number', 'publication-date', 'notice-type', 'form-type', 'notice-title', 'title-proc',
  'buyer-name', 'buyer-country', 'classification-cpv', 'contract-nature', 'procedure-type', 'place-of-performance',
  'deadline-receipt-tender-date-lot', 'estimated-value-proc', 'estimated-value-cur-proc'];

const argv = process.argv.slice(2), opt = { format: 'csv', state: '.ted-seen.json' };
const map = { '--cpv': 'cpvCodes', '--countries': 'countries', '--keywords': 'keywords', '--kind': 'noticeKind', '--days': 'daysBack', '--max': 'maxResults', '--lang': 'language', '--state': 'state', '--format': 'format' };
const input = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--new') input.mode = 'newOnly';
  else if (map[a] && i + 1 < argv.length) { const v = argv[++i]; if (a === '--state' || a === '--format') opt[map[a]] = v; else input[map[a]] = v; }
  else { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 6).join('\n')); process.exit(a === '-h' || a === '--help' ? 0 : 2); }
}
const log = { info: (m) => console.error(m) };
const fail = (m) => { console.error(m); process.exit(2); };
const clean = (a) => (Array.isArray(a) ? a : String(a ?? '').split(/[,\s]+/)).map((s) => String(s).trim()).filter(Boolean);
const cpvCodes = clean(input.cpvCodes);
const countries = clean(input.countries).map((c) => c.toUpperCase());
const keywords = String(input.keywords ?? '').trim();
const noticeKind = input.noticeKind ?? 'competition';
const daysBack = Math.min(Math.max(parseInt(input.daysBack ?? 7, 10) || 7, 1), 90);
const maxResults = Math.min(Math.max(parseInt(input.maxResults ?? 100, 10) || 100, 1), 5000);
const mode = input.mode === 'newOnly' ? 'newOnly' : 'all';
const lang = String(input.language || 'eng').toLowerCase();

for (const c of cpvCodes) if (!/^\d{8}$/.test(c.replace(/-\d$/, ''))) fail(`Invalid CPV code "${c}": use 8 digits, e.g. 72000000`);
for (const c of countries) if (!/^[A-Z]{3}$/.test(c)) fail(`Invalid country "${c}": use ISO alpha-3 codes like DEU, FRA, IRL`);
if (!['competition', 'result', 'planning', 'all'].includes(noticeKind)) fail(`Invalid noticeKind "${noticeKind}"`);

const since = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
const parts = [`publication-date>=${since}`];
if (cpvCodes.length) parts.push(`classification-cpv IN (${cpvCodes.map((c) => c.replace(/-\d$/, '')).join(' ')})`);
if (countries.length) parts.push(`buyer-country IN (${countries.join(' ')})`);
if (noticeKind !== 'all') parts.push(`form-type=${noticeKind}`);
if (keywords) {
  const words = keywords.replace(/[()"~=<>]/g, ' ').split(/\s+/).filter(Boolean);
  for (const w of words) parts.push(`FT~(${w})`);
}
const query = `${parts.join(' AND ')} SORT BY publication-date DESC`;
log.info(`TED query: ${query}`);

const pick = (obj) => {
  if (!obj || typeof obj !== 'object') return obj ?? null;
  const v = obj[lang] ?? obj.eng ?? Object.values(obj)[0];
  return Array.isArray(v) ? v[0] : v ?? null;
};
const uniq = (a) => [...new Set(Array.isArray(a) ? a : a ? [a] : [])];
const day = (s) => (s ? String(s).slice(0, 10) : null);

async function fetchPage(page, limit) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, fields: FIELDS, page, limit, scope: 'ACTIVE', paginationMode: 'PAGE_NUMBER' }),
    });
    if (res.ok) return res.json();
    const text = (await res.text()).slice(0, 300);
    if (res.status >= 500 || res.status === 429) {
      if (attempt >= 4) throw new Error(`TED API ${res.status} after ${attempt} attempts: ${text}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    throw new Error(`TED API rejected the search (${res.status}): ${text}`);
  }
}

const seen = new Set(mode === 'newOnly' && existsSync(opt.state) ? JSON.parse(readFileSync(opt.state, 'utf8')) : []);
const rows = [];

let page = 1; let scanned = 0; let emitted = 0; let total = null;
const limit = Math.min(100, maxResults);
while (emitted < maxResults) {
  const data = await fetchPage(page, limit);
  total ??= data.totalNoticeCount;
  const notices = data.notices ?? [];
  if (!notices.length) break;
  const batch = [];
  for (const n of notices) {
    scanned++;
    const id = n['publication-number'];
    if (mode === 'newOnly' && seen.has(id)) continue;
    seen.add(id);
    const deadlines = uniq(n['deadline-receipt-tender-date-lot']).map(day).sort();
    const titleFull = pick(n['notice-title']);
    batch.push({
      noticeId: id,
      title: pick(n['title-proc']) ?? titleFull,
      noticeTitle: titleFull,
      publicationDate: day(n['publication-date']),
      deadline: deadlines[0] ?? null,
      buyerName: pick(n['buyer-name']),
      buyerCountry: uniq(n['buyer-country'])[0] ?? null,
      cpvCodes: uniq(n['classification-cpv']),
      contractNature: uniq(n['contract-nature'])[0] ?? null,
      procedureType: n['procedure-type'] ?? null,
      noticeType: n['notice-type'] ?? null,
      formType: n['form-type'] ?? null,
      placeOfPerformance: uniq(n['place-of-performance']).filter((p) => p.length > 3),
      estimatedValue: n['estimated-value-proc'] != null ? Number(uniq(n['estimated-value-proc'])[0]) : null,
      currency: uniq(n['estimated-value-cur-proc'])[0] ?? null,
      url: `https://ted.europa.eu/en/notice/-/detail/${id}`,
      pdfUrl: `https://ted.europa.eu/en/notice/${id}/pdf`,
    });
    if (emitted + batch.length >= maxResults) break;
  }
  rows.push(...batch);
  emitted += batch.length;
  if (notices.length < limit || page * limit >= (total ?? 0) || page >= 100) break;
  page++;
}

if (mode === 'newOnly') writeFileSync(opt.state, JSON.stringify([...seen].slice(-50000)));
log.info(`Matched ${total ?? 0} notices, scanned ${scanned}, output ${emitted} (${mode}).`);
if (opt.format === 'jsonl') { for (const r of rows) console.log(JSON.stringify(r)); }
else {
  const cols = ['noticeId', 'publicationDate', 'deadline', 'title', 'buyerName', 'buyerCountry', 'cpvCodes', 'contractNature', 'procedureType', 'estimatedValue', 'currency', 'url'];
  const q = (v) => { const t = v == null ? '' : Array.isArray(v) ? v.join(' ') : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  console.log(cols.join(','));
  for (const r of rows) console.log(cols.map((c) => q(r[c])).join(','));
}
