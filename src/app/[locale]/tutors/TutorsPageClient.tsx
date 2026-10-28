"use client";

import { Pill } from "@/components/ds/Pill";
import { useLocale, useTranslations } from "@/i18n/translations";
import { getPublicUrl } from "@/lib/supabase/storage";
import { cn, getAvatarColor } from "@/lib/utils";
import type { Subject } from "@/types/subject";
import {
  ArrowRight,
  ChevronDown,
  MapPin,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface TutorUser {
  id: string;
  username: string;
  profile_picture: string | null;
  country: string | null;
}

interface TutorProfile {
  id: string;
  bio: string | null;
  experience_years: number | null;
  hourly_rate: number | null;
  rating: number | null;
  total_reviews: number | null;
  is_active: boolean;
  user: TutorUser | null;
}

export interface EnrichedTutor extends TutorProfile {
  subjects: { id: number; name: string }[];
  coursesCount: number;
  /** Menor `price_per_session` entre cursos activos (para filtro si no hay `hourly_rate`). */
  min_course_price: number | null;
}

function tutorListingPrice(tutor: EnrichedTutor): number | null {
  if (tutor.hourly_rate != null) return tutor.hourly_rate;
  return tutor.min_course_price ?? null;
}

type SortOption =
  | "relevance"
  | "rating_desc"
  | "price_asc"
  | "price_desc"
  | "experience_desc";

interface TutorsPageClientProps {
  initialTutors: EnrichedTutor[];
  initialSubjects: Subject[];
}

function resolveAvatarUrl(pic: string | null | undefined): string | null {
  if (pic == null || typeof pic !== "string") return null;
  const trimmed = pic.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return getPublicUrl("avatars", trimmed);
}

function TutorAvatar({
  pic,
  displayName,
  size = 56,
}: {
  pic: string | null | undefined;
  displayName: string;
  size?: number;
}) {
  const [hideImage, setHideImage] = useState(false);
  const url = useMemo(() => resolveAvatarUrl(pic), [pic]);
  const initials = (displayName.trim()[0] ?? "T").toUpperCase();

  return (
    <div
      className="relative flex-shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size }}
    >
      {url && !hideImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={displayName}
          className="h-full w-full object-cover"
          onError={() => setHideImage(true)}
        />
      ) : (
        <div
          className="grid h-full w-full place-items-center text-base font-semibold text-white"
          style={{ backgroundColor: getAvatarColor(displayName) }}
        >
          {initials}
        </div>
      )}
    </div>
  );
}

export default function TutorsPageClient({
  initialTutors,
  initialSubjects,
}: TutorsPageClientProps) {
  const t = useTranslations("tutorsPage");
  const locale = useLocale();

  const [tutors] = useState<EnrichedTutor[]>(initialTutors);
  const [subjects] = useState<Subject[]>(initialSubjects);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [minRating, setMinRating] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("relevance");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const sortOptions: ReadonlyArray<{ value: SortOption; label: string }> = [
    { value: "relevance", label: t("sortRelevance") },
    { value: "rating_desc", label: t("sortRatingDesc") },
    { value: "price_asc", label: t("sortPriceAsc") },
    { value: "price_desc", label: t("sortPriceDesc") },
    { value: "experience_desc", label: t("sortExperienceDesc") },
  ];

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery), 350);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const hasActiveFilters = Boolean(
    selectedSubject || minRating || minPrice || maxPrice
  );

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedSubject("");
    setMinRating("");
    setMinPrice("");
    setMaxPrice("");
    setSortBy("relevance");
  };

  const filteredTutors = useMemo(() => {
    let result = [...tutors];

    if (debouncedSearch.trim()) {
      const needle = debouncedSearch.toLowerCase();
      result = result.filter((tutor) => {
        const name = (tutor.user?.username ?? "").toLowerCase();
        const subjectNames = tutor.subjects
          .map((s) => s.name.toLowerCase())
          .join(" ");
        return name.includes(needle) || subjectNames.includes(needle);
      });
    }

    if (selectedSubject) {
      const subjectId = parseInt(selectedSubject, 10);
      result = result.filter((tutor) =>
        tutor.subjects.some((s) => s.id === subjectId)
      );
    }

    if (minRating) {
      const ratingThreshold = parseFloat(minRating);
      result = result.filter(
        (tutor) => (tutor.rating ?? 0) >= ratingThreshold
      );
    }

    if (minPrice) {
      const min = parseFloat(minPrice);
      if (!Number.isNaN(min)) {
        result = result.filter((tutor) => {
          const p = tutorListingPrice(tutor);
          return p != null && p >= min;
        });
      }
    }

    if (maxPrice) {
      const max = parseFloat(maxPrice);
      if (!Number.isNaN(max)) {
        result = result.filter((tutor) => {
          const p = tutorListingPrice(tutor);
          return p != null && p <= max;
        });
      }
    }

    const comparePriceAsc = (a: EnrichedTutor, b: EnrichedTutor) => {
      const pa = tutorListingPrice(a);
      const pb = tutorListingPrice(b);
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1;
      if (pb == null) return -1;
      return pa - pb;
    };

    switch (sortBy) {
      case "rating_desc":
        result.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        break;
      case "price_asc":
        result.sort(comparePriceAsc);
        break;
      case "price_desc":
        result.sort((a, b) => comparePriceAsc(b, a));
        break;
      case "experience_desc":
        result.sort(
          (a, b) => (b.experience_years ?? 0) - (a.experience_years ?? 0)
        );
        break;
    }

    return result;
  }, [
    tutors,
    debouncedSearch,
    selectedSubject,
    minRating,
    minPrice,
    maxPrice,
    sortBy,
  ]);

  // Featured card: top tutor when no filters/search active
  const featured = useMemo(() => {
    if (debouncedSearch || hasActiveFilters) return null;
    const sorted = [...filteredTutors].sort(
      (a, b) => (b.rating ?? 0) - (a.rating ?? 0)
    );
    return sorted[0] ?? null;
  }, [filteredTutors, debouncedSearch, hasActiveFilters]);

  const restTutors = featured
    ? filteredTutors.filter((tt) => tt.id !== featured.id)
    : filteredTutors;

  return (
    <div className="pb-12 lg:px-9">
      <div className="mx-auto max-w-screen-2xl">
      {/* ── Header ── */}
      <div className="px-5 pt-6 md:px-9 md:pt-10 lg:px-0 lg:pt-8">
        <div>
          <h1 className="m-0 text-[28px] font-semibold leading-tight tracking-[-0.025em] text-ft-ink md:text-[36px] lg:text-[42px]">
            {t("title")}
          </h1>
          <p className="mb-5 mt-1.5 text-[13px] text-ft-ink-3 md:text-sm">
            {t("resultsCount", { count: tutors.length })}
          </p>

          {/* Search + filter toggle */}
          <div className="flex gap-2">
            <div className="flex flex-1 items-center gap-2.5 rounded-ft-md border border-ft-line bg-ft-surface-1 px-4 py-3 transition-colors focus-within:bg-ft-paper">
              <Search width={16} height={16} className="flex-shrink-0 text-ft-ink-3" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="min-w-0 flex-1 border-none bg-transparent text-sm text-ft-ink outline-none placeholder:text-ft-ink-3"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="flex-shrink-0 text-ft-ink-3 transition-colors hover:text-ft-ink"
                  aria-label={t("clearSearch")}
                >
                  <X width={16} height={16} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-label={t("filters")}
              className={cn(
                "grid h-12 w-12 flex-shrink-0 place-items-center rounded-ft-md border border-ft-line transition-colors lg:hidden",
                filtersOpen || hasActiveFilters
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
                active={!selectedSubject}
                onClick={() => setSelectedSubject("")}
              >
                {t("allSubjects")}
              </Pill>
              {subjects.map((s) => (
                <Pill
                  key={s.id}
                  active={selectedSubject === String(s.id)}
                  onClick={() => setSelectedSubject(String(s.id))}
                >
                  {s.name}
                </Pill>
              ))}
            </div>
          )}

          {/* Sort + clear */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-ft-ink-3">
              {t("resultsCount", { count: filteredTutors.length })}
            </div>
            <div className="flex items-center gap-3">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 text-xs text-ft-ink-3 transition-colors hover:text-ft-ink"
                >
                  <X width={12} height={12} />
                  {t("clearFilters")}
                </button>
              )}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
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

          {/* Filters collapsible (rating + price range) — mobile only */}
          {filtersOpen && (
            <div className="mt-4 rounded-ft-lg border border-ft-line bg-ft-paper-deep p-4 lg:hidden">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3">
                    {t("minRating")}
                  </span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {["", "4.5", "4", "3.5", "3"].map((val) => (
                      <Pill
                        key={val || "any"}
                        active={minRating === val}
                        onClick={() => setMinRating(val)}
                      >
                        {val ? `${val}+ ★` : t("anyRating")}
                      </Pill>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3">
                    {t("priceRange")}
                  </span>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder={t("minPrice")}
                      value={minPrice}
                      onChange={(e) => setMinPrice(e.target.value)}
                      className="w-full rounded-ft border border-ft-line bg-ft-paper px-3 py-2 text-sm text-ft-ink outline-none placeholder:text-ft-ink-3 focus:border-ft-accent-deep"
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder={t("maxPrice")}
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(e.target.value)}
                      className="w-full rounded-ft border border-ft-line bg-ft-paper px-3 py-2 text-sm text-ft-ink outline-none placeholder:text-ft-ink-3 focus:border-ft-accent-deep"
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-ft-ink-3">
                    {t("priceFilterHint")}
                  </p>
                </div>
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
            {t("minRating")}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {["", "4.5", "4", "3.5", "3"].map((val) => (
              <Pill
                key={val || "any"}
                active={minRating === val}
                onClick={() => setMinRating(val)}
              >
                {val ? `${val}+ ★` : t("anyRating")}
              </Pill>
            ))}
          </div>

          <div className="my-4 h-px bg-ft-line-soft" />

          <div className="text-[13px] font-semibold tracking-tight text-ft-ink">
            {t("priceRange")}
          </div>
          <div className="mt-2.5 flex gap-2">
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder={t("minPrice")}
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              className="w-full rounded-ft border border-ft-line bg-ft-surface-1 px-3 py-2 text-sm text-ft-ink outline-none placeholder:text-ft-ink-3 focus:border-ft-accent-deep"
            />
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder={t("maxPrice")}
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="w-full rounded-ft border border-ft-line bg-ft-surface-1 px-3 py-2 text-sm text-ft-ink outline-none placeholder:text-ft-ink-3 focus:border-ft-accent-deep"
            />
          </div>
          <p className="mt-2 text-[11px] text-ft-ink-3">{t("priceFilterHint")}</p>

          {hasActiveFilters && (
            <>
              <div className="my-4 h-px bg-ft-line-soft" />
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ft-ink-2 hover:text-ft-ink"
              >
                <X width={12} height={12} />
                {t("clearFilters")}
              </button>
            </>
          )}
        </aside>

        <div className="min-w-0">

      {/* ── Empty state ── */}
      {filteredTutors.length === 0 && (
        <div className="px-5 py-16 text-center md:px-9 lg:px-0">
          <Search
            width={40}
            height={40}
            className="mx-auto mb-4 text-ft-ink-3"
          />
          <p className="text-base font-semibold text-ft-ink">
            {t("noResults")}
          </p>
          <p className="mt-1 text-sm text-ft-ink-3">{t("noResultsHint")}</p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-ft-line bg-ft-paper px-5 py-2.5 text-sm font-semibold text-ft-ink transition-colors hover:bg-ft-surface-1"
            >
              {t("clearFilters")}
            </button>
          )}
        </div>
      )}

      {/* ── Featured card ── */}
      {featured && (
        <div className="mt-6 px-5 md:px-9 lg:mt-0 lg:px-0">
          <div>
            <Link
              href={`/${locale}/tutors/${featured.id}`}
              className="block overflow-hidden rounded-ft-2xl"
            >
              <FeaturedTutorCard tutor={featured} t={t} />
            </Link>
          </div>
        </div>
      )}

      {/* ── List ── */}
      {restTutors.length > 0 && (
        <div className="mt-7 px-5 md:px-9 lg:px-0">
          <div>
            {featured && (
              <h2 className="mb-3 text-base font-semibold tracking-tight text-ft-ink">
                {t("title")}
              </h2>
            )}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
              {restTutors.map((tutor) => {
                const user = tutor.user;
                const displayName = user?.username ?? "—";
                const rating = tutor.rating ?? 0;
                const price = tutorListingPrice(tutor);

                return (
                  <Link
                    key={tutor.id}
                    href={`/${locale}/tutors/${tutor.id}`}
                    className="flex items-center gap-3.5 rounded-ft-lg border border-ft-line-soft bg-ft-paper p-3.5 transition-colors hover:bg-ft-paper-deep"
                  >
                    <TutorAvatar
                      pic={user?.profile_picture}
                      displayName={displayName}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold tracking-tight text-ft-ink">
                        {displayName}
                      </div>
                      {tutor.subjects.length > 0 && (
                        <div className="mt-0.5 truncate text-xs text-ft-ink-2">
                          {tutor.subjects
                            .slice(0, 2)
                            .map((s) => s.name)
                            .join(" · ")}
                          {tutor.subjects.length > 2 &&
                            ` +${tutor.subjects.length - 2}`}
                        </div>
                      )}
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ft-ink-3">
                        {rating > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Star
                              width={11}
                              height={11}
                              className="text-ft-accent"
                              fill="currentColor"
                              stroke="none"
                            />
                            {rating.toFixed(1)}
                          </span>
                        )}
                        {user?.country && (
                          <>
                            {rating > 0 && <span>·</span>}
                            <span className="inline-flex items-center gap-1 truncate">
                              <MapPin width={11} height={11} />
                              {user.country}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {price != null && (
                      <div className="text-right">
                        <div className="text-sm font-semibold text-ft-ink">
                          {price}€
                        </div>
                        <div className="text-[10px] text-ft-ink-3">
                          {tutor.hourly_rate != null
                            ? t("perHour")
                            : t("perSession")}
                        </div>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
      </div>
    </div>
  );
}

function FeaturedTutorCard({
  tutor,
  t,
}: {
  tutor: EnrichedTutor;
  t: ReturnType<typeof useTranslations>;
}) {
  const user = tutor.user;
  const displayName = user?.username ?? "—";
  const rating = tutor.rating ?? 0;
  const price = tutorListingPrice(tutor);
  const subject = tutor.subjects[0]?.name ?? "";
  const url = resolveAvatarUrl(user?.profile_picture);

  return (
    <div className="relative overflow-hidden rounded-ft-2xl bg-ft-surface-2">
      <div className="relative aspect-[4/5] w-full md:aspect-[16/9]">
        {url ? (
          <Image
            src={url}
            alt={displayName}
            fill
            className="object-cover"
            sizes="(min-width: 768px) 100vw, 100vw"
            priority
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: getAvatarColor(displayName) }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent via-40% to-black/70" />
        <div className="absolute left-4 top-4">
          <span className="inline-block rounded-full bg-[rgba(252,250,246,0.95)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-ft-accent-deep">
            {t("featuredThisWeek")}
          </span>
        </div>
        <div className="absolute inset-x-4 bottom-4 text-white md:inset-x-6 md:bottom-6">
          {subject && (
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-85">
              {subject}
            </div>
          )}
          <div className="mt-1.5 text-[24px] font-semibold leading-[1.1] tracking-[-0.02em] md:text-[32px]">
            {displayName}
          </div>
          {tutor.bio && (
            <p className="mt-1.5 line-clamp-2 max-w-md text-sm opacity-85">
              {tutor.bio}
            </p>
          )}
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[12px]">
              {rating > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Star
                    width={12}
                    height={12}
                    className="text-ft-accent"
                    fill="currentColor"
                    stroke="none"
                  />
                  {rating.toFixed(1)}
                  {tutor.total_reviews ? (
                    <span className="opacity-75">
                      · {t("reviewsCount", { count: tutor.total_reviews })}
                    </span>
                  ) : null}
                </span>
              )}
            </div>
            <div className="inline-flex items-center gap-2 text-sm font-semibold">
              {price != null && <span>{price}€</span>}
              <span className="grid h-9 w-9 place-items-center rounded-full bg-ft-accent text-[#1a1410]">
                <ArrowRight width={14} height={14} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
