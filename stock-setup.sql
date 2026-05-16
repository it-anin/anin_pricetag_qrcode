-- สร้างตาราง stock สำหรับเช็คสต๊อค
CREATE TABLE IF NOT EXISTS stock (
  id          bigserial   PRIMARY KEY,
  branch      text        NOT NULL,
  sku         text        NOT NULL,
  name        text,
  qty         text,
  unit        text,
  price       text,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

-- เปิด RLS
ALTER TABLE stock ENABLE ROW LEVEL SECURITY;

-- อนุญาต read/write สาธารณะ
CREATE POLICY "public read stock"  ON stock FOR SELECT USING (true);
CREATE POLICY "public write stock" ON stock FOR ALL    USING (true);
