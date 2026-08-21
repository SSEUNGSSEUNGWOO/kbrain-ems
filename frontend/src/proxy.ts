import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLIC_PATHS = ['/lock'];
const PUBLIC_PATH_PREFIXES = [
  '/apply',
  '/survey',
  '/diagnosis',
  '/attendance',
  '/pretraining',
  '/exam',
  '/vote'
];
// /api/cron 은 Vercel Cron 이 부르는 경로다. 세션이 없으니 여기서 막으면 /lock 으로
// 리다이렉트되는데, Cron 은 리다이렉트를 따라가지 않아 그대로 실패한다(로그도 안 남는다).
// 인증은 각 라우트가 CRON_SECRET Bearer 헤더로 직접 대조한다.
const PUBLIC_API_PREFIXES = ['/api/auth', '/api/exam', '/api/cron'];

// bfcache·브라우저 캐시로 이전 응시자 정보가 남지 않게 no-store 강제.
// exam 관련 페이지·share 진입 페이지·done 페이지 전부 적용.
function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
  res.headers.set('Pragma', 'no-cache');
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p)) return NextResponse.next();
  if (PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p))) {
    const res = NextResponse.next();
    // 응시자 개인 정보(이름·응답 답변·완료 시각) 화면은 브라우저 캐시 금지
    if (pathname.startsWith('/exam')) return noStore(res);
    return res;
  }
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (pathname.startsWith('/_next') || pathname.includes('.')) return NextResponse.next();

  // Server Component에서 headers()로 현재 경로를 읽을 수 있도록 전파.
  // assistant role 라우트 가드에서 사용.
  const forwardedHeaders = new Headers(req.headers);
  forwardedHeaders.set('x-pathname', pathname);
  let response = NextResponse.next({ request: { headers: forwardedHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) req.cookies.set(name, value);
          response = NextResponse.next({ request: { headers: forwardedHeaders } });
          for (const { name, value, options } of cookiesToSet) {
            const opts = { ...options };
            delete opts.maxAge;
            delete opts.expires;
            response.cookies.set(name, value, opts);
          }
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/lock', req.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)'
  ]
};
