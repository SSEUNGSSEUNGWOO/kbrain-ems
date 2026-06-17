import Providers from '@/components/layout/providers';
import { Toaster } from '@/components/ui/sonner';
import { fontVariables } from '@/components/themes/font.config';
import { DEFAULT_THEME, THEMES } from '@/components/themes/theme.config';
import { cn } from '@/lib/utils';
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import NextTopLoader from 'nextjs-toploader';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'Korus · K-Brain',
  description: 'K-Brain Korus — 교육과정 운영 SaaS',
  icons: {
    icon: '/brand/korus-symbol-color.svg'
  }
};

export const viewport: Viewport = {
  themeColor: '#FAFAF8'
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const activeThemeValue = cookieStore.get('active_theme')?.value;
  const isValidTheme = THEMES.some((t) => t.value === activeThemeValue);
  const themeToApply = isValidTheme ? activeThemeValue! : DEFAULT_THEME;

  return (
    <html lang='ko' className='light' style={{ colorScheme: 'light' }} data-theme={themeToApply}>
      <body
        className={cn(
          'bg-background overflow-x-hidden overscroll-none font-sans antialiased',
          fontVariables
        )}
      >
        <NextTopLoader color='var(--primary)' showSpinner={false} />
        <NuqsAdapter>
          <Providers activeThemeValue={themeToApply}>
            <Toaster />
            {children}
          </Providers>
        </NuqsAdapter>
      </body>
    </html>
  );
}
