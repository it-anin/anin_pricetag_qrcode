-- ============================================================
-- Supabase Setup — ANIN LABEL
-- วิธีใช้: Run ก่อน import-labels.sql
-- ============================================================

-- 1. สร้าง schema
CREATE SCHEMA IF NOT EXISTS label;

-- 2. สร้างตาราง medicines
CREATE TABLE IF NOT EXISTS label.medicines (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sku        text        NOT NULL,
  usage_ref  text        NOT NULL DEFAULT '',
  barcode    text        UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sku, usage_ref)
);

-- 3. สร้างตาราง medicine_translations
CREATE TABLE IF NOT EXISTS label.medicine_translations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id  uuid        NOT NULL REFERENCES label.medicines(id) ON DELETE CASCADE,
  lang         text        NOT NULL CHECK (lang IN ('th','en','zh','ja','my','km')),
  trade_name   text,
  generic_name text,
  usage        text,
  indication   text,
  warning      text,
  storage      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (medicine_id, lang)
);

-- 4. สร้างตาราง settings (ถ้ายังไม่มี)
CREATE TABLE IF NOT EXISTS label.settings (
  id           integer     PRIMARY KEY DEFAULT 1,
  shop_name_th text,
  shop_name_en text,
  phone        text,
  line_id      text,
  logo_text    text        DEFAULT 'BIGYA',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ใส่ข้อมูล settings เริ่มต้น (แก้ไขได้ภายหลัง)
INSERT INTO label.settings (id, shop_name_th, shop_name_en, phone, line_id, logo_text)
VALUES (1, 'อนินทร์เภสัช', 'Anin Pharmacy', '', '', 'BIGYA')
ON CONFLICT (id) DO NOTHING;

-- 5. Public views (ให้ Supabase JS client อ่านได้จาก public schema)
CREATE OR REPLACE VIEW public.dl_settings               AS SELECT * FROM label.settings;
CREATE OR REPLACE VIEW public.dl_medicines              AS SELECT * FROM label.medicines;
CREATE OR REPLACE VIEW public.dl_medicine_translations  AS SELECT * FROM label.medicine_translations;

-- 6. Grant อ่าน/เขียน ให้ anon + authenticated
GRANT USAGE ON SCHEMA label TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON label.medicines             TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON label.medicine_translations TO anon, authenticated;
GRANT SELECT                  ON label.settings             TO anon, authenticated;

GRANT SELECT ON public.dl_settings              TO anon, authenticated;
GRANT SELECT ON public.dl_medicines             TO anon, authenticated;
GRANT SELECT ON public.dl_medicine_translations TO anon, authenticated;

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_medicines_sku            ON label.medicines (sku);
CREATE INDEX IF NOT EXISTS idx_medicines_sku_usage      ON label.medicines (sku, usage_ref);
CREATE INDEX IF NOT EXISTS idx_medicines_barcode        ON label.medicines (barcode);
CREATE INDEX IF NOT EXISTS idx_translations_medicine_id ON label.medicine_translations (medicine_id);
CREATE INDEX IF NOT EXISTS idx_translations_lang        ON label.medicine_translations (lang);

-- เสร็จแล้ว — รัน import-labels.sql ต่อได้เลย
