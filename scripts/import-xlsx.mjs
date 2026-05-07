/**
 * node --env-file=.env.local scripts/import-xlsx.mjs product_label.xlsx
 *
 * .env.local ต้องมี:
 *   SUPABASE_URL=...
 *   SUPABASE_KEY=...   (service role key แนะนำ, หรือ anon key ก็ได้)
 */

import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

// ── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
const XLSX_FILE    = process.argv[2] ?? 'product_label.xlsx';
const BATCH        = 100;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  กำหนด SUPABASE_URL และ SUPABASE_KEY ใน .env.local ก่อน');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: 'label' },
});

// ── Sheet → lang ─────────────────────────────────────────────────────────────
const SHEET_LANG = {
  'ไทย':     'th',
  'อังกฤษ':  'en',
  'จีน':     'zh',
  'ญี่ปุ่น':  'ja',
  'พม่า':    'my',
  'กัมพูชา': 'km',
};

// ── Parse Excel ──────────────────────────────────────────────────────────────
console.log(`📂  อ่านไฟล์: ${XLSX_FILE}`);
const wb = XLSX.readFile(XLSX_FILE);

const sheets = {};
for (const [name, lang] of Object.entries(SHEET_LANG)) {
  const ws = wb.Sheets[name];
  if (!ws) { console.warn(`⚠️   ไม่พบชีท: ${name}`); continue; }
  sheets[lang] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    .slice(1).filter(r => r[0] && Number(r[0]) !== 0);
}

// ── Build medicines (source of truth = Thai) ─────────────────────────────────
const thRows = sheets['th'] ?? [];
const seenKey = new Set();
const medicines = [];
const skuRefMap = new Map();

for (const r of thRows) {
  const sku      = String(r[0]).trim();
  const usageRef = String(r[3] ?? '').trim().slice(0, 100);
  const key      = `${sku}|${usageRef}`;
  if (!seenKey.has(key)) {
    seenKey.add(key);
    medicines.push({ sku, usage_ref: usageRef, barcode: null });
    if (!skuRefMap.has(sku)) skuRefMap.set(sku, []);
    skuRefMap.get(sku).push(usageRef);
  }
}

// ── Build translations (all langs) ──────────────────────────────────────────
const trRows = [];

for (const [lang, rows] of Object.entries(sheets)) {
  const skuGroups = new Map();
  for (const r of rows) {
    const sku = String(r[0]).trim();
    if (!skuGroups.has(sku)) skuGroups.set(sku, []);
    skuGroups.get(sku).push(r);
  }

  for (const [sku, group] of skuGroups) {
    const refs = skuRefMap.get(sku);
    if (!refs) continue;

    const seen = new Set();
    const dedupGroup = group.filter(r => {
      const k = String(r[3] ?? '').trim().slice(0, 100);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const limit = Math.min(dedupGroup.length, refs.length);
    for (let i = 0; i < limit; i++) {
      const r = dedupGroup[i];
      const t = {
        sku,
        usage_ref:    refs[i],
        lang,
        trade_name:   String(r[1] ?? '').trim() || null,
        generic_name: String(r[2] ?? '').trim() || null,
        usage:        String(r[3] ?? '').trim() || null,
        indication:   String(r[4] ?? '').trim() || null,
        warning:      String(r[5] ?? '').trim() || null,
        storage:      String(r[6] ?? '').trim() || null,
      };
      if (t.trade_name || t.generic_name || t.usage || t.indication || t.warning || t.storage) {
        trRows.push(t);
      }
    }
  }
}

const seenTr = new Set();
const trDedup = trRows.filter(t => {
  const k = `${t.sku}|${t.usage_ref}|${t.lang}`;
  if (seenTr.has(k)) return false;
  seenTr.add(k);
  return true;
});

console.log(`📰  ยา: ${medicines.length} รายการ`);
console.log(`🌐  คำแปล: ${trDedup.length} แถว (${Object.keys(sheets).join(', ')})`);

// ── Helper ───────────────────────────────────────────────────────────────────
const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

const run = async (label, fn) => {
  const { error } = await fn();
  if (error) { console.error(`❌  ${label}:`, error.message); process.exit(1); }
};

// ── Step 1: Clear existing data ──────────────────────────────────────────────
console.log('\n🗑️   ล้างข้อมูลเก่า...');
await run('ลบ translations', () =>
  supabase.from('medicine_translations').delete().neq('id', '00000000-0000-0000-0000-000000000000')
);
await run('ลบ medicines', () =>
  supabase.from('medicines').delete().neq('id', '00000000-0000-0000-0000-000000000000')
);
console.log('   ✓ ล้างแล้ว');

// ── Step 2: Insert medicines ──────────────────────────────────────────────────
console.log('\n💉  เพิ่มรายการยา...');
for (const batch of chunks(medicines, BATCH)) {
  await run('insert medicines', () => supabase.from('medicines').insert(batch));
  process.stdout.write('.');
}
console.log(` ✓ ${medicines.length} รายการ`);

// ── Step 3: Fetch medicine IDs ────────────────────────────────────────────────
console.log('\n🔍  โหลด medicine IDs...');
const { data: medRows, error: fetchErr } = await supabase
  .from('medicines').select('id, sku, usage_ref').limit(10000);
if (fetchErr) { console.error('❌  fetch medicines:', fetchErr.message); process.exit(1); }

const medIdMap = new Map();
for (const m of medRows) medIdMap.set(`${m.sku}|${m.usage_ref}`, m.id);
console.log(`   ✓ โหลด ${medRows.length} IDs`);

// ── Step 4: Insert translations ───────────────────────────────────────────────
const trWithId = trDedup.flatMap(t => {
  const id = medIdMap.get(`${t.sku}|${t.usage_ref}`);
  if (!id) return [];
  return [{ medicine_id: id, lang: t.lang, trade_name: t.trade_name,
            generic_name: t.generic_name, usage: t.usage,
            indication: t.indication, warning: t.warning, storage: t.storage }];
});

console.log(`\n🌐  เพิ่มคำแปล ${trWithId.length} แถว...`);
for (const batch of chunks(trWithId, BATCH)) {
  await run('insert translations', () => supabase.from('medicine_translations').insert(batch));
  process.stdout.write('.');
}
console.log(` ✓ ${trWithId.length} แถว`);

console.log('\n✅  Import เสร็จสมบูรณ์!');
