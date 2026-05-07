-- ============================================================
-- สร้าง RPC function สำหรับ import-xlsx.mjs
-- รันครั้งเดียวใน Supabase SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION public.import_label_data(
  p_medicines    jsonb,
  p_translations jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER   -- รันในสิทธิ์ DB owner → เขียน label.* ได้เลย
AS $$
DECLARE
  med        jsonb;
  tr         jsonb;
  med_id     uuid;
  med_count  int := 0;
  tr_count   int := 0;
BEGIN
  SET LOCAL row_security = off;   -- bypass RLS ภายใน function นี้

  -- ล้างข้อมูลเก่า (ต้อง truncate พร้อมกันเพื่อข้าม FK constraint)
  TRUNCATE label.medicine_translations, label.medicines;

  -- Insert medicines
  FOR med IN SELECT * FROM jsonb_array_elements(p_medicines) LOOP
    INSERT INTO label.medicines (sku, usage_ref, barcode)
    VALUES (med->>'sku', med->>'usage_ref', NULL)
    ON CONFLICT (sku, usage_ref) DO NOTHING;
    med_count := med_count + 1;
  END LOOP;

  -- Insert translations
  FOR tr IN SELECT * FROM jsonb_array_elements(p_translations) LOOP
    SELECT id INTO med_id
    FROM label.medicines
    WHERE sku = tr->>'sku' AND usage_ref = tr->>'usage_ref';

    IF med_id IS NOT NULL THEN
      INSERT INTO label.medicine_translations (
        medicine_id, lang,
        trade_name, generic_name, usage, indication, warning, storage
      ) VALUES (
        med_id, tr->>'lang',
        NULLIF(tr->>'trade_name',   ''),
        NULLIF(tr->>'generic_name', ''),
        NULLIF(tr->>'usage',        ''),
        NULLIF(tr->>'indication',   ''),
        NULLIF(tr->>'warning',      ''),
        NULLIF(tr->>'storage',      '')
      );
      tr_count := tr_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('medicines', med_count, 'translations', tr_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_label_data(jsonb, jsonb) TO anon, authenticated;
