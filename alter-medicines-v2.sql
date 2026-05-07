-- ============================================================
-- Migration: เพิ่ม usage_ref เพื่อรองรับ SKU ซ้ำ (ต่างขนาด/dose)
-- วิธีใช้: รันใน Supabase SQL Editor ก่อน import-labels.sql ใหม่
-- ============================================================

-- 1. เพิ่มคอลัมน์ usage_ref (ใช้เป็น dedup key สำหรับ variant เดียวกัน SKU)
ALTER TABLE label.medicines
  ADD COLUMN IF NOT EXISTS usage_ref text NOT NULL DEFAULT '';

-- 2. ลบ UNIQUE constraint เดิมบน sku อย่างเดียว
ALTER TABLE label.medicines
  DROP CONSTRAINT IF EXISTS medicines_sku_key;

-- 3. เพิ่ม composite UNIQUE(sku, usage_ref) แทน
ALTER TABLE label.medicines
  ADD CONSTRAINT medicines_sku_usage_ref_key UNIQUE (sku, usage_ref);

-- 4. ล้างข้อมูลเดิม (translations cascade ลบตาม)
DELETE FROM label.medicine_translations;
DELETE FROM label.medicines;

-- เสร็จแล้ว — รัน import-labels.sql ต่อได้เลย
