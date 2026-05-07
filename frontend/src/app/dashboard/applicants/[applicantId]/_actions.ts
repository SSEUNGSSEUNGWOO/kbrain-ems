'use server';

import { db } from '@/lib/db';
import { applicants, applications, students } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

async function syncStudentSelected(
  applicantId: string,
  cohortId: string
): Promise<void> {
  const a = (
    await db
      .select({
        id: applicants.id,
        name: applicants.name,
        organizationId: applicants.organizationId,
        department: applicants.department,
        jobTitle: applicants.jobTitle,
        jobRole: applicants.jobRole,
        birthDate: applicants.birthDate,
        email: applicants.email,
        phone: applicants.phone,
        notes: applicants.notes
      })
      .from(applicants)
      .where(eq(applicants.id, applicantId))
      .limit(1)
  )[0];
  if (!a) return;

  const existing = await db
    .select({ id: students.id })
    .from(students)
    .where(eq(students.id, applicantId))
    .limit(1);
  if (existing[0]) {
    // 이미 학생이면 cohort만 맞춰주고 정보 갱신
    await db
      .update(students)
      .set({
        cohortId,
        name: a.name,
        organizationId: a.organizationId,
        department: a.department,
        jobTitle: a.jobTitle,
        jobRole: a.jobRole,
        birthDate: a.birthDate,
        email: a.email,
        phone: a.phone,
        notes: a.notes
      })
      .where(eq(students.id, applicantId));
    return;
  }

  await db.insert(students).values({
    id: applicantId,
    cohortId,
    name: a.name,
    organizationId: a.organizationId,
    department: a.department,
    jobTitle: a.jobTitle,
    jobRole: a.jobRole,
    birthDate: a.birthDate,
    email: a.email,
    phone: a.phone,
    notes: a.notes
  });
}

async function removeStudentIfNoSelected(applicantId: string): Promise<void> {
  // 이 사람이 더 이상 어떤 기수에도 selected가 아니면 학생 행 제거
  const stillSelected = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.applicantId, applicantId),
        eq(applications.status, 'selected')
      )
    )
    .limit(1);
  if (stillSelected[0]) return;
  await db.delete(students).where(eq(students.id, applicantId));
}

type ActionResult = { error?: string };

const VALID_STATUSES = [
  'applied',
  'shortlisted',
  'selected',
  'rejected',
  'withdrew'
] as const;

const VALID_REJECTED_STAGES = ['docs', 'interview', 'final'] as const;

function formValue(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? '').trim();
  return v || null;
}

export async function createApplication(
  applicantId: string,
  formData: FormData
): Promise<ActionResult> {
  const cohortId = formValue(formData, 'cohort_id');
  if (!cohortId) return { error: '기수는 필수입니다.' };

  const status = String(formData.get('status') ?? 'applied');
  if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return { error: '잘못된 상태값입니다.' };
  }

  const rejectedStageRaw = formValue(formData, 'rejected_stage');
  const rejectedStage =
    status === 'rejected' &&
    rejectedStageRaw &&
    VALID_REJECTED_STAGES.includes(
      rejectedStageRaw as (typeof VALID_REJECTED_STAGES)[number]
    )
      ? rejectedStageRaw
      : null;

  try {
    await db.insert(applications).values({
      applicantId,
      cohortId,
      status,
      rejectedStage,
      appliedAt: formValue(formData, 'applied_at'),
      decidedAt: formValue(formData, 'decided_at'),
      note: formValue(formData, 'note')
    });
    if (status === 'selected') {
      await syncStudentSelected(applicantId, cohortId);
    }
  } catch (e: unknown) {
    return {
      error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.'
    };
  }

  revalidatePath(`/dashboard/applicants/${applicantId}`);
  revalidatePath('/dashboard/applicants');
  return {};
}

export async function updateApplication(
  id: string,
  applicantId: string,
  formData: FormData
): Promise<ActionResult> {
  const cohortId = formValue(formData, 'cohort_id');
  if (!cohortId) return { error: '기수는 필수입니다.' };

  const status = String(formData.get('status') ?? 'applied');
  if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return { error: '잘못된 상태값입니다.' };
  }

  const rejectedStageRaw = formValue(formData, 'rejected_stage');
  const rejectedStage =
    status === 'rejected' &&
    rejectedStageRaw &&
    VALID_REJECTED_STAGES.includes(
      rejectedStageRaw as (typeof VALID_REJECTED_STAGES)[number]
    )
      ? rejectedStageRaw
      : null;

  try {
    await db
      .update(applications)
      .set({
        cohortId,
        status,
        rejectedStage,
        appliedAt: formValue(formData, 'applied_at'),
        decidedAt: formValue(formData, 'decided_at'),
        note: formValue(formData, 'note')
      })
      .where(eq(applications.id, id));

    if (status === 'selected') {
      await syncStudentSelected(applicantId, cohortId);
    } else {
      await removeStudentIfNoSelected(applicantId);
    }
  } catch (e: unknown) {
    return {
      error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.'
    };
  }

  revalidatePath(`/dashboard/applicants/${applicantId}`);
  revalidatePath('/dashboard/applicants');
  return {};
}

export async function deleteApplication(
  id: string,
  applicantId: string
): Promise<ActionResult> {
  try {
    await db.delete(applications).where(eq(applications.id, id));
    await removeStudentIfNoSelected(applicantId);
  } catch (e: unknown) {
    return {
      error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.'
    };
  }

  revalidatePath(`/dashboard/applicants/${applicantId}`);
  revalidatePath('/dashboard/applicants');
  return {};
}
