import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from './types';

/**
 * Server Component / Server Action에서 사용. anon key + 쿠키 기반 세션.
 * 향후 Supabase Auth 도입 시 RLS 정책이 이 클라이언트에 적용된다.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component에서 set 호출하면 throw — 미들웨어에서 처리되므로 무시.
          }
        }
      }
    }
  );
}

/**
 * RLS를 우회하는 admin client. service_role 키 사용.
 * 절대 클라이언트 번들에 노출되면 안 됨. server-only 모듈에서만 import.
 * 운영자 인증이 도입되기 전까지는 운영자 페이지·공개 페이지 모두 이 클라이언트로 동작.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
}
