import { createSearchParamsCache, parseAsInteger, parseAsString, parseAsStringEnum } from 'nuqs/server';

export const APPLICANTS_PAGE_SIZE = 20;

export const APPLICANT_SORT_KEYS = [
  'name',
  'app_desc',
  'app_asc',
  'selected_desc',
  'selected_asc',
  'rejected_desc',
  'rejected_asc'
] as const;
export type ApplicantSort = (typeof APPLICANT_SORT_KEYS)[number];

export const applicantsSearchParams = {
  page: parseAsInteger.withDefault(1),
  q: parseAsString.withDefault(''),
  category: parseAsString.withDefault(''),
  unselected: parseAsString.withDefault(''),
  sort: parseAsStringEnum<ApplicantSort>([...APPLICANT_SORT_KEYS]).withDefault('name')
};

export const applicantsSearchParamsCache = createSearchParamsCache(applicantsSearchParams);
