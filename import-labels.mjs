import XLSX from 'xlsx';
import { writeFileSync } from 'fs';

const esc = v => String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "''");
const sqlStr = v => {
  const s = String(v ?? '').trim();
  return s === '' || s === '-' ? 'NULL' : `'${esc(s)}'`;
};
const sqlRef = v => `'${esc(String(v ?? '').trim().slice(0, 100))}'`;

const SHEET_LANG = {
  'ไทย':     'th',
  'อังกฤษ':  'en',
  'จีน':     'zh',
  'ญี่ปุ่น':  'ja',
  'พม่า':    'my',
  'กัมพูชา': 'km',
};

const wb = XLSX.readFile('product_label.xlsx');

// อ่านทุกชีท
const sheets = {};
for (const [name, lang] of Object.entries(SHEET_LANG)) {
  const ws = wb.Sheets[name];
  if (!ws) { console.warn(`ไม่พบชีท: ${name}`); continue; }
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    .slice(1).filter(r => r[0] && Number(r[0]) !== 0);
  sheets[lang] = rows;
}

// ===== Step 1: สร้าง medicines จากชีทไทย (source of truth) =====
const thRows = sheets['th'];
const seenKey = new Set();
const medicines = []; // { sku, usage_ref, row }

for (const r of thRows) {
  const sku      = String(r[0]).trim();
  const usageRef = String(r[3] ?? '').trim().slice(0, 100);
  const key      = sku + '|' + usageRef;
  if (!seenKey.has(key)) {
    seenKey.add(key);
    medicines.push({ sku, usage_ref: usageRef });
  }
}

// sku → [usage_ref...] (ตามลำดับ) สำหรับจับคู่ชีทอื่น
const skuRefMap = new Map(); // sku → [usage_ref, ...]
for (const { sku, usage_ref } of medicines) {
  if (!skuRefMap.has(sku)) skuRefMap.set(sku, []);
  skuRefMap.get(sku).push(usage_ref);
}

// ===== Step 2: สร้าง translations ทุกภาษา =====
const trRows = []; // { sku, usage_ref, lang, trade_name, generic_name, usage, indication, warning, storage }

for (const [lang, rows] of Object.entries(sheets)) {
  // จัดกลุ่มแถวตาม SKU (เพื่อจับคู่ตำแหน่ง)
  const skuGroups = new Map();
  for (const r of rows) {
    const sku = String(r[0]).trim();
    if (!skuGroups.has(sku)) skuGroups.set(sku, []);
    skuGroups.get(sku).push(r);
  }

  for (const [sku, group] of skuGroups) {
    const refs = skuRefMap.get(sku);
    if (!refs) continue; // SKU ในชีทนี้ไม่มีในชีทไทย → ข้าม

    // dedup ภายในกลุ่ม SKU ของชีทนี้ก่อน
    const seen = new Set();
    const dedupGroup = group.filter(r => {
      const k = String(r[3] ?? '').trim().slice(0, 100);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // จับคู่ตำแหน่ง: row i ↔ usage_ref[i]
    const limit = Math.min(dedupGroup.length, refs.length);
    for (let i = 0; i < limit; i++) {
      const r        = dedupGroup[i];
      const usageRef = refs[i]; // ใช้ usage_ref จากชีทไทยเสมอ
      trRows.push({
        sku, usage_ref: usageRef, lang,
        trade_name:   String(r[1] ?? '').trim(),
        generic_name: String(r[2] ?? '').trim(),
        usage:        String(r[3] ?? '').trim(),
        indication:   String(r[4] ?? '').trim(),
        warning:      String(r[5] ?? '').trim(),
        storage:      String(r[6] ?? '').trim(),
      });
    }
  }
}

// กรองแถวที่มีข้อมูลจริงอย่างน้อย 1 field
const trFiltered = trRows.filter(t =>
  t.trade_name || t.generic_name || t.usage || t.indication || t.warning || t.storage
);

// Dedup translations (sku, usage_ref, lang)
const seenTr = new Set();
const trDedup = trFiltered.filter(t => {
  const k = `${t.sku}|${t.usage_ref}|${t.lang}`;
  if (seenTr.has(k)) return false;
  seenTr.add(k);
  return true;
});

console.log(`ยา: ${medicines.length} รายการ`);
console.log(`คำแปล: ${trDedup.length} แถว (${Object.keys(sheets).join(', ')})`);

// ===== Generate SQL =====
const medValues = medicines.map(m =>
  `  (${sqlStr(m.sku)}, ${sqlRef(m.usage_ref)}, NULL)`
).join(',\n');

const trValues = trDedup.map(t =>
  `  (${sqlStr(t.sku)}, ${sqlRef(t.usage_ref)}, '${t.lang}', ${sqlStr(t.trade_name)}, ${sqlStr(t.generic_name)}, ${sqlStr(t.usage)}, ${sqlStr(t.indication)}, ${sqlStr(t.warning)}, ${sqlStr(t.storage)})`
).join(',\n');

const sql = `-- ============================================================
-- Import product_label.xlsx → label schema (ทุก 6 ภาษา)
-- วิธีใช้: วาง SQL นี้ใน Supabase SQL Editor แล้วกด Run
-- หมายเหตุ: รัน alter-medicines-v2.sql ก่อนถ้ายังไม่ได้รัน
-- ============================================================

-- Step 1: Insert medicines (sku + usage_ref unique)
INSERT INTO label.medicines (sku, usage_ref, barcode)
VALUES
${medValues}
ON CONFLICT (sku, usage_ref) DO NOTHING;

-- Step 2: Insert translations (ทุกภาษา)
INSERT INTO label.medicine_translations
  (medicine_id, lang, trade_name, generic_name, usage, indication, warning, storage)
SELECT m.id, d.lang, d.trade_name, d.generic_name, d.usage, d.indication, d.warning, d.storage
FROM (VALUES
${trValues}
) AS d(sku, usage_ref, lang, trade_name, generic_name, usage, indication, warning, storage)
JOIN label.medicines m ON m.sku = d.sku AND m.usage_ref = d.usage_ref
ON CONFLICT (medicine_id, lang) DO UPDATE SET
  trade_name   = EXCLUDED.trade_name,
  generic_name = EXCLUDED.generic_name,
  usage        = EXCLUDED.usage,
  indication   = EXCLUDED.indication,
  warning      = EXCLUDED.warning,
  storage      = EXCLUDED.storage;
`;

writeFileSync('import-labels.sql', sql, 'utf8');
console.log(`✅ สร้างไฟล์ import-labels.sql สำเร็จ`);
