# AI Translation — โครงสร้าง Code

ระบบแปลภาษาอัตโนมัติสำหรับฉลากยา ใช้ Groq API (LLaMA 3.3 70B) ผ่าน Supabase Edge Function

---

## ภาพรวม Flow

```
ผู้ใช้กด "✨ แปลอัตโนมัติ"
        │
        ▼
AddMedicineModal.tsx
  handleAutoTranslate()
        │
        ▼
src/lib/translate.ts
  translateMedicineLabel()
        │  เรียกผ่าน Supabase JS Client
        ▼
supabase/functions/translate-medicine/index.ts
  (Deno Edge Function)
        │  เรียก Groq API
        ▼
Groq — LLaMA 3.3 70B
  แปลข้อมูลฉลากยาทั้งหมดในครั้งเดียว (1 request / 5 ภาษา)
        │
        ▼
ผลลัพธ์กลับมาแสดงในฟอร์มแต่ละ tab ภาษา
```

---

## ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | บทบาท |
|------|--------|
| `src/lib/translate.ts` | ฟังก์ชัน client-side สำหรับเรียก translation |
| `supabase/functions/translate-medicine/index.ts` | Edge Function — รับ request, เรียก Groq, คืน JSON |
| `src/components/AddMedicineModal.tsx` | UI — ปุ่มแปล, แสดงผล, จัดการ error |
| `src/types/index.ts` | type `Lang` และ `LANGS` ที่ใช้ร่วมกัน |

---

## 1. `src/lib/translate.ts`

ไฟล์หลักสำหรับ AI translation ฝั่ง client

### Types

```ts
interface MedicineLabelFields {
  trade_name: string;
  generic_name: string;
  usage: string;
  indication: string;
  warning: string;
  storage: string;
}

type TranslationResult = Record<Lang, MedicineLabelFields>;
```

### ฟังก์ชัน

**`translateMedicineLabel(sourceLang, fields, targetLangs)`**
- รับข้อมูลฉลากภาษาต้นทาง และ list ภาษาปลายทาง
- เรียก Supabase Edge Function `translate-medicine`
- คืน `TranslationResult` หรือ throw Error พร้อมข้อความภาษาไทย

**`getTargetLangs(sourceLang)`**
- คืนทุกภาษาที่รองรับ ยกเว้นภาษาต้นทาง
- ใช้เพื่อส่งเป็น `targetLangs` ใน `translateMedicineLabel()`

---

## 2. `supabase/functions/translate-medicine/index.ts`

Deno Edge Function ที่ deploy บน Supabase

### Input (POST body)

```json
{
  "source_lang": "th",
  "fields": {
    "trade_name": "พาราเซตามอล 500 mg",
    "generic_name": "Paracetamol",
    "usage": "ทานครั้งละ 1-2 เม็ด ทุก 4-6 ชั่วโมง",
    "indication": "บรรเทาปวด ลดไข้",
    "warning": "ห้ามใช้เกินวันละ 8 เม็ด",
    "storage": "เก็บในที่แห้ง อุณหภูมิต่ำกว่า 30 องศา"
  },
  "target_langs": ["en", "zh", "ja", "my", "km"]
}
```

### Output (JSON)

```json
{
  "en": { "trade_name": "...", "generic_name": "...", ... },
  "zh": { "trade_name": "...", "generic_name": "...", ... },
  "ja": { ... },
  "my": { ... },
  "km": { ... }
}
```

### การทำงานภายใน

1. รับ request และ validate body
2. อ่าน `GROQ_API_KEY` จาก Supabase secrets
3. สร้าง prompt ที่ระบุ: ภาษาต้นทาง, ข้อมูลฉลาก, ภาษาปลายทาง
4. ส่งไปยัง `https://api.groq.com/openai/v1/chat/completions`
   - Model: `llama-3.3-70b-versatile`
   - Temperature: `0.2` (คงที่, ลด hallucination)
   - Max tokens: `2048`
5. Strip markdown code fence ออกจาก response (ถ้ามี)
6. Parse JSON และ normalize ให้ครบทุก field
7. คืน JSON ไปยัง client

### Environment Variable ที่ต้องตั้ง

| ตัวแปร | ที่ตั้ง |
|--------|---------|
| `GROQ_API_KEY` | Supabase Dashboard → Edge Functions → Secrets |

---

## 3. `src/components/AddMedicineModal.tsx`

### `handleAutoTranslate()`

```
1. เช็คว่ากรอก trade_name ในแท็บที่เลือกแล้ว
2. เรียก translateMedicineLabel() จาก src/lib/translate.ts
3. เมื่อสำเร็จ — อัปเดต form.translations ทุกภาษา
4. เมื่อ error — แสดงข้อความ error ใต้ปุ่มแปล
```

---

## ภาษาที่รองรับ

| Code | ภาษา |
|------|------|
| `th` | ภาษาไทย |
| `en` | English |
| `zh` | 中文 (Simplified Chinese) |
| `ja` | 日本語 |
| `my` | မြန်မာ (Burmese) |
| `km` | ខ្មែរ (Khmer) |

---

## การเพิ่มภาษาใหม่

1. เพิ่ม code ใน `Lang` type — `src/types/index.ts`
2. เพิ่มใน `LANGS` array — `src/types/index.ts`
3. เพิ่มใน `LANG_NAMES` — `supabase/functions/translate-medicine/index.ts`
4. อัปเดต `check` constraint ใน Supabase SQL:
   ```sql
   ALTER TABLE label.medicine_translations
     DROP CONSTRAINT medicine_translations_lang_check;
   ALTER TABLE label.medicine_translations
     ADD CONSTRAINT medicine_translations_lang_check
     CHECK (lang IN ('th','en','zh','ja','my','km','NEW_CODE'));
   ```
