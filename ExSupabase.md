# ExSupabase — โครงสร้างข้อมูลสินค้า (ยา) ใน Supabase

โปรเจกต์นี้ใช้ **Supabase** เป็นฐานข้อมูลและ backend ข้อมูลทั้งหมดอยู่ใน schema ชื่อ `label`

---

## Schema Overview

```
label
├── medicines              — ข้อมูลหลักของยา (SKU, Barcode)
├── medicine_translations  — ข้อมูลฉลากแยกตามภาษา
└── settings               — ข้อมูลร้าน (ชื่อ, เบอร์, LINE)
```

---

## ตาราง `label.medicines`

เก็บข้อมูล identity ของยาแต่ละรายการ ไม่มีข้อความที่ขึ้นอยู่กับภาษา

| Column | Type | ข้อกำหนด | คำอธิบาย |
|--------|------|-----------|-----------|
| `id` | uuid | PRIMARY KEY, default gen_random_uuid() | รหัสอ้างอิงภายใน |
| `sku` | text | NOT NULL | รหัสสินค้า |
| `trade_name_ref` | text | NOT NULL, default `''` | ชื่อการค้า (ไทย) ใช้เป็น dedup key |
| `barcode` | text | UNIQUE | บาร์โค้ด |
| `created_at` | timestamptz | NOT NULL, default now() | วันที่สร้าง |
| `updated_at` | timestamptz | NOT NULL, default now() | วันที่แก้ไขล่าสุด |

**Unique Constraint:** `UNIQUE(sku, trade_name_ref)`
— ยา 1 SKU สามารถมีได้หลายขนาด โดยใช้ `trade_name_ref` แยกความต่าง

**Indexes:**
- `(sku)` — สำหรับค้นหาด้วยรหัสสินค้า
- `(barcode)` — สำหรับสแกนบาร์โค้ด

---

## ตาราง `label.medicine_translations`

เก็บข้อความบนฉลากแยกตามภาษา — 1 ยา × 1 ภาษา = 1 แถว

| Column | Type | ข้อกำหนด | คำอธิบาย |
|--------|------|-----------|-----------|
| `id` | uuid | PRIMARY KEY | รหัสอ้างอิง |
| `medicine_id` | uuid | NOT NULL, FK → medicines(id) ON DELETE CASCADE | อ้างอิงยา |
| `lang` | text | NOT NULL, CHECK in ('th','en','zh','ja','my','km') | รหัสภาษา |
| `trade_name` | text | — | ชื่อการค้า |
| `generic_name` | text | — | ชื่อสามัญทางยา |
| `usage` | text | — | วิธีใช้ |
| `indication` | text | — | ข้อบ่งใช้ |
| `warning` | text | — | ข้อควรระวัง |
| `storage` | text | — | การเก็บรักษา |
| `created_at` | timestamptz | NOT NULL, default now() | วันที่สร้าง |
| `updated_at` | timestamptz | NOT NULL, default now() | วันที่แก้ไขล่าสุด |

**Unique Constraint:** `UNIQUE(medicine_id, lang)`
— ยา 1 รายการมีการแปลภาษาละ 1 แถวเท่านั้น

**Indexes:**
- `(medicine_id)` — join กับ medicines
- `(lang)` — filter ตามภาษา
- `trade_name` GIN trigram — full-text search ชื่อการค้า
- `generic_name` GIN trigram — full-text search ชื่อสามัญ

---

## ตาราง `label.settings`

เก็บข้อมูลร้านสำหรับพิมพ์บนฉลาก — มีแถวเดียว (id = 1)

| Column | Type | คำอธิบาย |
|--------|------|-----------|
| `id` | integer | PRIMARY KEY, ค่าเดียวคือ 1 |
| `shop_name_th` | text | ชื่อร้านภาษาไทย |
| `shop_name_en` | text | ชื่อร้านภาษาอังกฤษ |
| `phone` | text | เบอร์โทรศัพท์ |
| `line_id` | text | LINE ID |
| `logo_text` | text | ข้อความ logo (default: BIGYA) |
| `updated_at` | timestamptz | วันที่แก้ไขล่าสุด |

---

## ความสัมพันธ์ระหว่างตาราง

```
medicines (1) ──────────── (N) medicine_translations
   id  ◄──────────────────── medicine_id
                              lang: th / en / zh / ja / my / km
```

**ตัวอย่างข้อมูล 1 ยา (พาราเซตามอล):**

```
medicines:
  id: "abc-123"
  sku: "PARA500"
  trade_name_ref: "พาราเซตามอล 500 mg"
  barcode: "885112345678"

medicine_translations:
  medicine_id: "abc-123", lang: "th" → trade_name: "พาราเซตามอล 500 mg", usage: "ทานครั้งละ 1-2 เม็ด..."
  medicine_id: "abc-123", lang: "en" → trade_name: "Paracetamol 500 mg", usage: "Take 1-2 tablets..."
  medicine_id: "abc-123", lang: "zh" → trade_name: "对乙酰氨基酚 500 mg", ...
  ...
```

---

## RLS (Row Level Security)

| ตาราง | anon อ่าน | anon เพิ่ม | anon แก้ไข |
|-------|-----------|-----------|-----------|
| `medicines` | ✅ | ✅ | ✅ |
| `medicine_translations` | ✅ | ✅ | ✅ |
| `settings` | ✅ | ❌ | ❌ |

> ระบบนี้เป็น internal tool ของร้านยา จึงเปิดให้ anon เขียนได้โดยไม่ต้อง login
> หากต้องการความปลอดภัยเพิ่มเติมให้เพิ่ม Auth ภายหลัง

---

## วิธีที่ JS Client เรียกข้อมูล

**ค้นหายา (ด้วย SKU หรือ Barcode):**
```ts
supabase.from('medicines').select('id, sku, barcode')
  .or(`sku.eq.${q},barcode.eq.${q}`)
```

**ดึงการแปลภาษา:**
```ts
supabase.from('medicine_translations')
  .select('medicine_id, trade_name, generic_name, usage, indication, warning, storage')
  .in('medicine_id', ids)
  .eq('lang', 'th')
```

**Fuzzy search ชื่อยา:**
```ts
supabase.from('medicine_translations')
  .select('medicine_id')
  .or(`trade_name.ilike.%${q}%,generic_name.ilike.%${q}%`)
```

**บันทึกยาใหม่ (upsert):**
```ts
supabase.from('medicines')
  .upsert({ sku, barcode, trade_name_ref: '' }, { onConflict: 'sku,trade_name_ref' })

supabase.from('medicine_translations')
  .upsert(rows, { onConflict: 'medicine_id,lang' })
```

---

## ไฟล์ SQL ในโปรเจกต์

| ไฟล์ | ใช้เมื่อไหร่ |
|------|-------------|
| `supabase-schema.sql` | v1 (เก่า) — ตาราง medicines แบบ single-language |
| `supabase-schema-v2.sql` | v2 (เก่า) — แยก medicines + medicine_translations |
| `supabase-schema-v3.sql` | **v3 (ปัจจุบัน)** — รองรับหลาย SKU ต่างขนาด |
| `supabase-write-policy.sql` | เพิ่ม insert/update สำหรับ anon (ถ้า run schema v1/v2) |

> **ใช้เฉพาะ `supabase-schema-v3.sql`** สำหรับ deploy ใหม่

---

## การ Expose Schema ให้ JS Client เข้าถึงได้

Supabase Dashboard → **Project Settings → API → Exposed schemas**
เพิ่ม `label` เข้าไปใน list (นอกจาก `public` ที่มีอยู่แล้ว)
