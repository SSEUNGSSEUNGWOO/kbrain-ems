import { cn } from '@/lib/utils';
import Image from 'next/image';

type Variant = 'color' | 'white' | 'mono';

type Props = {
  variant?: Variant;
  size?: number;
  withWordmark?: boolean;
  endorsed?: boolean; // 'by K-Brain' endorser 노출
  className?: string;
};

/**
 * Korus 로고. 심볼 단독 / 워드마크 결합 / K-Brain endorser 옵션.
 * 자산은 public/brand/ 의 SVG.
 */
export function Logo({
  variant = 'color',
  size = 28,
  withWordmark = true,
  endorsed = false,
  className
}: Props) {
  const src =
    variant === 'white'
      ? '/brand/korus-symbol-white.svg'
      : variant === 'mono'
        ? '/brand/korus-symbol-mono.svg'
        : '/brand/korus-symbol-color.svg';

  const wordmarkColor =
    variant === 'white' || variant === 'mono'
      ? 'currentColor'
      : 'var(--foreground)';

  return (
    <div className={cn('inline-flex items-center', className)}>
      <Image
        src={src}
        alt='Korus'
        width={size}
        height={size}
        priority
        unoptimized
      />
      {withWordmark && (
        <div className='ml-2.5 flex flex-col leading-none'>
          <span
            className='font-bold tracking-[-0.03em]'
            style={{ color: wordmarkColor, fontSize: size * 0.7 }}
          >
            Korus
          </span>
          {endorsed && (
            <span
              className='font-mono text-[10px] uppercase tracking-[0.08em] opacity-70'
              style={{ marginTop: 2 }}
            >
              by K-Brain
            </span>
          )}
        </div>
      )}
    </div>
  );
}
