import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder";

if (supabaseUrl === "https://placeholder.supabase.co") {
  console.warn("Supabase 환경 변수가 설정되지 않았습니다. 이미지 업로드 기능이 작동하지 않을 수 있습니다.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
