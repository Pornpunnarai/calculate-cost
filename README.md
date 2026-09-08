# คิดต้นทุนเมนู

## ตั้งค่า Supabase

1. สร้างโปรเจกต์ใหม่ที่ https://supabase.com
2. เปิด SQL Editor แล้วรันไฟล์ `supabase/migrations/20260908000000_init.sql`
3. คัดลอก Project URL และ anon key
4. สร้าง `.env.local` จาก `.env.example` แล้วใส่ค่าจริง

## รันบนเครื่อง

```bash
npm install
npm test
npm run dev
```

เปิด http://localhost:3000

## Deploy บน Netlify

ไฟล์ `netlify.toml` กำหนด build command และ Next.js runtime ให้แล้ว

1. เชื่อม Git repo กับ Netlify
2. Build command: `npm run build`
3. ใส่ `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_ANON_KEY` ใน Site environment variables
