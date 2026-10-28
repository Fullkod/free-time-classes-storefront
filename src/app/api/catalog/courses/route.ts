import {
  CATALOG_MAX_RESULTS,
  getCoursesWithRelations,
  type CourseFilters,
} from "@/lib/supabase/queries/courses";
import { createCatalogServerClient } from "@/lib/supabase/server-public";
import { NextRequest, NextResponse } from "next/server";

const LEVELS = ["beginner", "intermediate", "advanced"] as const;
const SORTS = [
  "created_desc",
  "price_asc",
  "price_desc",
  "duration_asc",
  "duration_desc",
] as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/**
 * Builds the filters from an allowlist: unknown keys are ignored, values are
 * type-checked, only active courses are ever returned, and the free-text
 * search is stripped of characters that PostgREST treats as filter syntax.
 */
function sanitizeFilters(raw: Record<string, unknown>): CourseFilters {
  const filters: CourseFilters = { is_active: true, limit: CATALOG_MAX_RESULTS };

  if (typeof raw.tutor_id === "string" && UUID_PATTERN.test(raw.tutor_id)) {
    filters.tutor_id = raw.tutor_id;
  }
  if (typeof raw.subject_id === "number" && Number.isInteger(raw.subject_id)) {
    filters.subject_id = raw.subject_id;
  }
  if (LEVELS.includes(raw.level as (typeof LEVELS)[number])) {
    filters.level = raw.level as CourseFilters["level"];
  }
  if (typeof raw.search === "string") {
    const search = raw.search.replace(/[,()%*\\]/g, " ").trim().slice(0, 80);
    if (search) filters.search = search;
  }
  if (typeof raw.tutor_name === "string") {
    const tutorName = raw.tutor_name.replace(/[,()%*_\\]/g, " ").trim().slice(0, 80);
    if (tutorName) filters.tutor_name = tutorName;
  }
  filters.min_price_per_session = finiteNumber(raw.min_price_per_session);
  filters.max_price_per_session = finiteNumber(raw.max_price_per_session);
  filters.min_duration_minutes = finiteNumber(raw.min_duration_minutes);
  filters.max_duration_minutes = finiteNumber(raw.max_duration_minutes);
  filters.min_rating = finiteNumber(raw.min_rating);
  if (SORTS.includes(raw.sort as (typeof SORTS)[number])) {
    filters.sort = raw.sort as CourseFilters["sort"];
  }

  return filters;
}

/**
 * Public catalog: courses with tutor/subject embeds using the catalog Supabase
 * client (service role when configured) so nested `users` rows are not stripped by RLS.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawFilters = (body as { filters?: unknown }).filters;
  if (!rawFilters || typeof rawFilters !== "object" || Array.isArray(rawFilters)) {
    return NextResponse.json({ error: "Missing filters object" }, { status: 400 });
  }

  try {
    const catalog = createCatalogServerClient();
    const data = await getCoursesWithRelations(
      sanitizeFilters(rawFilters as Record<string, unknown>),
      catalog
    );
    return NextResponse.json(data);
  } catch (err) {
    console.error("[catalog/courses] query failed:", err);
    return NextResponse.json({ error: "Catalog query failed" }, { status: 500 });
  }
}
