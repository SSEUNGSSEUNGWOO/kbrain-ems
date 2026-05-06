import { cookies } from 'next/headers';

export type OperatorRole = 'developer' | 'operator';

export async function getOperator(): Promise<{ name: string; role: OperatorRole; title: string } | null> {
  const cookieStore = await cookies();
  const name = cookieStore.get('operator_name')?.value;
  const role = cookieStore.get('operator_role')?.value as OperatorRole | undefined;
  const title = cookieStore.get('operator_title')?.value ?? '';
  if (!name || !role) return null;
  return { name, role, title };
}

export async function isDeveloper(): Promise<boolean> {
  const op = await getOperator();
  return op?.role === 'developer';
}
