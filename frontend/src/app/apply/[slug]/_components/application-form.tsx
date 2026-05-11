'use client';

import { useState, useTransition } from 'react';
import { submitApplication } from '../_actions';

type Props = {
  slug: string;
  cohortName: string;
  applicationEndAt: string | null;
};

export function ApplicationForm({ slug, cohortName, applicationEndAt }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    birthDate: '',
    organizationName: '',
    department: '',
    jobTitle: '',
    jobRole: ''
  });
  const [file, setFile] = useState<File | null>(null);

  const [agreed, setAgreed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const update = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  const PHONE_RE = /^(01[016789])-(\d{3,4})-(\d{4})$/;

  /** 입력하는 순간 숫자만 뽑아서 010-XXXX-XXXX 형태로 자동 포맷 */
  const formatPhone = (input: string): string => {
    const digits = input.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  };

  // 1단계: 제출 누르면 클라이언트 검증 + 확인 모달 열기
  const handlePreflight = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!agreed) return setError('상단 안내사항 확인 체크가 필요합니다.');
    if (!form.name.trim()) return setError('이름을 입력해주세요.');
    if (!form.email.trim() || !EMAIL_RE.test(form.email.trim())) {
      return setError('올바른 이메일 주소를 입력해주세요.');
    }
    if (!PHONE_RE.test(form.phone)) {
      return setError('올바른 휴대전화 번호를 입력해주세요. (예: 010-1234-5678)');
    }
    if (!form.organizationName.trim()) return setError('소속 기관을 입력해주세요.');
    if (!file) return setError('지원서 PDF 파일을 첨부해주세요.');
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return setError('PDF 파일만 업로드 가능합니다.');
    }
    if (file.size > 10 * 1024 * 1024) {
      return setError('파일 크기는 10MB 이하여야 합니다.');
    }

    setConfirming(true);
  };

  // 2단계: 모달에서 "맞습니다" 누르면 실제 제출
  const handleConfirmedSubmit = () => {
    if (!file) {
      setError('지원서 PDF 파일을 첨부해주세요.');
      setConfirming(false);
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.append('slug', slug);
      fd.append('name', form.name);
      fd.append('email', form.email);
      fd.append('phone', form.phone);
      fd.append('birthDate', form.birthDate);
      fd.append('organizationName', form.organizationName);
      fd.append('department', form.department);
      fd.append('jobTitle', form.jobTitle);
      fd.append('jobRole', form.jobRole);
      fd.append('applicationFile', file);

      const result = await submitApplication(fd);
      if (result && 'error' in result) {
        setError(result.error);
        setConfirming(false);
      }
    });
  };

  return (
    <form onSubmit={handlePreflight} className='space-y-5'>
      <header className='rounded-2xl border bg-white px-7 py-6 shadow-sm'>
        <div className='mb-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400'>
          {cohortName}
        </div>
        <h1 className='text-xl font-bold text-slate-900'>교육 신청</h1>
        <p className='mt-2 text-sm text-slate-500'>
          아래 정보를 입력해 주세요. <span className='text-red-500'>*</span> 표시는 필수입니다.
        </p>
        {applicationEndAt && (
          <p className='mt-1 text-xs text-slate-400'>모집 마감: {applicationEndAt}</p>
        )}
      </header>

      {/* 안내·동의 카드 */}
      <div className='rounded-2xl border border-amber-200 bg-amber-50/60 px-6 py-5 shadow-sm'>
        <div className='mb-3 flex items-center gap-2'>
          <span className='text-amber-600'>⚠️</span>
          <h2 className='text-sm font-bold text-amber-900'>신청 전 반드시 확인해 주세요</h2>
        </div>
        <ul className='space-y-1.5 text-[13px] leading-relaxed text-amber-900'>
          <li>· 입력하신 정보(이름·연락처·소속 등)의 <strong>오탈자에 대한 책임은 신청자 본인</strong>에게 있습니다.</li>
          <li>· <strong>한 번 제출하면 수정·취소할 수 없습니다.</strong></li>
          <li>· 동일 이메일·전화번호로는 <strong>같은 기수에 한 번만 신청 가능</strong>합니다 (중복 제출 차단).</li>
          <li>· 첨부 PDF는 합격 검토 자료로만 사용됩니다.</li>
        </ul>
        <label className='mt-4 flex cursor-pointer items-start gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2.5'>
          <input
            type='checkbox'
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className='mt-0.5 h-4 w-4 cursor-pointer accent-amber-600'
          />
          <span className='text-[13px] font-semibold text-amber-900'>
            위 내용을 모두 확인했으며 동의합니다.
          </span>
        </label>
      </div>

      <Section title='기본 정보'>
        <Field label='이름' required>
          <input
            type='text'
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            required
            className='input'
          />
        </Field>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          <Field label='이메일' required>
            <input
              type='email'
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              required
              placeholder='hong@example.com'
              className='input'
            />
          </Field>
          <Field label='휴대전화' required>
            <input
              type='tel'
              inputMode='numeric'
              value={form.phone}
              onChange={(e) => update('phone', formatPhone(e.target.value))}
              required
              placeholder='010-1234-5678'
              maxLength={13}
              className='input'
            />
          </Field>
        </div>
        <Field label='생년월일'>
          <input
            type='date'
            value={form.birthDate}
            onChange={(e) => update('birthDate', e.target.value)}
            className='input'
          />
        </Field>
      </Section>

      <Section title='소속'>
        <Field label='소속 기관' required>
          <input
            type='text'
            value={form.organizationName}
            onChange={(e) => update('organizationName', e.target.value)}
            required
            placeholder='예: 행정안전부'
            className='input'
          />
        </Field>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          <Field label='부서'>
            <input
              type='text'
              value={form.department}
              onChange={(e) => update('department', e.target.value)}
              className='input'
            />
          </Field>
          <Field label='직책'>
            <input
              type='text'
              value={form.jobTitle}
              onChange={(e) => update('jobTitle', e.target.value)}
              placeholder='예: 사무관'
              className='input'
            />
          </Field>
        </div>
        <Field label='직군'>
          <input
            type='text'
            value={form.jobRole}
            onChange={(e) => update('jobRole', e.target.value)}
            placeholder='예: 전산직'
            className='input'
          />
        </Field>
      </Section>

      <Section title='지원서 첨부'>
        <Field label='지원서 (PDF)' required hint='최대 10MB · PDF 형식만 가능'>
          <label className='flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-blue-400 hover:bg-blue-50'>
            <input
              type='file'
              accept='application/pdf,.pdf'
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className='hidden'
            />
            {file ? (
              <>
                <div className='text-sm font-semibold text-slate-900'>📄 {file.name}</div>
                <div className='text-xs text-slate-500'>
                  {(file.size / 1024).toFixed(1)} KB · 클릭하여 변경
                </div>
              </>
            ) : (
              <>
                <div className='text-sm font-medium text-slate-700'>지원서 PDF 파일 선택</div>
                <div className='text-xs text-slate-500'>클릭하여 업로드</div>
              </>
            )}
          </label>
        </Field>
      </Section>

      {error && (
        <div className='rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700'>{error}</div>
      )}

      <div className='sticky bottom-4 z-10'>
        <button
          type='submit'
          disabled={pending || !agreed}
          className='w-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-blue-700 hover:to-blue-800 disabled:cursor-not-allowed disabled:opacity-50'
        >
          {pending ? '제출 중...' : !agreed ? '상단 동의 체크 후 제출' : '신청서 제출'}
        </button>
      </div>

      {confirming && (
        <div className='fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 px-4 py-6 sm:items-center'>
          <div className='w-full max-w-md rounded-2xl bg-white shadow-2xl'>
            <div className='border-b px-6 py-4'>
              <h3 className='text-base font-bold text-slate-900'>입력 정보 확인</h3>
              <p className='mt-1 text-xs text-slate-500'>
                아래 정보가 정확한지 다시 한 번 확인해 주세요.
              </p>
            </div>
            <dl className='space-y-2.5 px-6 py-4 text-sm'>
              <Row label='이름' value={form.name} />
              <Row label='이메일' value={form.email} />
              <Row label='휴대전화' value={form.phone} />
              {form.birthDate && <Row label='생년월일' value={form.birthDate} />}
              <Row label='소속 기관' value={form.organizationName} />
              {form.department && <Row label='부서' value={form.department} />}
              {form.jobTitle && <Row label='직책' value={form.jobTitle} />}
              {file && <Row label='지원서' value={`📄 ${file.name}`} />}
            </dl>
            <div className='mx-6 mb-4 rounded-md bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-800'>
              ⚠️ 오타·잘못된 정보로 인한 책임은 신청자 본인에게 있습니다. 합격 안내 발송에도 사용되니 정확히 확인해 주세요.
            </div>
            <div className='flex gap-2 border-t px-6 py-4'>
              <button
                type='button'
                onClick={() => setConfirming(false)}
                className='flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50'
              >
                다시 수정
              </button>
              <button
                type='button'
                onClick={handleConfirmedSubmit}
                disabled={pending}
                className='flex-[2] rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:from-blue-700 hover:to-blue-800 disabled:cursor-not-allowed disabled:opacity-50'
              >
                {pending ? '제출 중...' : '맞습니다, 제출'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid rgb(226 232 240);
          background: white;
          padding: 0.625rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
        }
        .input:focus {
          border-color: rgb(59 130 246);
          box-shadow: 0 0 0 3px rgb(59 130 246 / 0.15);
        }
      `}</style>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className='space-y-4 rounded-2xl border bg-white px-6 py-5 shadow-sm sm:px-7'>
      <h2 className='text-sm font-bold text-slate-800'>{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex items-start justify-between gap-4'>
      <dt className='shrink-0 text-xs font-medium text-slate-500'>{label}</dt>
      <dd className='break-all text-right font-semibold text-slate-900'>{value}</dd>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className='block text-xs font-semibold text-slate-600'>
        {label}
        {required && <span className='ml-1 text-red-500'>*</span>}
      </label>
      <div className='mt-1'>{children}</div>
      {hint && <p className='mt-1 text-[11px] text-slate-400'>{hint}</p>}
    </div>
  );
}
