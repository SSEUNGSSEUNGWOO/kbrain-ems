import { createAdminClient } from '@/lib/supabase/server';
import type { PriorCert } from '@/app/dashboard/cohorts/[cohortId]/applications/_selection-logic';

export const TRACK_LABEL: Record<PriorCert['track'], string> = {
  green: '그린',
  blue: '블루',
  expert: '전문인재',
  continuing: '보수교육'
};

// 종합관리 xlsx 관례: 블루 먼저
const TRACK_ORDER: Record<PriorCert['track'], number> = {
  blue: 0,
  green: 1,
  expert: 2,
  continuing: 3
};

const EVENT_LABEL: Record<NonNullable<PriorCert['event']>, string> = {
  hackathon: '해커톤',
  miniproject: '미니프로젝트',
  private: '민간협업'
};

/** 인증 건 단위 행 — prior_certs 항목 1건 = 1행 */
export type CertRow = {
  applicantId: string;
  name: string;
  category: string | null;
  /** 인증 시점 기관 (prior_certs.organization) 우선, 없으면 현재 소속 */
  organization: string | null;
  department: string | null;
  jobTitle: string | null;
  jobRole: string | null;
  email: string | null;
  phone: string | null;
  year: number;
  track: PriorCert['track'];
  round: number | null;
  /** 정규화된 유형: 교육형 / 자기주도형 / 자격연계형 / 해커톤 등 */
  kind: string;
  certNo: string;
  certName: string;
};

/** kind 원문("⑪ 공공 LLM 프롬프트 해커톤 (자격연계형)" 등)을 필터 가능한 유형으로 정규화 */
export function normalizeKind(kind: string | null, event: PriorCert['event']): string {
  if (kind) {
    if (kind.includes('자격연계형')) return '자격연계형';
    return kind;
  }
  if (event) return EVENT_LABEL[event];
  return '기타';
}

/** prior_certs가 있는 전체 지원자를 인증 건 단위로 flatten. 기본 정렬: 연도↓ → 블루 먼저 → 인증번호↑ */
export async function fetchCertRows(): Promise<CertRow[]> {
  const supabase = createAdminClient();

  type ApplicantRow = {
    id: string;
    name: string;
    category: string | null;
    department: string | null;
    job_title: string | null;
    job_role: string | null;
    email: string | null;
    phone: string | null;
    prior_certs: PriorCert[] | null;
    organizations: { name: string } | null;
  };

  // 전체 fetch (PostgREST max-rows=1000 우회: range chunked)
  const all: ApplicantRow[] = [];
  const chunk = 1000;
  for (let from = 0; from < 1_000_000; from += chunk) {
    const res = (await supabase
      .from('applicants')
      .select(
        'id, name, category, department, job_title, job_role, email, phone, prior_certs, organizations(name)'
      )
      .range(from, from + chunk - 1)) as unknown as { data: ApplicantRow[] | null };
    const batch = res.data ?? [];
    all.push(...batch);
    if (batch.length < chunk) break;
  }

  const rows: CertRow[] = [];
  for (const a of all) {
    if (!Array.isArray(a.prior_certs)) continue;
    for (const c of a.prior_certs) {
      rows.push({
        applicantId: a.id,
        name: a.name,
        category: a.category,
        organization: c.organization ?? a.organizations?.name ?? null,
        department: a.department,
        jobTitle: a.job_title,
        jobRole: a.job_role,
        email: a.email,
        phone: a.phone,
        year: c.year,
        track: c.track,
        round: c.round,
        kind: normalizeKind(c.kind, c.event),
        certNo: c.cert_no,
        certName: c.cert_name ?? `${c.year}년 AI챔피언 ${TRACK_LABEL[c.track] ?? c.track}`
      });
    }
  }

  rows.sort(
    (a, b) =>
      b.year - a.year ||
      (TRACK_ORDER[a.track] ?? 9) - (TRACK_ORDER[b.track] ?? 9) ||
      a.certNo.localeCompare(b.certNo)
  );
  return rows;
}

export type CertFilter = {
  q?: string;
  year?: string;
  track?: string;
  kind?: string;
};

export function filterCertRows(rows: CertRow[], { q, year, track, kind }: CertFilter): CertRow[] {
  let filtered = rows;
  if (year) filtered = filtered.filter((r) => String(r.year) === year);
  if (track) filtered = filtered.filter((r) => r.track === track);
  if (kind) filtered = filtered.filter((r) => r.kind === kind);
  const query = (q ?? '').trim().toLowerCase();
  if (query) {
    filtered = filtered.filter(
      (r) =>
        r.name.toLowerCase().includes(query) ||
        (r.organization ?? '').toLowerCase().includes(query) ||
        r.certNo.toLowerCase().includes(query)
    );
  }
  return filtered;
}
