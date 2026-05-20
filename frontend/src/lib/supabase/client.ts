import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return document.cookie
            .split('; ')
            .filter(Boolean)
            .map((c) => {
              const eq = c.indexOf('=');
              return {
                name: c.slice(0, eq),
                value: decodeURIComponent(c.slice(eq + 1))
              };
            });
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            const parts = [`${name}=${encodeURIComponent(value)}`];
            parts.push(`Path=${options?.path ?? '/'}`);
            if (options?.domain) parts.push(`Domain=${options.domain}`);
            if (options?.sameSite) {
              const s = options.sameSite;
              parts.push(
                `SameSite=${typeof s === 'boolean' ? (s ? 'Strict' : 'None') : s}`
              );
            }
            if (options?.secure) parts.push('Secure');
            // maxAge / expires 의도적으로 누락 → 브라우저 종료 시 삭제되는 session cookie
            document.cookie = parts.join('; ');
          }
        }
      }
    }
  );
}
