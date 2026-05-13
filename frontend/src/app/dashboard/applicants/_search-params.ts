import { createSearchParamsCache, parseAsInteger, parseAsString } from 'nuqs/server';

export const APPLICANTS_PAGE_SIZE = 20;

export const applicantsSearchParams = {
  page: parseAsInteger.withDefault(1),
  q: parseAsString.withDefault(''),
  category: parseAsString.withDefault('')
};

export const applicantsSearchParamsCache = createSearchParamsCache(applicantsSearchParams);
