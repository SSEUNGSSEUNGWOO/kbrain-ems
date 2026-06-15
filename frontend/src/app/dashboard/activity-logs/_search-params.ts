import { createSearchParamsCache, parseAsInteger, parseAsString } from 'nuqs/server';

export const ACTIVITY_LOGS_PAGE_SIZE = 50;

export const activityLogsSearchParams = {
  page: parseAsInteger.withDefault(1),
  operator: parseAsString.withDefault(''),
  action: parseAsString.withDefault(''),
  cohort: parseAsString.withDefault(''),
  from: parseAsString.withDefault(''),
  to: parseAsString.withDefault('')
};

export const activityLogsSearchParamsCache = createSearchParamsCache(activityLogsSearchParams);
