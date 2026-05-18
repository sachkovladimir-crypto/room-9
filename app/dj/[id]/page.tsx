"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { formatAudioTime, useAudioPlayer } from "@/components/GlobalAudioPlayer";
import { MissingConfigNotice } from "@/components/AuthNotice";
import { Room9Waveform } from "@/components/Room9Waveform";
import { TrackActionMenu } from "@/components/TrackActionMenu";
import { BookmarkGlyph, ExternalGlyph, PlayGlyph } from "@/components/room9-icons";
import { getDemoDjProfile, getDemoWorksByDjId, isDemoDjId, isDemoWorkId } from "@/lib/demoContent";
import { formatPrice } from "@/lib/format";
import { trackUserInteraction } from "@/lib/interactions";
import { cssImageUrl, getDjAvatarUrl, getDjCoverUrl, getWorkCoverUrl } from "@/lib/media";
import { saveVaultMoment } from "@/lib/soundVault";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  logSupabaseError
} from "@/lib/supabase";
import { clampTrackTimestamp, getMomentDisplayLabel, getPrimaryTrackMoment } from "@/lib/trackMoments";
import type { DjProfile, Favorite, Profile, Release, Review, Work } from "@/lib/types";

const tourDates = [
  ["Oct 24", "Berlin, DE", "Berghain / Panorama Bar", "Confirmed"],
  ["Nov 12", "Moscow, RU", "Mutabor", "Pending"]
];

export default function DjProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [dj, setDj] = useState<DjProfile | null>(null);
  const [works, setWorks] = useState<Work[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [releaseTracks, setReleaseTracks] = useState<Record<string, string[]>>({});
  const [viewer, setViewer] = useState<Profile | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [favoriteId, setFavoriteId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState("5");
  const [reviewComment, setReviewComment] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingFavorite, setIsSavingFavorite] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [featuredDurationSeconds, setFeaturedDurationSeconds] = useState<number | null>(null);
  const [trustPanelOpen, setTrustPanelOpen] = useState(false);
  const [isMediaUploading, setIsMediaUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { currentTime, currentTrack, isPlaying, playQueue, setSelectedTimestamp } = useAudioPlayer();

  const recordProfileView = useCallback(async (profile: DjProfile) => {
    try {
      const supabase = getSupabase();
      const { data: userData } = await supabase.auth.getUser();
      const viewerId = userData.user?.id ?? null;
      const { error: viewError } = await supabase.from("profile_views").insert({
        dj_id: profile.id,
        viewer_id: viewerId
      });

      if (viewError) {
        logSupabaseError("Profile view tracking failed", viewError);
      }

      if (viewerId) {
        trackUserInteraction({
          djId: profile.id,
          interactionType: "open_artist",
          metadata: {
            city: profile.city,
            stage_name: profile.stage_name
          },
          scope: viewerId
        });
      }
    } catch (caughtError) {
      logSupabaseError("Profile view tracking unexpected failure", caughtError);
    }
  }, []);

  const recordTrackPlay = useCallback(
    async (work: Work) => {
      if (!dj || isDemoWorkId(work.id)) {
        return;
      }

      try {
        const supabase = getSupabase();
        const { data: userData } = await supabase.auth.getUser();
        const { error: playError } = await supabase.from("track_plays").insert({
          work_id: work.id,
          dj_id: dj.id,
          listener_id: userData.user?.id ?? null
        });

        const nextPlayCount = (Number(work.play_count) || 0) + 1;
        const { error: updateError } = await supabase
          .from("works")
          .update({ play_count: nextPlayCount })
          .eq("id", work.id);

        setWorks((current) =>
          current.map((item) => (item.id === work.id ? { ...item, play_count: nextPlayCount } : item))
        );

        if (playError || updateError) {
          logSupabaseError("Track play tracking failed", playError ?? updateError);
        }
      } catch (caughtError) {
        logSupabaseError("Track play tracking unexpected failure", caughtError);
      }
    },
    [dj]
  );

  useEffect(() => {
    if (!hasSupabaseConfig() || !params.id) {
      return;
    }

    async function loadProfile() {
      setIsLoading(true);
      setError("");

      try {
        const demoDj = getDemoDjProfile(params.id);
        if (demoDj) {
          setDj(demoDj);
          setWorks(getDemoWorksByDjId(demoDj.id));
          setReleases([]);
          setReleaseTracks({});
          setReviews([]);
          setViewer(null);
          setIsOwner(false);
          setFavoriteId(null);
          return;
        }

        const supabase = getSupabase();
        const [{ data: profileData, error: profileError }, { data: worksData, error: worksError }] =
          await Promise.all([
            supabase.from("dj_profiles").select("*").eq("id", params.id).maybeSingle(),
            supabase.from("works").select("*").eq("dj_id", params.id).order("created_at", {
              ascending: false
            })
          ]);

        if (profileError || worksError || !profileData) {
          logSupabaseError("DJ public profile load failed", profileError ?? worksError);
          setError(
            profileError || worksError
              ? formatSupabaseError(profileError ?? worksError, "Unable to load profile.")
              : "Artist dossier not found."
          );
        } else {
          const loadedDj = (profileData as DjProfile | null) ?? null;
          const publicWorks = ((worksData as Work[]) ?? []).filter(
            (work) => !work.is_deleted && (work.visibility ?? "public") === "public"
          );
          setDj(loadedDj);
          setWorks(publicWorks);
          if (loadedDj && !isDemoDjId(loadedDj.id)) {
            await recordProfileView(loadedDj);
            await loadV2ProfileState(loadedDj);
            await loadReleaseState(loadedDj);
          }
        }
      } catch (caughtError) {
        logSupabaseError("DJ public profile unexpected load failure", caughtError);
        setError(formatSupabaseError(caughtError, "Unable to load profile."));
      } finally {
        setIsLoading(false);
      }
    }

    loadProfile();
  }, [params.id, recordProfileView]);

  async function loadV2ProfileState(profile: DjProfile) {
    try {
      const supabase = getSupabase();
      const { data: userData } = await supabase.auth.getUser();
      let currentProfile: Profile | null = null;

      if (userData.user) {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userData.user.id)
          .maybeSingle();

        if (profileError) {
          logSupabaseError("DJ profile viewer profile load failed", profileError);
        } else {
          currentProfile = (profileData as Profile | null) ?? null;
          setViewer(currentProfile);
          setIsOwner(currentProfile?.id === profile.user_id);
        }
      } else {
        setViewer(null);
        setIsOwner(false);
      }

      const { data: reviewsData, error: reviewsError } = await supabase
        .from("reviews")
        .select("*")
        .eq("reviewee_id", profile.user_id)
        .order("created_at", { ascending: false });

      if (reviewsError) {
        logSupabaseError("DJ reviews load failed", reviewsError);
      } else {
        setReviews((reviewsData as Review[]) ?? []);
      }

      if (currentProfile) {
        const { data: favoriteData, error: favoriteError } = await supabase
          .from("favorites")
          .select("*")
          .eq("user_id", currentProfile.id)
          .eq("dj_id", profile.id)
          .maybeSingle();

        if (favoriteError) {
          logSupabaseError("DJ favorite state load failed", favoriteError);
        } else {
          setFavoriteId(((favoriteData as Favorite | null) ?? null)?.id ?? null);
        }
      }
    } catch (caughtError) {
      logSupabaseError("DJ V2 profile state unexpected failure", caughtError);
    }
  }

  async function loadReleaseState(profile: DjProfile) {
    try {
      const supabase = getSupabase();
      const { data: releaseData, error: releaseError } = await supabase
        .from("releases")
        .select("*")
        .eq("dj_id", profile.id)
        .eq("visibility", "public")
        .order("created_at", { ascending: false });

      if (releaseError) {
        logSupabaseError("DJ releases load failed", releaseError);
        setReleases([]);
        setReleaseTracks({});
        return;
      }

      const nextReleases = (releaseData as Release[] | null) ?? [];
      setReleases(nextReleases);

      const releaseIds = nextReleases.map((release) => release.id);
      if (releaseIds.length === 0) {
        setReleaseTracks({});
        return;
      }

      const { data: releaseTrackData, error: releaseTrackError } = await supabase
        .from("release_tracks")
        .select("release_id, work_id, position")
        .in("release_id", releaseIds)
        .order("position", { ascending: true });

      if (releaseTrackError) {
        logSupabaseError("DJ release tracks load failed", releaseTrackError);
        setReleaseTracks({});
        return;
      }

      setReleaseTracks(mapReleaseTracks(releaseTrackData as Array<{ release_id: string; work_id: string }> | null));
    } catch (caughtError) {
      logSupabaseError("DJ release state unexpected failure", caughtError);
      setReleases([]);
      setReleaseTracks({});
    }
  }

  async function toggleFavorite() {
    if (!dj) {
      return;
    }

    if (!viewer) {
      setNotice("Login or register as a listener, organizer, or venue to save DJs.");
      return;
    }

    setIsSavingFavorite(true);
    setNotice("");

    try {
      const supabase = getSupabase();
      if (favoriteId) {
        const { error: deleteError } = await supabase.from("favorites").delete().eq("id", favoriteId);
        if (deleteError) {
          logSupabaseError("Favorite delete failed", deleteError);
          setNotice(formatSupabaseError(deleteError, "Could not remove saved DJ."));
          return;
        }
        setFavoriteId(null);
        setNotice("DJ removed from saved list.");
      } else {
        const { data, error: insertError } = await supabase
          .from("favorites")
          .insert({ user_id: viewer.id, dj_id: dj.id })
          .select("*")
          .single();

        if (insertError) {
          logSupabaseError("Favorite insert failed", insertError);
          setNotice(formatSupabaseError(insertError, "Could not save DJ."));
          return;
        }

        setFavoriteId((data as Favorite).id);
        setNotice("DJ saved to your dashboard.");
      }
    } catch (caughtError) {
      logSupabaseError("Favorite unexpected failure", caughtError);
      setNotice(formatSupabaseError(caughtError, "Could not update saved DJ."));
    } finally {
      setIsSavingFavorite(false);
    }
  }

  async function uploadProfileMedia(event: ChangeEvent<HTMLInputElement>, field: "avatar_url" | "cover_image_url") {
    if (!dj || !viewer || !isOwner) {
      setNotice("Only the DJ profile owner can update profile media.");
      return;
    }

    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.type && !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      setNotice("Upload a JPG, PNG, WEBP, or GIF image.");
      return;
    }

    setIsMediaUploading(true);
    setNotice("");

    try {
      const supabase = getSupabase();
      const cleanName = file.name.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
      const path = `${viewer.id}/profile-${field}-${Date.now()}-${cleanName}`;
      const { error: uploadError } = await supabase.storage.from("images").upload(path, file, {
        cacheControl: "60",
        upsert: false
      });

      if (uploadError) {
        logSupabaseError("DJ profile media upload failed", uploadError);
        setNotice(formatSupabaseError(uploadError, 'Upload failed. Create a public "images" bucket and retry.'));
        return;
      }

      const url = supabase.storage.from("images").getPublicUrl(path).data.publicUrl;
      const { data, error: updateError } = await supabase
        .from("dj_profiles")
        .update({ [field]: url })
        .eq("id", dj.id)
        .eq("user_id", viewer.id)
        .select("*")
        .single();

      if (updateError) {
        logSupabaseError("DJ profile media update failed", updateError);
        setNotice(formatSupabaseError(updateError, "Image uploaded, but profile media could not update."));
        return;
      }

      setDj(data as DjProfile);
      setNotice(field === "avatar_url" ? "Avatar updated." : "Profile cover updated.");
    } catch (caughtError) {
      logSupabaseError("DJ profile media unexpected failure", caughtError);
      setNotice(formatSupabaseError(caughtError, "Could not update profile media."));
    } finally {
      setIsMediaUploading(false);
      event.target.value = "";
    }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dj) {
      return;
    }

    if (!viewer) {
      setNotice("Login before leaving a review.");
      return;
    }

    if (viewer.id === dj.user_id) {
      setNotice("You cannot review your own DJ profile.");
      return;
    }

    setIsSubmittingReview(true);
    setNotice("");

    try {
      const supabase = getSupabase();
      const { data, error: reviewError } = await supabase
        .from("reviews")
        .insert({
          reviewer_id: viewer.id,
          reviewee_id: dj.user_id,
          rating: Number(rating),
          comment: reviewComment
        })
        .select("*")
        .single();

      if (reviewError) {
        logSupabaseError("Review insert failed", reviewError);
        setNotice(formatSupabaseError(reviewError, "Could not save review."));
        return;
      }

      setReviews((current) => [data as Review, ...current]);
      setReviewComment("");
      setRating("5");
      setNotice("Review published.");
    } catch (caughtError) {
      logSupabaseError("Review unexpected failure", caughtError);
      setNotice(formatSupabaseError(caughtError, "Could not save review."));
    } finally {
      setIsSubmittingReview(false);
    }
  }

  if (!hasSupabaseConfig()) {
    return <MissingConfigNotice />;
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-voidBlack text-paperWhite">
        <section className="mx-auto max-w-[1680px] px-8 py-10">
          <div className="min-h-[720px] animate-pulse border border-roomBorder bg-panelBlack" />
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="room-page">
        <section className="room-shell py-12">
          <EmptyState title="Profile error" message={error} href="/explore" action="Back to DJs" />
        </section>
      </main>
    );
  }

  if (!dj) {
    return (
      <main className="room-page">
        <section className="room-shell py-12">
          <EmptyState
            title="DJ not found"
            message="This artist profile is not available."
            href="/explore"
            action="Explore DJs"
          />
        </section>
      </main>
    );
  }

  const name = dj.stage_name || "ROOM_9";
  const location = [dj.city, dj.country].filter(Boolean).join(", ") || "Location TBA";
  const identityImage = getDjAvatarUrl(dj);
  const coverImage = getDjCoverUrl(dj);
  const hasProfileCover = Boolean(dj.cover_image_url);
  const trackQueue = works
    .filter((work) => work.link)
    .map((work) => ({
      id: work.id,
      title: work.title || "Untitled track",
      artist: name,
      src: work.link || "",
      djId: work.dj_id,
      coverUrl: getWorkCoverUrl(work, dj),
      description: work.description || work.lyrics,
      durationSeconds: work.duration_seconds
    }));
  const featuredWork = works.find((work) => work.link) ?? works[0] ?? null;
  const featuredMoment = getPrimaryTrackMoment(featuredDurationSeconds);
  const peakMomentSeconds = clampTrackTimestamp(featuredMoment.seconds, featuredDurationSeconds);
  const peakMomentLabel = getMomentDisplayLabel(featuredMoment);
  const featuredBookingHref = featuredWork
    ? `/booking/${dj.id}?workId=${encodeURIComponent(featuredWork.id)}&t=${peakMomentSeconds}`
    : `/booking/${dj.id}`;
  const bioCopy =
    dj.bio && dj.bio.trim().length > 24
      ? dj.bio
      : `${name} builds high-pressure DJ sets around hypnotic movement, warehouse pacing, and functional peak moments. The profile keeps listening, saved tracks, and booking trust in one place.`;
  const activeWaveformIndex = Math.min(
    92,
    Math.max(8, Math.round((peakMomentSeconds / Math.max(featuredDurationSeconds || 360, 1)) * 96))
  );
  const acceptRate = dj.is_available ? "94" : "71";
  const confirmedGigs = Math.max(42, reviews.length);

  function bookFromMoment(work: Work) {
    if (!dj) {
      return;
    }

    const fallbackMoment = getPrimaryTrackMoment(work.duration_seconds);
    const momentSeconds =
      currentTrack?.id === work.id
        ? Math.round(currentTime)
        : clampTrackTimestamp(fallbackMoment.seconds, work.duration_seconds);
    router.push(`/booking/${dj.id}?workId=${encodeURIComponent(work.id)}&t=${momentSeconds}`);
  }

  function playFeaturedPeak() {
    if (!featuredWork?.link) {
      return;
    }

    const index = trackQueue.findIndex((track) => track.id === featuredWork.id);
    playQueue(trackQueue, index >= 0 ? index : 0);
    setSelectedTimestamp(peakMomentSeconds);
  }

  async function saveFeaturedMoment() {
    if (!featuredWork || !dj) {
      setNotice("No uploaded sound reference is available to save yet.");
      return;
    }

    await saveVaultMoment(
      {
        trackId: featuredWork.id,
        djId: dj.id,
        trackTitle: featuredWork.title || "Untitled track",
        artist: name,
        timestamp: peakMomentSeconds,
        timestampLabel: formatAudioTime(peakMomentSeconds),
        momentLabel: peakMomentLabel,
        bpm: featuredWork.bpm || dj.bpm_range || "",
        energy: featuredMoment.energy,
        roomType: featuredMoment.roomType
      },
      viewer?.id ?? null
    );
    setNotice(`${peakMomentLabel} saved as an atmosphere brief.`);
  }

  return (
    <main className="min-h-screen bg-[#050505] pb-28 text-paperWhite">
      {featuredWork?.link ? (
        <audio
          preload="metadata"
          src={featuredWork.link}
          onLoadedMetadata={(event) => setFeaturedDurationSeconds(event.currentTarget.duration || null)}
        >
          <track kind="captions" />
        </audio>
      ) : null}

      <section className="mx-auto max-w-[1680px]">
        <div className="min-w-0 border-x border-roomBorder">
          <section className="relative overflow-hidden border-b border-roomBorder px-6 py-8 md:px-12 md:py-10">
            <div
              className="absolute inset-y-0 right-0 w-full bg-cover bg-center opacity-40 grayscale md:w-[68%] md:opacity-70"
              style={{ backgroundImage: cssImageUrl(coverImage) }}
            />
            <div
              className="absolute inset-y-6 right-6 hidden w-[34%] border border-roomBorder bg-cover bg-center opacity-85 grayscale lg:block"
              style={{ backgroundImage: cssImageUrl(coverImage) }}
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_44%,rgba(186,255,0,0.14),transparent_20rem),linear-gradient(90deg,#050505_0%,rgba(5,5,5,0.94)_39%,rgba(5,5,5,0.55)_74%,rgba(5,5,5,0.78)_100%)]" />
            <div className="absolute bottom-0 right-6 hidden h-px w-[34%] bg-acidGreen/80 lg:block" />
            <div className="relative z-10 grid min-h-[300px] gap-8 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-end">
              <div className="flex min-h-[260px] flex-col justify-between">
                <div className="flex flex-wrap gap-3">
                  <span className="bg-acidGreen px-3 py-2 font-mono text-[10px] font-black uppercase text-black">
                    Verified
                  </span>
                  <span className="border border-roomBorder bg-black/40 px-3 py-2 font-mono text-[10px] uppercase text-mutedText">
                    {dj.is_available ? "Available" : "Closed"}
                  </span>
                </div>

                <div className="mt-10 max-w-3xl">
                  <p className="room-tiny text-acidGreen">Artist dossier</p>
                  <h1 className="mt-3 max-w-2xl font-display text-[34px] uppercase leading-[0.92] text-paperWhite md:text-[46px] xl:text-[56px]">
                    {name}
                  </h1>
                  <p className="mt-7 flex flex-wrap items-center gap-4 font-mono text-[11px] uppercase tracking-[0.14em] text-mutedText">
                    <span className="text-acidGreen">LOC</span>
                    <span>{location}</span>
                    <span>|</span>
                    <span>{dj.genres || "Industrial Techno"}</span>
                    <span>|</span>
                    <span>{dj.bpm_range || "118-135 BPM"}</span>
                  </p>
                  {(dj.soundcloud_url || dj.mixcloud_url) ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {dj.soundcloud_url ? (
                        <a className="room-outline-button min-h-8 px-3 text-[9px]" href={dj.soundcloud_url} rel="noreferrer" target="_blank">
                          <ExternalGlyph className="h-3 w-3" />
                          SoundCloud
                        </a>
                      ) : null}
                      {dj.mixcloud_url ? (
                        <a className="room-outline-button min-h-8 px-3 text-[9px]" href={dj.mixcloud_url} rel="noreferrer" target="_blank">
                          <ExternalGlyph className="h-3 w-3" />
                          Mixcloud
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <aside className="border border-roomBorder bg-black/78 p-4 backdrop-blur-sm lg:self-end">
                <div
                  className="mb-4 flex h-28 items-end justify-between border border-roomBorder bg-cover bg-center p-3 grayscale"
                  style={{ backgroundImage: cssImageUrl(coverImage) }}
                >
                  <span className="bg-black/80 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-acidGreen">
                    {hasProfileCover ? "Cover active" : "Fallback cover"}
                  </span>
                  <span className="bg-black/80 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-paperWhite">
                    ROOM_9
                  </span>
                </div>
                <div className="flex items-start gap-4 border-b border-roomBorder pb-4">
                  <div
                    className="h-28 w-28 shrink-0 border border-roomBorder bg-inkPanel bg-cover bg-center grayscale"
                    style={{ backgroundImage: cssImageUrl(identityImage) }}
                  />
                  <div className="min-w-0 pt-1">
                    <p className="room-tiny text-mutedText">Artist identity</p>
                    <p className="mt-2 truncate font-display text-2xl uppercase leading-none text-paperWhite">
                      {name}
                    </p>
                    <div className="mt-4 grid gap-2 font-mono text-[10px] uppercase">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-mutedText">Avatar</span>
                        <span className={dj.avatar_url ? "text-acidGreen" : "text-warningOrange"}>
                          {dj.avatar_url ? "Synced" : "Pending"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-mutedText">Cover</span>
                        <span className={dj.cover_image_url ? "text-acidGreen" : "text-warningOrange"}>
                          {dj.cover_image_url ? "Synced" : "Pending"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {isOwner ? (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <label className="room-outline-button min-h-9 cursor-pointer px-3 text-[9px]">
                      {isMediaUploading ? "Uploading" : "Upload Avatar"}
                      <input accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" disabled={isMediaUploading} onChange={(event) => uploadProfileMedia(event, "avatar_url")} type="file" />
                    </label>
                    <label className="room-outline-button min-h-9 cursor-pointer px-3 text-[9px]">
                      {isMediaUploading ? "Uploading" : "Upload Cover"}
                      <input accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" disabled={isMediaUploading} onChange={(event) => uploadProfileMedia(event, "cover_image_url")} type="file" />
                    </label>
                  </div>
                ) : null}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    className="room-outline-button min-h-9 px-3 text-[9px]"
                    disabled={isSavingFavorite}
                    onClick={toggleFavorite}
                    type="button"
                  >
                    <BookmarkGlyph className="h-3.5 w-3.5" filled={Boolean(favoriteId)} />
                    {favoriteId ? "Saved" : isSavingFavorite ? "Saving" : "Save"}
                  </button>
                  <button className="room-outline-button min-h-9 px-3 text-[9px]" onClick={playFeaturedPeak} type="button">
                    <PlayGlyph className="h-3.5 w-3.5" />
                    Latest Set
                  </button>
                  <button className="room-outline-button min-h-9 px-3 text-[9px]" onClick={() => setTrustPanelOpen(true)} type="button">
                    Trust
                  </button>
                  <Link className="room-white-button min-h-9 px-3 text-[9px]" href={featuredBookingHref}>
                    Book DJ
                  </Link>
                </div>
              </aside>
            </div>
          </section>

          <section className="border-b border-roomBorder px-8 py-12 md:px-12">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="room-tiny text-acidGreen">Sound Proof // Primary</p>
                <h2 className="mt-3 break-words font-display text-[30px] uppercase leading-none text-paperWhite md:text-[34px]">
                  Featured: {featuredWork?.title || "No uploaded set"}
                </h2>
              </div>
              <div className="flex gap-2">
                <button className="grid h-10 w-10 place-items-center border border-roomBorder hover:border-paperWhite" onClick={playFeaturedPeak} type="button" aria-label="Previous set">
                  <PreviousIcon />
                </button>
                <button className="grid h-10 w-12 place-items-center border border-paperWhite bg-paperWhite text-black" onClick={playFeaturedPeak} type="button" aria-label="Play featured set">
                  <PlayIcon />
                </button>
                <button className="grid h-10 w-10 place-items-center border border-roomBorder hover:border-paperWhite" onClick={playFeaturedPeak} type="button" aria-label="Next set">
                  <NextIcon />
                </button>
              </div>
            </div>
            {featuredWork ? (
              <>
                <DossierWaveform activeIndex={activeWaveformIndex} label={peakMomentLabel} />
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-roomBorder pt-5">
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-mutedText">
                    {formatAudioTime(peakMomentSeconds)} / {featuredDurationSeconds ? formatAudioTime(featuredDurationSeconds) : "06:22"}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button className="room-outline-button min-h-11" onClick={saveFeaturedMoment} type="button">
                      <BookmarkGlyph className="h-3.5 w-3.5" />
                      Save Reference
                    </button>
                    {featuredWork?.link ? (
                      <TrackActionMenu
                        compact
                        moment={{
                          djId: dj.id,
                          energy: "High",
                          momentLabel: peakMomentLabel,
                          roomType: "Warehouse",
                          timestamp: peakMomentSeconds,
                          timestampLabel: formatAudioTime(peakMomentSeconds)
                        }}
                        onNotice={setNotice}
                        track={{
                          id: featuredWork.id,
                          title: featuredWork.title || "Untitled track",
                          artist: name,
                          src: featuredWork.link,
                          djId: featuredWork.dj_id,
                          coverUrl: getWorkCoverUrl(featuredWork, dj),
                          description: [featuredWork.genre || dj.genres, featuredWork.bpm || dj.bpm_range].filter(Boolean).join(" / "),
                          bpm: featuredWork.bpm || dj.bpm_range,
                          genre: featuredWork.genre || dj.genres
                        }}
                      />
                    ) : null}
                    <Link className="room-outline-button min-h-11" href={`/track/${featuredWork.id}`}>
                      <ExternalGlyph className="h-3.5 w-3.5" />
                      Open Track
                    </Link>
                    <Link className="room-white-button min-h-11" href={featuredBookingHref}>
                      Use as Brief
                    </Link>
                  </div>
                </div>
              </>
            ) : (
              <p className="room-muted mt-7">No tracks uploaded yet. Booking is still available from the profile context.</p>
            )}
          </section>

          <section className="border-b border-roomBorder px-8 py-12 md:px-12">
            <ProfileSectionTitle title="Public Sets & Tracks" />
            <div className="mt-7 space-y-3">
              {works.length === 0 ? (
                <article className="border border-line px-5 py-4">
                  <h3 className="room-heading text-lg">No uploaded tracks yet</h3>
                  <p className="room-tiny mt-1">ROOM_9 / demo slot</p>
                </article>
              ) : (
                works.map((work) => (
                  <article className="grid gap-4 border border-roomBorder bg-[#080808] p-4 md:grid-cols-[44px_1fr_auto] md:items-center" key={work.id}>
                    <button
                      className="grid h-9 w-9 place-items-center border border-roomBorder bg-black text-paperWhite hover:border-acidGreen hover:text-acidGreen"
                      type="button"
                      onClick={() => {
                        if (work.link) {
                          recordTrackPlay(work);
                          const index = trackQueue.findIndex((track) => track.id === work.id);
                          playQueue(trackQueue, index >= 0 ? index : 0);
                        }
                      }}
                      aria-label={`Play ${work.title || "track"}`}
                    >
                      {currentTrack?.id === work.id && isPlaying ? "II" : <PlayIcon />}
                    </button>
                    <div className="min-w-0">
                      <Link className="inline-block hover:text-acidGreen" href={`/track/${work.id}`}>
                        <h3 className="font-display text-lg uppercase leading-tight text-paperWhite">{work.title || "Untitled track"}</h3>
                      </Link>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-mutedText">
                        {[work.type || "track", work.bpm ? `${work.bpm} BPM` : dj.bpm_range, work.genre || dj.genres, work.duration_seconds ? formatAudioTime(work.duration_seconds) : null]
                          .filter(Boolean)
                          .join(" / ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-5">
                      <span className="font-mono text-[10px] uppercase text-mutedText">{work.play_count ?? 0} plays</span>
                      <Link className="room-outline-button min-h-9 px-3" href={`/track/${work.id}`}>
                        <ExternalGlyph className="h-3.5 w-3.5" />
                        Open
                      </Link>
                      {work.link ? (
                        <TrackActionMenu
                          compact
                          moment={{
                            djId: dj.id,
                            energy: "High",
                            momentLabel: getMomentDisplayLabel(getPrimaryTrackMoment(work.duration_seconds)),
                            roomType: "Warehouse",
                            timestamp: clampTrackTimestamp(getPrimaryTrackMoment(work.duration_seconds).seconds, work.duration_seconds),
                            timestampLabel: formatAudioTime(clampTrackTimestamp(getPrimaryTrackMoment(work.duration_seconds).seconds, work.duration_seconds))
                          }}
                          onNotice={setNotice}
                          track={{
                            id: work.id,
                            title: work.title || "Untitled track",
                            artist: name,
                            src: work.link,
                            djId: work.dj_id,
                            coverUrl: getWorkCoverUrl(work, dj),
                            description: [work.genre || dj.genres, work.bpm || dj.bpm_range].filter(Boolean).join(" / "),
                            bpm: work.bpm || dj.bpm_range,
                            genre: work.genre || dj.genres
                          }}
                        />
                      ) : null}
                      <button className="room-outline-button min-h-9 px-3" type="button" onClick={() => bookFromMoment(work)}>
                        <PlayGlyph className="h-3.5 w-3.5" />
                        Book {currentTrack?.id === work.id ? formatAudioTime(currentTime) : "0:00"}
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          {releases.length > 0 ? (
            <section className="border-b border-roomBorder px-8 py-12 md:px-12">
              <ProfileSectionTitle title="Releases / Albums & EPs" />
              <div className="mt-7 grid gap-4 lg:grid-cols-3">
                {releases.map((release) => {
                  const tracks = (releaseTracks[release.id] ?? [])
                    .map((trackId) => works.find((work) => work.id === trackId))
                    .filter((work): work is Work => Boolean(work));
                  const firstTrack = tracks.find((work) => work.link) ?? tracks[0] ?? null;
                  return (
                    <article className="border border-roomBorder bg-[#080808] p-4" key={release.id}>
                      <div
                        className="h-44 border border-roomBorder bg-inkPanel bg-cover bg-center grayscale"
                        style={{ backgroundImage: cssImageUrl(release.cover_image || getWorkCoverUrl(firstTrack, dj)) }}
                      />
                      <div className="mt-4 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="room-tiny text-acidGreen">{release.release_type}</p>
                          <Link
                            className="mt-2 block truncate font-display text-2xl uppercase text-paperWhite hover:text-acidGreen"
                            href={`/release/${release.id}`}
                          >
                            {release.title}
                          </Link>
                          <p className="mt-1 font-mono text-[10px] uppercase text-mutedText">
                            {tracks.length} track{tracks.length === 1 ? "" : "s"} / {release.visibility}
                          </p>
                        </div>
                        {firstTrack?.link ? (
                          <button
                            aria-label={`Play ${release.title}`}
                            className="grid h-10 w-10 shrink-0 place-items-center border border-paperWhite bg-paperWhite text-black"
                            onClick={() => {
                              const playable = tracks
                                .filter((work) => work.link)
                                .map((work) => ({
                                  id: work.id,
                                  title: work.title || "Untitled track",
                                  artist: name,
                                  src: work.link || "",
                                  djId: work.dj_id,
                                  coverUrl: getWorkCoverUrl(work, dj),
                                  description: [work.genre || dj.genres, work.bpm || dj.bpm_range].filter(Boolean).join(" / ")
                                }));
                              playQueue(playable, 0);
                            }}
                            type="button"
                          >
                            <PlayIcon />
                          </button>
                        ) : null}
                      </div>
                      {release.description ? (
                        <p className="mt-3 line-clamp-2 text-sm leading-6 text-mutedText">{release.description}</p>
                      ) : null}
                      <div className="mt-4 space-y-2 border-t border-roomBorder pt-4">
                        {tracks.length === 0 ? (
                          <p className="text-sm text-mutedText">No public tracks attached yet.</p>
                        ) : (
                          tracks.slice(0, 4).map((work, index) => (
                            <Link
                              className="flex items-center justify-between gap-3 border border-roomBorder px-3 py-2 font-mono text-[10px] uppercase text-mutedText hover:border-acidGreen hover:text-acidGreen"
                              href={`/track/${work.id}`}
                              key={work.id}
                            >
                              <span className="truncate">
                                {String(index + 1).padStart(2, "0")} / {work.title || "Untitled"}
                              </span>
                              <span>{work.bpm || dj.bpm_range || "--"}</span>
                            </Link>
                          ))
                        )}
                      </div>
                      <Link
                        className="room-outline-button mt-4 w-full"
                        href={`/release/${release.id}`}
                      >
                        Open Release
                      </Link>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="grid border-b border-roomBorder md:grid-cols-2">
            <article className="border-b border-roomBorder p-8 md:border-b-0 md:border-r md:p-12">
              <ProfileSectionTitle title="Dossier / Bio" />
              <p className="mt-7 max-w-[620px] text-base leading-8 text-neutral-300">{bioCopy}</p>
            </article>
            <article className="p-8 md:p-12">
              <ProfileSectionTitle title="Upcoming Logistics" />
              <div className="mt-7 space-y-5">
                {tourDates.map(([date, city, venue, status]) => (
                  <div className="grid grid-cols-[80px_1fr_auto] gap-4 border-b border-roomBorder pb-5 font-mono text-[11px] uppercase" key={`${date}-${city}`}>
                    <span className="text-acidGreen">{date}</span>
                    <span className="font-black text-paperWhite">{venue}</span>
                    <span className="text-right text-mutedText">{city}<br />{status}</span>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="grid gap-6 px-8 py-12 md:px-12 xl:grid-cols-[1fr_330px]">
            <div>
              <ProfileSectionTitle title="Reviews" />
              <div className="mt-6 space-y-3">
                {reviews.length === 0 ? (
                  <article className="border border-line p-5">
                    <p className="room-muted">No reviews yet. Accepted organizers and venues can leave feedback.</p>
                  </article>
                ) : (
                  reviews.slice(0, 3).map((review) => (
                    <article className="border border-line p-5" key={review.id}>
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <p className="font-display text-2xl uppercase">{review.rating}/5</p>
                        <p className="font-mono text-[11px] uppercase text-ash">
                          {new Date(review.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-neutral-300">
                        {review.comment || "No written comment."}
                      </p>
                    </article>
                  ))
                )}
              </div>
            </div>

            <form className="border border-line p-5" onSubmit={submitReview}>
              <p className="room-tiny">V2 Ratings</p>
              <h3 className="room-heading mt-2 text-2xl">Leave Review</h3>
              <div className="mt-5">
                <label className="room-label" htmlFor="rating">
                  Rating
                </label>
                <select
                  id="rating"
                  className="room-input"
                  value={rating}
                  onChange={(event) => setRating(event.target.value)}
                >
                  {[5, 4, 3, 2, 1].map((value) => (
                    <option className="bg-black" key={value} value={value}>
                      {value}/5
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-5">
                <label className="room-label" htmlFor="review">
                  Comment
                </label>
                <textarea
                  id="review"
                  className="room-input min-h-28 resize-y"
                  value={reviewComment}
                  onChange={(event) => setReviewComment(event.target.value)}
                  placeholder="Booking quality, sound, communication..."
                />
              </div>
              <button className="room-white-button mt-5 w-full" disabled={isSubmittingReview} type="submit">
                {isSubmittingReview ? "Publishing..." : "Publish Review"}
              </button>
            </form>
          </section>
        </div>

      </section>

      <BookingTrustDrawer
        acceptRate={acceptRate}
        confirmedGigs={confirmedGigs}
        dj={dj}
        featuredBookingHref={featuredBookingHref}
        notice={notice}
        open={trustPanelOpen}
        onClose={() => setTrustPanelOpen(false)}
      />

    </main>
  );
}

function ProfileSectionTitle({ title }: { title: string }) {
  return <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-mutedText">{title}</h2>;
}

function BookingTrustDrawer({
  acceptRate,
  confirmedGigs,
  dj,
  featuredBookingHref,
  notice,
  open,
  onClose
}: {
  acceptRate: string;
  confirmedGigs: number;
  dj: DjProfile;
  featuredBookingHref: string;
  notice: string;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70" onClick={onClose}>
      <aside
        className="absolute right-0 top-0 h-full w-[min(430px,100vw)] overflow-y-auto border-l border-strongBorder bg-[#070707] pb-24"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-roomBorder p-6">
          <div>
            <p className="font-display text-2xl uppercase tracking-[0.12em] text-paperWhite">Booking Trust</p>
            <p className="mt-2 font-mono text-[10px] uppercase text-mutedText">Verification & Metrics</p>
          </div>
          <button className="room-outline-button min-h-9 px-3" onClick={onClose} type="button">
            Close
          </button>
        </div>

        <div className="border-b border-roomBorder p-6">
          <div className="border border-roomBorder p-5">
            <p className="font-mono text-[10px] uppercase text-mutedText">Accept Rate</p>
            <p className="mt-3 font-display text-4xl uppercase text-paperWhite">
              {acceptRate}<span className="text-acidGreen">%</span>
            </p>
            <p className="mt-3 text-right font-mono text-[10px] uppercase text-acidGreen">Top 5%</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <TrustMetric label="Avg Reply" value="<24h" />
            <TrustMetric label="Confirmed" value={`${confirmedGigs} gigs`} />
          </div>
          <div className="mt-7 space-y-3 font-mono text-[11px] uppercase text-mutedText">
            {[
              ["Escrow ready", "OK"],
              ["Profile complete", "OK"],
              ["Rider uploaded", dj.technical_rider_url ? "OK" : "Missing"]
            ].map(([item, state]) => (
              <p className="flex items-center justify-between gap-4" key={item}>
                <span>{item}</span>
                <span className={state === "OK" ? "text-acidGreen" : "text-warningOrange"}>{state}</span>
              </p>
            ))}
          </div>
        </div>

        <div className="border-b border-roomBorder p-6">
          <p className="room-tiny">Current availability</p>
          <div className="mt-6 grid grid-cols-4 gap-1">
            {["Q1", "Q2", "Q3", "Q4"].map((quarter, index) => (
              <div key={quarter}>
                <div className={index === 1 || index === 2 ? "h-2 bg-acidGreen" : "h-2 bg-roomBorder"} />
                <p className="mt-2 font-mono text-[9px] uppercase text-mutedText">{quarter}</p>
              </div>
            ))}
          </div>
          <Link className="room-white-button mt-7 w-full min-h-11" href={featuredBookingHref}>
            Initiate Booking
          </Link>
          {notice ? <p className="mt-5 border border-roomBorder p-3 text-sm text-neutral-200">{notice}</p> : null}
        </div>

        <div className="p-6">
          <div className="space-y-3">
            <p className="room-tiny">Fee</p>
            <p className="font-display text-3xl uppercase text-paperWhite">{formatPrice(dj.price)}</p>
            <p className="room-tiny pt-4">External links</p>
            {dj.soundcloud_url ? (
              <a className="room-outline-button w-full min-h-9 px-4" href={dj.soundcloud_url} target="_blank" rel="noreferrer">
                <ExternalGlyph className="h-3.5 w-3.5" />
                SoundCloud
              </a>
            ) : null}
            {dj.mixcloud_url ? (
              <a className="room-outline-button w-full min-h-9 px-4" href={dj.mixcloud_url} target="_blank" rel="noreferrer">
                <ExternalGlyph className="h-3.5 w-3.5" />
                Mixcloud
              </a>
            ) : null}
            {dj.technical_rider_url ? (
              <a className="room-outline-button w-full min-h-9 px-4" href={dj.technical_rider_url} target="_blank" rel="noreferrer">
                <ExternalGlyph className="h-3.5 w-3.5" />
                Technical Rider
              </a>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}

function TrustMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-roomBorder bg-[#050505] p-4">
      <p className="room-tiny">{label}</p>
      <p className="mt-2 font-display text-2xl uppercase">{value}</p>
    </div>
  );
}

function DossierWaveform({ activeIndex, label }: { activeIndex: number; label: string }) {
  return (
    <div className="mt-8">
      <Room9Waveform
        active
        barCount={96}
        className="h-36 gap-[5px] px-0 pb-5"
        markerLabel={label}
        progressRatio={activeIndex / 96}
        reactive
        seed={label}
        selectedRatio={activeIndex / 96}
      />
      <div className="mt-2 grid grid-cols-4 font-mono text-[9px] uppercase text-mutedText">
        <span>Intro</span>
        <span>Build</span>
        <span>Peak</span>
        <span className="text-right">Closing</span>
      </div>
    </div>
  );
}

function mapReleaseTracks(rows: Array<{ release_id: string; work_id: string }> | null) {
  return (rows ?? []).reduce<Record<string, string[]>>((acc, row) => {
    acc[row.release_id] = [...(acc[row.release_id] ?? []), row.work_id];
    return acc;
  }, {});
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" className="h-3 w-3 fill-current" viewBox="0 0 12 12">
      <path d="M3 1.5v9l7-4.5-7-4.5Z" />
    </svg>
  );
}

function PreviousIcon() {
  return (
    <svg aria-hidden="true" className="h-3 w-3 fill-current" viewBox="0 0 12 12">
      <path d="M2 1.5h1.5v9H2v-9Zm8 0L4 6l6 4.5v-9Z" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg aria-hidden="true" className="h-3 w-3 fill-current" viewBox="0 0 12 12">
      <path d="M8.5 1.5H10v9H8.5v-9ZM2 1.5 8 6l-6 4.5v-9Z" />
    </svg>
  );
}
