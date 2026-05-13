import { createSearchParamsCache, parseAsInteger, parseAsString } from 'nuqs/server';

export const APPLICATIONS_PAGE_SIZE = 20;

export const applicationsSearchParams = {
  page: parseAsInteger.withDefault(1),
  q: parseAsString.withDefault('')
};

export const applicationsSearchParamsCache = createSearchParamsCache(applicationsSearchParams);
