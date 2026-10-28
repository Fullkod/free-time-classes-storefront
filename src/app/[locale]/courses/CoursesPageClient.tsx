"use client";

import { Pill } from "@/components/ds/Pill";
import { useLocale, useTranslations } from "@/i18n/translations";
import type { CourseFilters } from "@/lib/supabase/queries/courses";
import {
  getCourseCoverPublicUrl,
  getPublicUrl,
} from "@/lib/supabase/storage";
import { cn, getAvatarColor } from "@/lib/utils";
import type { CourseWithRelations } from "@/types/course";
import type { Subject } from "@/types/subject";
import {
  ChevronDown,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CourseLevel = NonNullable<CourseFilters["level"]>;
type CourseSort = NonNullable<CourseFilters["sort"]>;

const COURSE_LEVELS: readonly CourseLevel[] = ["beginner", "intermediate", "advanced"];
const COURSE_SORTS: readonly CourseSort[] = [
  "created_desc",
  "price_asc",
  "price_desc",
  "duration_asc",
  "duration_desc",
];

interface CoursesPageClientProps {
  initialSubjects: Subject[];
  initialCourses: CourseWithRelations[];
}

export default function CoursesPageClient({
  initialSubjects,
  initialCourses,
}: CoursesPageClientProps) {
  const tCat = useTranslations("coursesCatalog");
  const tAvail = useTranslations("studentProfile.availabilities");
  const locale = useLocale();

  const [subjects] = useState<Subject[]>(initialSubjects);
  const [courses, setCourses] = useState<CourseWithRelations[]>(initialCourses);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [queryFilters, setQueryFilters] = useState<{
    search: string;
    subject_id: string;
    level: CourseLevel | "";
    minPrice: string;
    maxPrice: string;
    minDuration: string;
    maxDuration: string;
    sort: CourseSort;
    priceFreeOnly: boolean;
    highRatingOnly: boolean;
  }>({
    search: "",
    subject_id: "",
    level: "",
    minPrice: "",
    maxPrice: "",
    minDuration: "",
    maxDuration: "",
    sort: "created_desc",
    priceFreeOnly: false,
    highRatingOnly: false,
  });

  const [tutorSearch, setTutorSearch] = useState("");

  // Filters live in the URL (?q, subject, level, ...) so a reload or a shared
  // link keeps them. Read and written on the client so the page stays static.
  const [urlReady, setUrlReady] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const get = (key: string) => params.get(key) ?? "";
    const numeric = (key: string) => (/^\d+(\.\d+)?$/.test(get(key)) ? get(key) : "");
    const subject = get("subject");
    const level = get("level");
    const sort = get("sort");
    setQueryFilters((p) => ({
      ...p,
      search: get("q").slice(0, 80),
      subject_id: subjects.some((s) => String(s.id) === subject) ? subject : "",
      level: (COURSE_LEVELS as readonly string[]).includes(level) ? (level as CourseLevel) : "",
      minPrice: numeric("minPrice"),
      maxPrice: numeric("maxPrice"),
      minDuration: numeric("minDuration"),
      maxDuration: numeric("maxDuration"),
      sort: (COURSE_SORTS as readonly string[]).includes(sort) ? (sort as CourseSort) : "created_desc",
      priceFreeOnly: get("free") === "1",
      highRatingOnly: get("top") === "1",
    }));
    setTutorSearch(get("tutor").slice(0, 80));
    setUrlReady(true);
  }, [subjects]);

  useEffect(() => {
    if (!urlReady) return;
    const params = new URLSearchParams();
    const set = (key: string, value: string) => {
      if (value.trim()) params.set(key, value.trim());
    };
    set("q", queryFilters.search);
    set("subject", queryFilters.subject_id);
    set("level", queryFilters.level);
    set("minPrice", queryFilters.minPrice);
    set("maxPrice", queryFilters.maxPrice);
    set("minDuration", queryFilters.minDuration);
    set("maxDuration", queryFilters.maxDuration);
    if (queryFilters.sort !== "created_desc") params.set("sort", queryFilters.sort);
    if (queryFilters.priceFreeOnly) params.set("free", "1");
    if (queryFilters.highRatingOnly) params.set("top", "1");
    set("tutor", tutorSearch);
    const query = params.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, "", url);
    }
  }, [urlReady, queryFilters, tutorSearch]);

  const [debouncedQueryFilters, setDebouncedQueryFilters] =
    useState(queryFilters);
  useEffect(() => {
    const t = window.setTimeout(
      () => setDebouncedQueryFilters(queryFilters),
      400
    );
    return () => window.clearTimeout(t);
  }, [queryFilters]);

  const [debouncedTutorSearch, setDebouncedTutorSearch] = useState("");
  useEffect(() => {
    const t = window.setTimeout(
      () => setDebouncedTutorSearch(tutorSearch),
      300
    );
    return () => window.clearTimeout(t);
  }, [tutorSearch]);

  useEffect(() => {
    async function loadCourses() {
      const hasServerFilters =
        !!debouncedQueryFilters.subject_id ||
        !!debouncedQueryFilters.level ||
        !!debouncedQueryFilters.search.trim() ||
        !!debouncedQueryFilters.minPrice.trim() ||
        !!debouncedQueryFilters.maxPrice.trim() ||
        !!debouncedQueryFilters.minDuration.trim() ||
        !!debouncedQueryFilters.maxDuration.trim() ||
        debouncedQueryFilters.priceFreeOnly ||
        debouncedQueryFilters.highRatingOnly ||
        debouncedQueryFilters.sort !== "created_desc" ||
        debouncedTutorSearch.trim().length > 0;

      if (!hasServerFilters) {
        setCourses(initialCourses);
        setError(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const courseFilters: CourseFilters = { is_active: true };

        if (debouncedQueryFilters.subject_id) {
          courseFilters.subject_id = parseInt(
            debouncedQueryFilters.subject_id,
            10
          );
        }
        if (debouncedQueryFilters.level) {
          courseFilters.level =
            debouncedQueryFilters.level as CourseFilters["level"];
        }
        if (debouncedQueryFilters.search.trim()) {
          courseFilters.search = debouncedQueryFilters.search.trim();
        }
        if (debouncedTutorSearch.trim()) {
          courseFilters.tutor_name = debouncedTutorSearch.trim();
        }
        if (debouncedQueryFilters.priceFreeOnly) {
          courseFilters.min_price_per_session = 0;
          courseFilters.max_price_per_session = 0;
        } else {
          const minPriceNum =
            debouncedQueryFilters.minPrice.trim() === ""
              ? undefined
              : Number(debouncedQueryFilters.minPrice);
          if (minPriceNum !== undefined && !Number.isNaN(minPriceNum)) {
            courseFilters.min_price_per_session = minPriceNum;
          }
          const maxPriceNum =
            debouncedQueryFilters.maxPrice.trim() === ""
              ? undefined
              : Number(debouncedQueryFilters.maxPrice);
          if (maxPriceNum !== undefined && !Number.isNaN(maxPriceNum)) {
            courseFilters.max_price_per_session = maxPriceNum;
          }
        }
        const minDurationNum =
          debouncedQueryFilters.minDuration.trim() === ""
            ? undefined
            : Number(debouncedQueryFilters.minDuration);
        if (minDurationNum !== undefined && !Number.isNaN(minDurationNum)) {
          courseFilters.min_duration_minutes = minDurationNum;
        }
        const maxDurationNum =
          debouncedQueryFilters.maxDuration.trim() === ""
            ? undefined
            : Number(debouncedQueryFilters.maxDuration);
        if (maxDurationNum !== undefined && !Number.isNaN(maxDurationNum)) {
          courseFilters.max_duration_minutes = maxDurationNum;
        }
        if (debouncedQueryFilters.highRatingOnly) {
          courseFilters.min_rating = 4.5;
        }
        courseFilters.sort = debouncedQueryFilters.sort;

        async function loadViaCatalog(filters: CourseFilters) {
          const res = await fetch("/api/catalog/courses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filters }),
          });
          if (!res.ok) {
            const errBody = (await res.json().catch(() => null)) as {
              error?: string;
            } | null;
            throw new Error(errBody?.error ?? res.statusText);
          }
          return (await res.json()) as CourseWithRelations[];
        }

        setCourses(await loadViaCatalog(courseFilters));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load courses");
        setCourses([]);
      } finally {
        setLoading(false);
      }
    }

    void loadCourses();
  }, [debouncedQueryFilters, debouncedTutorSearch, initialCourses]);

  // Tutor name is filtered on the server, over the whole catalog.
  const displayedCourses = courses;

  const levelLabel = (level: CourseWithRelations["level"] | null | undefined) => {
    if (level === "advanced") return tCat("levelAdvanced");
    if (level === "intermediate") return tCat("levelIntermediate");
    if (level === "beginner") return tCat("levelBeginner");
    return level ?? "";
  };

  const sortOptions = useMemo(
    () =>
      (
        [
          ["created_desc", tAvail("sortNewest")],
          ["price_asc", tAvail("sortPriceAsc")],
          ["price_desc", tAvail("sortPriceDesc")],
          ["duration_asc", tAvail("sortDurationAsc")],
          ["duration_desc", tAvail("sortDurationDesc")],
        ] as const
      ).map(([value, label]) => ({ value, label })),
    [tAvail]
  );

  const hasActiveFilters =
    Boolean(
      queryFilters.subject_id ||
        queryFilters.level ||
        queryFilters.minPrice ||
        queryFilters.maxPrice ||
        queryFilters.minDuration ||
        queryFilters.maxDuration ||
        queryFilters.priceFreeOnly ||
        queryFilters.highRatingOnly
    ) ||
    queryFilters.sort !== "created_desc" ||
    tutorSearch.trim().length > 0;

  function resetFilters() {
    setQueryFilters({
      search: "",
      subject_id: "",
      level: "",
      minPrice: "",
      maxPrice: "",
      minDuration: "",
      maxDuration: "",
      sort: "created_desc",
      priceFreeOnly: false,
      highRatingOnly: false,
    });
    setTutorSearch("");
  }

  return (
    <div className="pb-12 lg:px-9">
      <div className="mx-auto max-w-screen-2xl">
      {/* ── Header ── */}
      <div className="px-5 pt-6 md:px-9 md:pt-10 lg:px-0 lg:pt-8">
        <div>
          <h1 className="m-0 text-[28px] font-semibold leading-tight tracking-[-0.025em] text-ft-ink md:text-[36px] lg:text-[42px]">
            {tCat("heroDesktopTitle")}
          </h1>
          <p className="mb-5 mt-1.5 max-w-2xl text-[13px] text-ft-ink-3 md:text-sm">
            {tCat("heroMobileSubtitle")}
          </p>

          {/* Search + filter toggle */}
          <div className="flex gap-2">
            <div className="flex flex-1 items-center gap-2.5 rounded-ft-md border border-ft-line bg-ft-surface-1 px-4 py-3 transition-colors focus-within:bg-ft-paper">
              <Search width={16} height={16} className="flex-shrink-0 text-ft-ink-3" />
              <input
                value={queryFilters.search}
                onChange={(e) =>
                  setQueryFilters((p) => ({ ...p, search: e.target.value }))
                }
                placeholder={tCat("searchPlaceholder")}
                className="min-w-0 flex-1 border-none bg-transparent text-sm text-ft-ink outline-none placeholder:text-ft-ink-3"
              />
              {queryFilters.search && (
                <button
                  onClick={() =>
                    setQueryFilters((p) => ({ ...p, search: "" }))
                  }
                  className="flex-shrink-0 text-ft-ink-3 transition-colors hover:text-ft-ink"
                  aria-label={tCat("clearSearch")}
                >
                  <X width={16} height={16} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-label={tCat("advancedFilters")}
              className={cn(
                "grid h-12 w-12 flex-shrink-0 place-items-center rounded-ft-md border border-ft-line transition-colors lg:hidden",
                showAdvanced
                  ? "bg-ft-ink text-ft-paper"
                  : "bg-ft-paper text-ft-ink hover:bg-ft-surface-1"
              )}
            >
              <SlidersHorizontal width={18} height={18} />
            </button>
          </div>

          {/* Subject pills */}
          {subjects.length > 0 && (
            <div className="hide-scroll mt-4 flex gap-2 overflow-x-auto">
              <Pill
                active={queryFilters.subject_id === ""}
                onClick={() =>
                  setQueryFilters((p) => ({ ...p, subject_id: "" }))
                }
              >
                {tCat("chipAllSubjects")}
              </Pill>
              {subjects.map((s) => (
                <Pill
                  key={s.id}
                  active={queryFilters.subject_id === String(s.id)}
                  onClick={() =>
                    setQueryFilters((p) => ({
                      ...p,
                      subject_id: String(s.id),
                    }))
                  }
                >
                  {s.name}
                </Pill>
              ))}
            </div>
          )}

          {/* Level + price + rating chips */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Pill
              active={queryFilters.level === ""}
              onClick={() => setQueryFilters((p) => ({ ...p, level: "" }))}
            >
              {tCat("chipLevelAny")}
            </Pill>
            {(["beginner", "intermediate", "advanced"] as const).map((lev) => (
              <Pill
                key={lev}
                active={queryFilters.level === lev}
                onClick={() => setQueryFilters((p) => ({ ...p, level: lev }))}
              >
                {levelLabel(lev)}
              </Pill>
            ))}
            <span className="mx-1 hidden h-4 w-px shrink-0 bg-ft-line md:block" />
            <Pill
              active={queryFilters.priceFreeOnly}
              onClick={() =>
                setQueryFilters((p) => ({
                  ...p,
                  priceFreeOnly: !p.priceFreeOnly,
                }))
              }
            >
              {tCat("chipPriceFree")}
            </Pill>
            <Pill
              active={queryFilters.highRatingOnly}
              onClick={() =>
                setQueryFilters((p) => ({
                  ...p,
                  highRatingOnly: !p.highRatingOnly,
                }))
              }
            >
              {tCat("chipRating45")}
            </Pill>
          </div>

          {/* Sort + clear */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-ft-ink-3">
              {tCat("resultsLabel", { count: displayedCourses.length })}
            </div>
            <div className="flex items-center gap-3">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 text-xs text-ft-ink-3 transition-colors hover:text-ft-ink"
                >
                  <X width={12} height={12} />
                  {tCat("clearAll")}
                </button>
              )}
              <div className="relative">
                <select
                  value={queryFilters.sort}
                  onChange={(e) =>
                    setQueryFilters((p) => ({
                      ...p,
                      sort: e.target.value as CourseSort,
                    }))
                  }
                  className="appearance-none rounded-full border border-ft-line bg-ft-paper py-1.5 pl-3 pr-8 text-xs font-medium text-ft-ink-2 transition-colors hover:bg-ft-surface-1 focus:outline-none"
                >
                  {sortOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  width={12}
                  height={12}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ft-ink-3"
                />
              </div>
            </div>
          </div>

          {/* Advanced filters — mobile only (desktop has sidebar) */}
          {showAdvanced && (
            <div className="mt-4 grid gap-3 rounded-ft-lg border border-ft-line bg-ft-paper-deep p-4 sm:grid-cols-2 lg:hidden">
              <div className="sm:col-span-2 lg:col-span-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3">
                  {tAvail("tutorNamePlaceholder")}
                </span>
                <input
                  value={tutorSearch}
                  onChange={(e) => setTutorSearch(e.target.value)}
                  className="mt-1.5 w-full rounded-ft border border-ft-line bg-ft-paper px-3 py-2 text-sm text-ft-ink outline-none placeholder:text-ft-ink-3 focus:border-ft-accent-deep"
                />
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3">
                  {tAvail("priceMinPlaceholder")}
                </span>
                <input
                  type="number"
                  min={0}
                  disabled={queryFilters.priceFreeOnly}
                  value={queryFilters.minPrice}
                  onChange={(e) =>
                    setQueryFilters((p) => ({ ...p, minPrice: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-ft border border-ft-line bg-ft-paper px-3 py-2 text-sm text-ft-ink outline-none focus:border-ft-accent-deep disabled:opacity-50"
                />
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3">
                  {tAvail("priceMaxPlaceholder")}
                </span>
                <input
                  type="number"
                  min={0}
                  disabled={queryFilters.priceFreeOnly}
                  value={queryFilters.maxPrice}
                  onChange={(e) =>
                    setQueryFilters((p) => ({ ...p, maxPrice: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-ft border border-ft-line bg-ft-paper px-3 py-2 text-sm text-ft-ink outline-none focus:border-ft-accent-deep disabled:opacity-50"
                />
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3">
                  {tAvail("durationMinPlaceholder")}
                </span>
                <input
                  type="number"
                  min={0}
                  value={queryFilters.minDuration}
                  onChange={(e) =>
                    setQueryFilters((p) => ({
                      ...p,
                      minDuration: e.target.value,
                    }))
                  }
                  className="mt-1.5 w-full rounded-ft border border-ft-line bg-ft-paper px-3 py-2 text-sm text-ft-ink outline-none focus:border-ft-accent-deep"
                />
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3">
                  {tAvail("durationMaxPlaceholder")}
                </span>
                <input
                  type="number"
                  min={0}
                  value={queryFilters.maxDuration}
                  onChange={(e) =>
                    setQueryFilters((p) => ({
                      ...p,
                      maxDuration: e.target.value,
                    }))
                  }
                  className="mt-1.5 w-full rounded-ft border border-ft-line bg-ft-paper px-3 py-2 text-sm text-ft-ink outline-none focus:border-ft-accent-deep"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Results area: desktop sidebar + main ── */}
      <div className="lg:mt-6 lg:grid lg:grid-cols-[260px_1fr] lg:gap-8 lg:px-0">
        {/* Sidebar filters — desktop only */}
        <aside className="hidden h-fit lg:sticky lg:top-6 lg:block lg:rounded-ft-lg lg:border lg:border-ft-line-soft lg:bg-ft-paper lg:p-5">
          <div className="text-[13px] font-semibold tracking-tight text-ft-ink">
            {tAvail("tutorNamePlaceholder")}
          </div>
          <input
            value={tutorSearch}
            onChange={(e) => setTutorSearch(e.target.value)}
            className="mt-2.5 w-full rounded-ft border border-ft-line bg-ft-surface-1 px-3 py-2 text-sm text-ft-ink outline-none placeholder:text-ft-ink-3 focus:border-ft-accent-deep"
          />

          <div className="my-4 h-px bg-ft-line-soft" />

          <div className="text-[13px] font-semibold tracking-tight text-ft-ink">
            {tAvail("price")}
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              disabled={queryFilters.priceFreeOnly}
              placeholder={tAvail("priceMinPlaceholder")}
              value={queryFilters.minPrice}
              onChange={(e) =>
                setQueryFilters((p) => ({ ...p, minPrice: e.target.value }))
              }
              className="w-full rounded-ft border border-ft-line bg-ft-surface-1 px-3 py-2 text-sm text-ft-ink outline-none placeholder:text-ft-ink-3 focus:border-ft-accent-deep disabled:opacity-50"
            />
            <input
              type="number"
              min={0}
              disabled={queryFilters.priceFreeOnly}
              placeholder={tAvail("priceMaxPlaceholder")}
              value={queryFilters.maxPrice}
              onChange={(e) =>
                setQueryFilters((p) => ({ ...p, maxPrice: e.target.value }))
              }
              className="w-full rounded-ft border border-ft-line bg-ft-surface-1 px-3 py-2 text-sm text-ft-ink outline-none placeholder:text-ft-ink-3 focus:border-ft-accent-deep disabled:opacity-50"
            />
          </div>

          <div className="my-4 h-px bg-ft-line-soft" />

          <div className="text-[13px] font-semibold tracking-tight text-ft-ink">
            {tAvail("duration")}
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              placeholder={tAvail("durationMinPlaceholder")}
              value={queryFilters.minDuration}
              onChange={(e) =>
                setQueryFilters((p) => ({
                  ...p,
                  minDuration: e.target.value,
                }))
              }
              className="w-full rounded-ft border border-ft-line bg-ft-surface-1 px-3 py-2 text-sm text-ft-ink outline-none placeholder:text-ft-ink-3 focus:border-ft-accent-deep"
            />
            <input
              type="number"
              min={0}
              placeholder={tAvail("durationMaxPlaceholder")}
              value={queryFilters.maxDuration}
              onChange={(e) =>
                setQueryFilters((p) => ({
                  ...p,
                  maxDuration: e.target.value,
                }))
              }
              className="w-full rounded-ft border border-ft-line bg-ft-surface-1 px-3 py-2 text-sm text-ft-ink outline-none placeholder:text-ft-ink-3 focus:border-ft-accent-deep"
            />
          </div>

          {hasActiveFilters && (
            <>
              <div className="my-4 h-px bg-ft-line-soft" />
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ft-ink-2 hover:text-ft-ink"
              >
                <X width={12} height={12} />
                {tCat("clearAll")}
              </button>
            </>
          )}
        </aside>

      {/* ── Results ── */}
      <div className="mt-6 px-5 md:px-9 lg:mt-0 lg:min-w-0 lg:px-0">
        <div>
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-ft-ink-3 border-t-ft-ink" />
            </div>
          ) : error ? (
            <div className="rounded-ft-lg border border-red-200 bg-red-50 px-6 py-10 text-center text-sm text-red-800">
              {error}
            </div>
          ) : displayedCourses.length === 0 ? (
            <div className="py-16 text-center">
              <Search width={40} height={40} className="mx-auto mb-4 text-ft-ink-3" />
              <p className="text-base font-semibold text-ft-ink">
                {tCat("emptyTitle")}
              </p>
              <p className="mt-1 text-sm text-ft-ink-3">
                {tCat("emptyDescription")}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-6 inline-flex items-center gap-2 rounded-full border border-ft-line bg-ft-paper px-5 py-2.5 text-sm font-semibold text-ft-ink transition-colors hover:bg-ft-surface-1"
                >
                  {tCat("clearAll")}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-2 xl:grid-cols-3">
              {displayedCourses.map((course) => {
                const tutor = course.tutor;
                const rawProfilePicture = tutor?.profile_picture;
                const profilePicture =
                  rawProfilePicture && typeof rawProfilePicture === "string"
                    ? rawProfilePicture.startsWith("http")
                      ? rawProfilePicture
                      : getPublicUrl("avatars", rawProfilePicture)
                    : null;
                const firstChar = tutor?.username?.[0]?.toUpperCase() ?? "U";
                const rating = course.rating ?? 0;
                const reviews = course.total_reviews ?? 0;
                const bestseller = rating >= 4.5 && reviews >= 3;
                const popular = rating >= 4 && !bestseller;
                const coverUrl = getCourseCoverPublicUrl(course.cover_image);
                const href = `/${locale}/courses/${course.id}`;

                return (
                  <Link
                    key={course.id}
                    href={href}
                    className="group block overflow-hidden rounded-ft-lg border border-ft-line-soft bg-ft-paper transition-colors hover:bg-ft-paper-deep"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-ft-surface-2">
                      {coverUrl ? (
                        <Image
                          src={coverUrl}
                          alt=""
                          fill
                          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        />
                      ) : (
                        <div
                          className="absolute inset-0"
                          style={{
                            background: getAvatarColor(String(course.id ?? course.title)),
                          }}
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
                      <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                        {course.level && (
                          <span className="rounded-full bg-[rgba(252,250,246,0.95)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-ft-accent-deep">
                            {levelLabel(course.level)}
                          </span>
                        )}
                        {bestseller && (
                          <span className="rounded-full bg-ft-ink px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-ft-paper">
                            {tCat("bestseller")}
                          </span>
                        )}
                        {popular && (
                          <span className="rounded-full bg-[rgba(252,250,246,0.95)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-ft-ink-2">
                            {tCat("popular")}
                          </span>
                        )}
                      </div>
                      {rating > 0 && (
                        <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[rgba(252,250,246,0.95)] px-2.5 py-1 text-[11px] font-semibold text-ft-ink">
                          <Star
                            width={11}
                            height={11}
                            className="text-ft-accent"
                            fill="currentColor"
                            stroke="none"
                          />
                          {rating.toFixed(1)}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 p-4">
                      {course.subject?.name && (
                        <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ft-accent-deep">
                          {course.subject.name}
                        </div>
                      )}
                      <h3 className="m-0 line-clamp-2 text-[15px] font-semibold leading-tight tracking-[-0.01em] text-ft-ink">
                        {course.title}
                      </h3>
                      <p className="m-0 line-clamp-2 text-[12px] leading-relaxed text-ft-ink-2">
                        {course.description}
                      </p>

                      <div className="mt-1 flex items-center justify-between gap-2 border-t border-ft-line-soft pt-3">
                        <div className="flex min-w-0 items-center gap-2">
                          {profilePicture ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={profilePicture}
                              alt={tutor?.username ?? "Tutor"}
                              className="h-7 w-7 rounded-full object-cover"
                            />
                          ) : (
                            <span
                              className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-semibold text-white"
                              style={{
                                backgroundColor: getAvatarColor(
                                  tutor?.username ?? ""
                                ),
                              }}
                            >
                              {firstChar}
                            </span>
                          )}
                          <span className="min-w-0 truncate text-[12px] text-ft-ink-2">
                            {tutor?.username ?? "—"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-ft-ink-3">
                            {course.duration_minutes ?? 0}{" "}
                            {tAvail("minutes")}
                          </span>
                          <span className="text-sm font-semibold text-ft-ink">
                            {Number(course.price_per_session).toFixed(0)}€
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}
