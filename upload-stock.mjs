/**
 * upload-stock.mjs
 * อ่านไฟล์ All_stock.csv แล้วอัพโหลดข้อมูลสต๊อคเข้า Supabase
 * รันโดย: node upload-stock.mjs
 * ตั้งเวลา: Task Scheduler ทุก 5 นาที
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';

// ─── CONFIG ───────────────────────────────────────────────
// แก้ CSV_PATH ให้ตรงกับ network path ของเครื่อง POS
// Windows network path รูปแบบ: \\PCNAME\Users\Username\Documents\update_stock\All_stock.csv
const CSV_PATH = '\\\\PCNAME\\Users\\Username\\Documents\\update_stock\\All_stock.csv';

const SUPABASE_URL = 'https://eogqnedbdpjuptwlqudn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvZ3FuZWRiZHBqdXB0d2xxdWRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTc5MzUsImV4cCI6MjA5MTM5MzkzNX0.M9g4iCV7T0xoWdStNO4DNiT15m5dsEWcKc3ZV1TMlhE';
// ──────────────────────────────────────────────────────────

const BRANCH_MAP = {
  'warehouse':   'คลังสินค้า',
  'front store': 'SRC',
  'main kkl':    'KKL',
  'main sss':    'SSS',
};

function mapBranch(raw) {
  return BRANCH_MAP[raw.toLowerCase().trim()] ?? null;
}

function parseCSV(text) {
  const lines = [];
  let field = '', row = [], inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuote = false;
      else field += ch;
    } else {
      if (ch === '"' && field === '') { inQuote = true; }  // เริ่ม quoted field เฉพาะตอนเริ่มฟิลด์
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); lines.push(row); row = []; field = ''; }
      else if (ch !== '\r') field += ch;
    }
  }
  if (field || row.length) { row.push(field); lines.push(row); }
  return lines;
}

async function main() {
  const timestamp = new Date().toLocaleString('th-TH');
  console.log(`[${timestamp}] เริ่มต้นอัพโหลดสต๊อค...`);

  // ตรวจสอบไฟล์
  if (!existsSync(CSV_PATH)) {
    console.error(`❌ ไม่พบไฟล์: ${CSV_PATH}`);
    process.exit(1);
  }

  // อ่านและ parse CSV
  const text = readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCSV(text);
  console.log(`   อ่านได้ ${rows.length - 1} แถว (ไม่นับ header)`);

  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 5) continue;

    const rawBranch = row[3]?.trim() || '';
    const branch = mapBranch(rawBranch);
    if (!branch) continue;

    const sku = row[4]?.trim() || '';
    if (!sku) continue;

    items.push({
      branch,
      sku,
      name:  (row[5]?.trim() || '').split(/[\r\n]/)[0].trim(),
      qty:    row[6]?.trim() || '',
      unit:   row[7]?.trim() || '',
      price:  row[8]?.trim() || '',
    });
  }

  if (items.length === 0) {
    const colDValues = [...new Set(rows.slice(1).map(r => r[3]?.trim()).filter(Boolean))].slice(0, 5);
    console.error(`❌ ไม่พบข้อมูล — ค่าใน ColD ที่พบ: ${colDValues.join(', ')}`);
    process.exit(1);
  }

  console.log(`   พบสินค้า ${items.length} รายการ กำลังอัพโหลด...`);

  // อัพโหลด Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { error: delErr } = await supabase.from('stock').delete().neq('id', 0);
  if (delErr) { console.error('❌ ลบข้อมูลเก่าไม่สำเร็จ:', delErr.message); process.exit(1); }

  const CHUNK = 500;
  for (let i = 0; i < items.length; i += CHUNK) {
    const { error } = await supabase.from('stock').insert(items.slice(i, i + CHUNK));
    if (error) { console.error('❌ insert ไม่สำเร็จ:', error.message); process.exit(1); }
  }

  console.log(`✅ อัพโหลดสำเร็จ ${items.length} รายการ`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
