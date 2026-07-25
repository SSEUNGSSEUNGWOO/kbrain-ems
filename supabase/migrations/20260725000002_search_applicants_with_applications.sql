-- search_applicants RPC 확장 — 각 지원자별 applications 배열 함께 반환.
-- 목록 페이지에서 badge 클릭 시 popover 로 cohort 별 상태를 인라인 편집할 수 있도록.
--
-- 반환 rows[*] 에 새 필드:
--   applications: [{ id, cohort_id, cohort_name, status, rejected_stage }, ...]

CREATE OR REPLACE FUNCTION public.search_applicants(
  p_search text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_unselected_only boolean DEFAULT false,
  p_sort text DEFAULT 'name',
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 20,
  p_hide_personal boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_offset int := GREATEST((COALESCE(p_page, 1) - 1) * COALESCE(p_page_size, 20), 0);
  v_page_size int := COALESCE(p_page_size, 20);
  v_search_like text;
  v_category text := NULLIF(p_category, '');
  v_result jsonb;
BEGIN
  IF p_search IS NULL OR btrim(p_search) = '' THEN
    v_search_like := NULL;
  ELSE
    v_search_like := '%' || btrim(p_search) || '%';
  END IF;

  WITH stats AS (
    SELECT
      a.applicant_id,
      count(*)::int AS applied_count,
      count(*) FILTER (WHERE a.status = 'selected')::int AS selected_count,
      count(*) FILTER (WHERE a.status = 'rejected')::int AS rejected_count,
      array_agg(coalesce(c.name, '(이름 없음)') ORDER BY coalesce(c.name, '')) AS applied_cohorts,
      array_agg(coalesce(c.name, '(이름 없음)') ORDER BY coalesce(c.name, ''))
        FILTER (WHERE a.status = 'selected') AS selected_cohorts,
      array_agg(coalesce(c.name, '(이름 없음)') ORDER BY coalesce(c.name, ''))
        FILTER (WHERE a.status = 'rejected') AS rejected_cohorts,
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'cohort_id', a.cohort_id,
          'cohort_name', coalesce(c.name, '(이름 없음)'),
          'status', a.status,
          'rejected_stage', a.rejected_stage
        )
        ORDER BY coalesce(c.name, '')
      ) AS applications
    FROM public.applications a
    LEFT JOIN public.cohorts c ON c.id = a.cohort_id
    GROUP BY a.applicant_id
  ),
  base AS (
    SELECT
      ap.id,
      ap.name,
      ap.category,
      ap.department,
      ap.job_title,
      ap.job_role,
      ap.birth_date,
      ap.email,
      ap.personal_email,
      ap.phone,
      ap.notes,
      o.name AS organization_name,
      s.applied_count,
      s.selected_count,
      s.rejected_count,
      s.applied_cohorts,
      s.selected_cohorts,
      s.rejected_cohorts,
      s.applications
    FROM public.applicants ap
    JOIN stats s ON s.applicant_id = ap.id
    LEFT JOIN public.organizations o ON o.id = ap.organization_id
    WHERE ap.name NOT LIKE '테스트%'
  ),
  searched AS (
    SELECT *
    FROM base
    WHERE
      v_search_like IS NULL
      OR (
        CASE
          WHEN p_hide_personal THEN name ILIKE v_search_like
          ELSE
            name ILIKE v_search_like
            OR phone ILIKE v_search_like
            OR email ILIKE v_search_like
            OR personal_email ILIKE v_search_like
        END
      )
  ),
  filtered AS (
    SELECT *
    FROM searched
    WHERE
      v_category IS NULL
      OR (v_category = '미분류' AND category IS NULL)
      OR (v_category <> '미분류' AND category = v_category)
  ),
  filtered_final AS (
    SELECT *
    FROM filtered
    WHERE
      NOT p_unselected_only
      OR (applied_count >= 1 AND selected_count = 0)
  ),
  sorted AS (
    SELECT
      f.*,
      row_number() OVER (
        ORDER BY
          CASE WHEN p_sort = 'app_desc' THEN applied_count END DESC NULLS LAST,
          CASE WHEN p_sort = 'app_asc' THEN applied_count END ASC NULLS LAST,
          CASE WHEN p_sort = 'selected_desc' THEN selected_count END DESC NULLS LAST,
          CASE WHEN p_sort = 'selected_asc' THEN selected_count END ASC NULLS LAST,
          CASE WHEN p_sort = 'rejected_desc' THEN rejected_count END DESC NULLS LAST,
          CASE WHEN p_sort = 'rejected_asc' THEN rejected_count END ASC NULLS LAST,
          name ASC
      ) AS rn,
      count(*) OVER () AS total_count
    FROM filtered_final f
  ),
  page_rows AS (
    SELECT *
    FROM sorted
    WHERE rn > v_offset AND rn <= v_offset + v_page_size
  ),
  facet AS (
    SELECT
      coalesce(category, '미분류') AS cat,
      count(*)::int AS cnt
    FROM searched
    GROUP BY coalesce(category, '미분류')
  )
  SELECT jsonb_build_object(
    'rows', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', pr.id,
          'name', pr.name,
          'category', pr.category,
          'department', pr.department,
          'job_title', pr.job_title,
          'job_role', pr.job_role,
          'birth_date', pr.birth_date,
          'email', CASE WHEN p_hide_personal THEN NULL ELSE pr.email END,
          'personal_email', CASE WHEN p_hide_personal THEN NULL ELSE pr.personal_email END,
          'phone', CASE WHEN p_hide_personal THEN NULL ELSE pr.phone END,
          'notes', pr.notes,
          'organizationName', pr.organization_name,
          'applicationCount', pr.applied_count,
          'selectedCount', pr.selected_count,
          'rejectedCount', pr.rejected_count,
          'appliedCohorts', to_jsonb(coalesce(pr.applied_cohorts, ARRAY[]::text[])),
          'selectedCohorts', to_jsonb(coalesce(pr.selected_cohorts, ARRAY[]::text[])),
          'rejectedCohorts', to_jsonb(coalesce(pr.rejected_cohorts, ARRAY[]::text[])),
          'applications', coalesce(pr.applications, '[]'::jsonb)
        ) ORDER BY pr.rn
      )
      FROM page_rows pr
    ), '[]'::jsonb),
    'total', coalesce((SELECT max(total_count) FROM sorted), 0),
    'categoryCounts', coalesce((
      SELECT jsonb_object_agg(cat, cnt) FROM facet
    ), '{}'::jsonb),
    'facetTotal', coalesce((SELECT sum(cnt)::int FROM facet), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
