"use client";

import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { MissingConfigNotice } from "@/components/AuthNotice";
import {
  Button,
  ButtonLink,
  Input,
  MetricCard,
  Panel,
  SectionHeader,
  Select,
  StatusBadge,
  Text,
  Textarea,
  cx
} from "@/components/room9-ui";
import {
  WorkspaceMetricGrid,
  WorkspaceNotice,
  WorkspaceOpsHeader,
  WorkspacePageFrame
} from "@/components/workspace/WorkspaceShell";
import {
  getRoleUnlockDoneCount,
  getRoleUnlockGate,
  getRoleUnlockNextStep,
  getRoleUnlockPath,
  getRoleUnlockPaths,
  type RoleUnlockPath
} from "@/lib/roleVerification";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  isMissingAuthSession,
  logSupabaseError,
  withSupabaseRetry
} from "@/lib/supabase";
import { activateRoleAccess, loadRoleAccess } from "@/lib/roleAccess";
import {
  hasRoleAccess,
  isBookingClientRole,
  type Booking,
  type DjProfile,
  type EventLineupSlot,
  type EventPost,
  type OrganizerProfile,
  type Profile,
  type Role,
  type SavedMoment,
  type VenueProfile,
  type Work
} from "@/lib/types";

type DjSettingsForm = {
  stage_name: string;
  bio: string;
  country: string;
  city: string;
  genres: string;
  bpm_range: string;
  price: string;
  avatar_url: string;
  cover_image_url: string;
  profile_theme: string;
  soundcloud_url: string;
  mixcloud_url: string;
  technical_rider_url: string;
  is_available: boolean;
};

type OrganizerSettingsForm = {
  organization_name: string;
  country: string;
  city: string;
  contact_email: string;
  description: string;
};

type VenueSettingsForm = {
  venue_name: string;
  country: string;
  city: string;
  address: string;
  capacity: string;
  description: string;
  website_url: string;
  instagram_url: string;
};

const emptyDjForm: DjSettingsForm = {
  stage_name: "",
  bio: "",
  country: "",
  city: "",
  genres: "",
  bpm_range: "",
  price: "",
  avatar_url: "",
  cover_image_url: "",
  profile_theme: "warehouse",
  soundcloud_url: "",
  mixcloud_url: "",
  technical_rider_url: "",
  is_available: true
};

const emptyOrganizerForm: OrganizerSettingsForm = {
  organization_name: "",
  country: "",
  city: "",
  contact_email: "",
  description: ""
};

const emptyVenueForm: VenueSettingsForm = {
  venue_name: "",
  country: "",
  city: "",
  address: "",
  capacity: "",
  description: "",
  website_url: "",
  instagram_url: ""
};

export default function DashboardSettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [djProfile, setDjProfile] = useState<DjProfile | null>(null);
  const [organizerProfile, setOrganizerProfile] = useState<OrganizerProfile | null>(null);
  const [venueProfile, setVenueProfile] = useState<VenueProfile | null>(null);
  const [activeRoles, setActiveRoles] = useState<Role[]>(["listener"]);
  const [works, setWorks] = useState<Work[]>([]);
  const [events, setEvents] = useState<EventPost[]>([]);
  const [eventLineupSlots, setEventLineupSlots] = useState<EventLineupSlot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [savedMoments, setSavedMoments] = useState<SavedMoment[]>([]);
  const [roleDraft, setRoleDraft] = useState<Role>("listener");
  const [djForm, setDjForm] = useState<DjSettingsForm>(emptyDjForm);
  const [organizerForm, setOrganizerForm] = useState<OrganizerSettingsForm>(emptyOrganizerForm);
  const [venueForm, setVenueForm] = useState<VenueSettingsForm>(emptyVenueForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState<keyof Pick<DjSettingsForm, "avatar_url" | "cover_image_url" | "technical_rider_url"> | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [unlockTarget, setUnlockTarget] = useState<string | null>(null);

  useEffect(() => {
    setUnlockTarget(new URLSearchParams(window.location.search).get("unlock"));

    if (!hasSupabaseConfig()) {
      return;
    }

    loadSettings();
  }, []);

  async function loadSettings() {
    setIsLoading(true);
    setError("");

    try {
      const supabase = getSupabase();
      const { data: sessionData, error: sessionError } = await withSupabaseRetry(
        "Dashboard settings session",
        () => supabase.auth.getSession()
      );

      if (sessionError) {
        if (isMissingAuthSession(sessionError)) {
          router.push("/login?next=/dashboard/settings");
          return;
        }

        logSupabaseError("Dashboard settings session failed", sessionError);
        setError(formatSupabaseError(sessionError, "Could not load settings."));
        return;
      }

      if (!sessionData.session?.user) {
        router.push("/login?next=/dashboard/settings");
        return;
      }

      const { data: profileData, error: profileError } = await withSupabaseRetry(
        "Dashboard settings profile",
        () => supabase
          .from("profiles")
          .select("*")
          .eq("id", sessionData.session.user.id)
          .maybeSingle()
      );

      if (profileError || !profileData) {
        logSupabaseError("Dashboard settings profile failed", profileError);
        setError(formatSupabaseError(profileError, "Could not load profile settings."));
        return;
      }

      const loadedProfile = profileData as Profile;
      setProfile(loadedProfile);
      setRoleDraft(loadedProfile.role);
      let loadedRoles: Role[] = ["listener"];
      try {
        loadedRoles = await loadRoleAccess(supabase, loadedProfile.id, loadedProfile.role);
        setActiveRoles(loadedRoles);
      } catch (roleAccessError) {
        logSupabaseError("Dashboard settings role access load failed", roleAccessError);
        setActiveRoles(["listener"]);
      }

      const [{ data: djData }, { data: organizerData }, { data: venueData }] = await withSupabaseRetry(
        "Dashboard settings role profiles",
        () => Promise.all([
          supabase.from("dj_profiles").select("*").eq("user_id", loadedProfile.id).maybeSingle(),
          supabase.from("organizer_profiles").select("*").eq("user_id", loadedProfile.id).maybeSingle(),
          supabase.from("venue_profiles").select("*").eq("user_id", loadedProfile.id).maybeSingle()
        ])
      );

      const loadedDj = (djData as DjProfile | null) ?? null;
      const loadedOrganizer = (organizerData as OrganizerProfile | null) ?? null;
      const loadedVenue = (venueData as VenueProfile | null) ?? null;
      setDjProfile(loadedDj);
      setOrganizerProfile(loadedOrganizer);
      setVenueProfile(loadedVenue);
      setDjForm(djToForm(loadedDj));
      setOrganizerForm(organizerToForm(loadedOrganizer));
      setVenueForm(venueToForm(loadedVenue));

      const [
        { data: savedMomentData, error: savedMomentError },
        { data: eventData, error: eventError },
        { data: organizerBookingData, error: organizerBookingError }
      ] = await withSupabaseRetry(
        "Dashboard settings workspace records",
        () => Promise.all([
          supabase.from("saved_moments").select("*").eq("user_id", loadedProfile.id).order("created_at", { ascending: false }).limit(24),
          supabase.from("events").select("*").eq("organizer_id", loadedProfile.id).order("event_date", { ascending: true }).limit(24),
          supabase.from("bookings").select("*").eq("organizer_id", loadedProfile.id).order("created_at", { ascending: false }).limit(24)
        ])
      );

      if (savedMomentError) {
        logSupabaseError("Dashboard settings saved moments load failed", savedMomentError);
      } else {
        setSavedMoments((savedMomentData as SavedMoment[]) ?? []);
      }

      const loadedEvents = eventError ? [] : ((eventData as EventPost[]) ?? []);
      if (eventError) {
        logSupabaseError("Dashboard settings events load failed", eventError);
      }
      setEvents(loadedEvents);

      const mergedBookings = new Map<string, Booking>();
      if (organizerBookingError) {
        logSupabaseError("Dashboard settings organizer bookings load failed", organizerBookingError);
      } else {
        ((organizerBookingData as Booking[]) ?? []).forEach((booking) => mergedBookings.set(booking.id, booking));
      }

      if (loadedDj) {
        const [{ data: workData, error: workError }, { data: djBookingData, error: djBookingError }] = await withSupabaseRetry(
          "Dashboard settings DJ records",
          () => Promise.all([
            supabase.from("works").select("*").eq("dj_id", loadedDj.id).eq("is_deleted", false).order("created_at", { ascending: false }).limit(24),
            supabase.from("bookings").select("*").eq("dj_id", loadedDj.id).order("created_at", { ascending: false }).limit(24)
          ])
        );

        if (workError) {
          logSupabaseError("Dashboard settings works load failed", workError);
        } else {
          setWorks((workData as Work[]) ?? []);
        }

        if (djBookingError) {
          logSupabaseError("Dashboard settings DJ bookings load failed", djBookingError);
        } else {
          ((djBookingData as Booking[]) ?? []).forEach((booking) => mergedBookings.set(booking.id, booking));
        }
      } else {
        setWorks([]);
      }

      setBookings(Array.from(mergedBookings.values()));

      if (loadedEvents.length > 0 && isBookingClientRole(loadedRoles)) {
        const { data: slotData, error: slotError } = await withSupabaseRetry(
          "Dashboard settings lineup slots",
          () => supabase
            .from("event_lineup_slots")
            .select("*")
            .in("event_id", loadedEvents.map((event) => event.id))
            .order("position", { ascending: true })
        );

        if (slotError) {
          logSupabaseError("Dashboard settings lineup slots load failed", slotError);
          setEventLineupSlots([]);
        } else {
          setEventLineupSlots((slotData as EventLineupSlot[]) ?? []);
        }
      } else {
        setEventLineupSlots([]);
      }
    } catch (caughtError) {
      logSupabaseError("Dashboard settings unexpected failure", caughtError);
      setError(formatSupabaseError(caughtError, "Could not load settings."));
    } finally {
      setIsLoading(false);
    }
  }

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) {
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const supabase = getSupabase();
      const requestedPath = getRoleUnlockPath(roleDraft, {
        activeRoles,
        bookings,
        djProfile,
        eventLineupSlots,
        events,
        organizerProfile,
        savedMoments,
        venueProfile,
        works
      });
      const activationGate = getRoleUnlockGate(requestedPath);

      if (!activationGate.canActivate) {
        setError(activationGate.message);
        return;
      }

      const { data, error: updateError } = await supabase
        .from("profiles")
        .update({ role: roleDraft })
        .eq("id", profile.id)
        .select("*")
        .single();

      if (updateError) {
        logSupabaseError("Dashboard settings role update failed", updateError);
        setError(formatSupabaseError(updateError, "Could not update role access."));
        return;
      }

      const updatedProfile = data as Profile;
      setProfile(updatedProfile);
      const nextActiveRoles =
        roleDraft === "listener"
          ? await loadRoleAccess(supabase, profile.id, "listener")
          : await activateRoleAccess(supabase, profile.id, roleDraft);
      setActiveRoles(nextActiveRoles);
      const nextPath =
        typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("next");
      if (isSafeInternalPath(nextPath) && isBookingClientRole(nextActiveRoles)) {
        router.push(nextPath);
        return;
      }

      setNotice("Workspace access updated. Use the sidebar to open the unlocked tools.");
    } catch (caughtError) {
      logSupabaseError("Dashboard settings role unexpected failure", caughtError);
      setError(formatSupabaseError(caughtError, "Could not update role access."));
    } finally {
      setIsSaving(false);
    }
  }

  async function saveDjProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) {
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");

    const payload = {
      user_id: profile.id,
      stage_name: djForm.stage_name,
      bio: djForm.bio,
      country: djForm.country,
      city: djForm.city,
      genres: djForm.genres,
      bpm_range: djForm.bpm_range,
      price: djForm.price ? Number(djForm.price) : null,
      avatar_url: djForm.avatar_url,
      cover_image_url: djForm.cover_image_url,
      profile_theme: djForm.profile_theme,
      soundcloud_url: djForm.soundcloud_url,
      mixcloud_url: djForm.mixcloud_url,
      technical_rider_url: djForm.technical_rider_url,
      is_available: djForm.is_available
    };

    try {
      const supabase = getSupabase();
      const request = djProfile
        ? supabase.from("dj_profiles").update(payload).eq("id", djProfile.id).select("*").single()
        : supabase.from("dj_profiles").insert(payload).select("*").single();
      let { data, error: saveError } = await request;

      if (saveError && isMissingRiderColumn(saveError)) {
        const fallbackPayload = { ...payload };
        delete (fallbackPayload as Partial<typeof payload>).technical_rider_url;
        const fallbackRequest = djProfile
          ? supabase.from("dj_profiles").update(fallbackPayload).eq("id", djProfile.id).select("*").single()
          : supabase.from("dj_profiles").insert(fallbackPayload).select("*").single();
        const fallback = await fallbackRequest;
        data = fallback.data;
        saveError = fallback.error;
        if (!saveError) {
          setNotice("DJ profile saved. Rider upload needs the latest schema.sql column technical_rider_url.");
        }
      }

      if (saveError) {
        logSupabaseError("Dashboard settings DJ save failed", saveError);
        setError(formatSupabaseError(saveError, "Could not save DJ profile."));
        return;
      }

      const saved = data as DjProfile;
      setDjProfile(saved);
      setDjForm({ ...djToForm(saved), technical_rider_url: djForm.technical_rider_url });
      setNotice((current) => current || "DJ profile saved.");
    } catch (caughtError) {
      logSupabaseError("Dashboard settings DJ unexpected save failure", caughtError);
      setError(formatSupabaseError(caughtError, "Could not save DJ profile."));
    } finally {
      setIsSaving(false);
    }
  }

  async function uploadDjAsset(
    event: ChangeEvent<HTMLInputElement>,
    field: "avatar_url" | "cover_image_url" | "technical_rider_url"
  ) {
    if (!profile) {
      return;
    }

    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const isRider = field === "technical_rider_url";
    const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const documentTypes = ["application/pdf"];
    const allowedTypes = isRider ? documentTypes : imageTypes;

    if (file.type && !allowedTypes.includes(file.type)) {
      setError(isRider ? "Upload a PDF technical rider." : "Upload a JPG, PNG, WEBP, or GIF image.");
      event.target.value = "";
      return;
    }

    setUploadingAsset(field);
    setError("");
    setNotice("");

    try {
      const supabase = getSupabase();
      const bucket = isRider ? "documents" : "images";
      const cleanName = file.name.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
      const path = `${profile.id}/dj-${field}-${Date.now()}-${cleanName}`;
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
        cacheControl: isRider ? "3600" : "60",
        upsert: false
      });

      if (uploadError) {
        logSupabaseError("Dashboard settings DJ asset upload failed", uploadError);
        setError(
          formatSupabaseError(
            uploadError,
            isRider
              ? 'Upload failed. Run the latest schema.sql or create a public "documents" bucket.'
              : 'Upload failed. Create a public "images" bucket and retry.'
          )
        );
        return;
      }

      const publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      setDjForm((current) => ({ ...current, [field]: publicUrl }));
      let savedProfile: DjProfile | null = null;
      let riderSchemaFallback = false;

      if (djProfile) {
        const { data: updatedProfile, error: updateError } = await supabase
          .from("dj_profiles")
          .update({ [field]: publicUrl })
          .eq("id", djProfile.id)
          .eq("user_id", profile.id)
          .select("*")
          .single();

        if (updateError) {
          logSupabaseError("Dashboard settings DJ asset update failed", updateError);
          if (field === "technical_rider_url" && isMissingRiderColumn(updateError)) {
            setNotice("Rider uploaded. Run schema.sql to add technical_rider_url before it can attach to the profile.");
          } else {
            setError(formatSupabaseError(updateError, "File uploaded, but profile media could not update."));
          }
          return;
        }
        savedProfile = updatedProfile as DjProfile;
      } else {
        const draftPayload = {
          user_id: profile.id,
          stage_name: djForm.stage_name || profile.email || "ROOM_9 Artist",
          bio: djForm.bio,
          country: djForm.country,
          city: djForm.city,
          genres: djForm.genres,
          bpm_range: djForm.bpm_range,
          price: djForm.price ? Number(djForm.price) : null,
          avatar_url: field === "avatar_url" ? publicUrl : djForm.avatar_url,
          cover_image_url: field === "cover_image_url" ? publicUrl : djForm.cover_image_url,
          profile_theme: djForm.profile_theme,
          soundcloud_url: djForm.soundcloud_url,
          mixcloud_url: djForm.mixcloud_url,
          technical_rider_url: field === "technical_rider_url" ? publicUrl : djForm.technical_rider_url,
          is_available: djForm.is_available
        };

        let { data: createdProfile, error: createError } = await supabase
          .from("dj_profiles")
          .insert(draftPayload)
          .select("*")
          .single();

        if (createError && field === "technical_rider_url" && isMissingRiderColumn(createError)) {
          riderSchemaFallback = true;
          const fallbackPayload = { ...draftPayload };
          delete (fallbackPayload as Partial<typeof draftPayload>).technical_rider_url;
          const fallback = await supabase.from("dj_profiles").insert(fallbackPayload).select("*").single();
          createdProfile = fallback.data;
          createError = fallback.error;
        }

        if (createError) {
          logSupabaseError("Dashboard settings DJ asset profile draft create failed", createError);
          setError(formatSupabaseError(createError, "File uploaded, but a DJ profile draft could not be created."));
          return;
        }

        savedProfile = createdProfile as DjProfile;
      }

      if (savedProfile) {
        setDjProfile(savedProfile);
        setDjForm({ ...djToForm(savedProfile), [field]: publicUrl });
      }

      if (riderSchemaFallback) {
        setNotice("Rider uploaded. Profile draft created, but run schema.sql to attach technical_rider_url permanently.");
      } else {
        setNotice(isRider ? "Technical rider uploaded." : field === "avatar_url" ? "Avatar uploaded." : "Cover uploaded.");
      }
    } catch (caughtError) {
      logSupabaseError("Dashboard settings DJ asset unexpected failure", caughtError);
      setError(formatSupabaseError(caughtError, "Could not upload file."));
    } finally {
      setUploadingAsset(null);
      event.target.value = "";
    }
  }

  async function saveOrganizerProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) {
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");

    const payload = { user_id: profile.id, ...organizerForm };

    try {
      const supabase = getSupabase();
      const request = organizerProfile
        ? supabase.from("organizer_profiles").update(payload).eq("id", organizerProfile.id).select("*").single()
        : supabase.from("organizer_profiles").insert(payload).select("*").single();
      const { data, error: saveError } = await request;

      if (saveError) {
        logSupabaseError("Dashboard settings organizer save failed", saveError);
        setError(formatSupabaseError(saveError, "Could not save organizer profile."));
        return;
      }

      const saved = data as OrganizerProfile;
      setOrganizerProfile(saved);
      setOrganizerForm(organizerToForm(saved));
      setNotice("Organizer profile saved.");
    } catch (caughtError) {
      logSupabaseError("Dashboard settings organizer unexpected save failure", caughtError);
      setError(formatSupabaseError(caughtError, "Could not save organizer profile."));
    } finally {
      setIsSaving(false);
    }
  }

  async function saveVenueProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) {
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");

    const payload = {
      user_id: profile.id,
      venue_name: venueForm.venue_name,
      country: venueForm.country,
      city: venueForm.city,
      address: venueForm.address,
      capacity: venueForm.capacity ? Number(venueForm.capacity) : null,
      description: venueForm.description,
      website_url: venueForm.website_url,
      instagram_url: venueForm.instagram_url
    };

    try {
      const supabase = getSupabase();
      const request = venueProfile
        ? supabase.from("venue_profiles").update(payload).eq("id", venueProfile.id).select("*").single()
        : supabase.from("venue_profiles").insert(payload).select("*").single();
      const { data, error: saveError } = await request;

      if (saveError) {
        logSupabaseError("Dashboard settings venue save failed", saveError);
        setError(formatSupabaseError(saveError, "Could not save venue profile."));
        return;
      }

      const saved = data as VenueProfile;
      setVenueProfile(saved);
      setVenueForm(venueToForm(saved));
      setNotice("Venue profile saved.");
    } catch (caughtError) {
      logSupabaseError("Dashboard settings venue unexpected save failure", caughtError);
      setError(formatSupabaseError(caughtError, "Could not save venue profile."));
    } finally {
      setIsSaving(false);
    }
  }

  if (!hasSupabaseConfig()) {
    return <MissingConfigNotice />;
  }

  if (isLoading) {
    return (
      <main className="room-page">
        <section className="room-shell py-12">
          <div className="room-card min-h-[560px] animate-pulse" />
        </section>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="room-page">
        <section className="room-shell py-12">
          <EmptyState title="Settings unavailable" message={error || "Log in again to continue."} href="/login?next=/dashboard/settings" action="Login" />
        </section>
      </main>
    );
  }

  const activeProfileName =
    djProfile?.stage_name || organizerProfile?.organization_name || venueProfile?.venue_name || profile.email || "ROOM_9";
  const hasProfessionalAccess = hasRoleAccess(activeRoles, ["dj", "organizer", "venue", "admin"]);
  const settingsRole = getPrimarySettingsRole(profile.role, activeRoles);
  const verificationState = {
    activeRoles,
    bookings,
    djProfile,
    eventLineupSlots,
    events,
    organizerProfile,
    savedMoments,
    venueProfile,
    works
  };
  const unlockPaths = getRoleUnlockPaths(verificationState);
  const activeUnlockPath = getRoleUnlockPath(settingsRole, verificationState);
  const selectedUnlockPath = getRoleUnlockPath(roleDraft, verificationState);
  const selectedNextStep = getRoleUnlockNextStep(selectedUnlockPath);
  const settingsReadiness = activeUnlockPath.readiness;
  const unlockContext = getUnlockContext(unlockTarget);
  const activeProfileStatus = getActiveProfileStatus(settingsRole, djProfile, organizerProfile, venueProfile);

  return (
    <WorkspacePageFrame
      active="settings"
      email={profile.email}
      profileLabel={activeProfileName}
      readiness={settingsReadiness}
      role={activeRoles}
    >
      <div className="px-room-3 py-room-3 xl:px-room-4">
        <WorkspaceOpsHeader
          actions={
            <>
              {djProfile ? (
                <ButtonLink href={`/dj/${djProfile.id}`} variant="secondary">
                  Public Dossier
                </ButtonLink>
              ) : null}
              <ButtonLink href="/library" variant="primary">
                Sound Vault
              </ButtonLink>
              <ButtonLink href="/dashboard/events" variant="secondary">
                Event Desk
              </ButtonLink>
            </>
          }
          description="Account access, role verification, public profile editing, and routing rules live here. Registration stays listener-first."
          eyebrow="Workspace / Settings"
          title="Settings Control"
        />

        {error ? <WorkspaceNotice tone="error">{error}</WorkspaceNotice> : null}
        {notice ? <WorkspaceNotice tone="success">{notice}</WorkspaceNotice> : null}
        {unlockContext ? (
          <WorkspaceNotice>
            {unlockContext.title}: {unlockContext.copy}
          </WorkspaceNotice>
        ) : null}

        <WorkspaceMetricGrid columns={4}>
          <MetricCard active label="Account model" note="Every user starts here" value={activeRoles.join(" / ")} />
          <MetricCard label="Profile readiness" note={activeProfileStatus} value={`${settingsReadiness}%`} />
          <MetricCard label="Music mode" note="Listening, saves, playlists" value="On" />
          <MetricCard label="Booking tools" note="DJ / Organizer / Venue" value={hasProfessionalAccess ? "Unlocked" : "Locked"} />
        </WorkspaceMetricGrid>

        <SettingsCommandStrip
          activeProfileName={activeProfileName}
          activeProfileStatus={activeProfileStatus}
          hasProfessionalAccess={hasProfessionalAccess}
          nextStep={selectedNextStep}
          selectedUnlockPath={selectedUnlockPath}
          readiness={settingsReadiness}
          role={roleDraft}
        />

        <div className="mt-room-4 grid gap-room-4 2xl:grid-cols-[0.85fr_1.15fr]">
          <Panel className="p-room-3">
            <SectionHeader eyebrow="Identity" title="Account Record" />
            <div className="mt-room-3 grid gap-px bg-line">
              <SettingsFact label="Email" value={profile.email || "No email"} />
              <SettingsFact label="Active access" value={activeRoles.join(" / ")} />
              <SettingsFact label="Provider" value="Supabase email/password" />
              <SettingsFact label="Active profile" value={activeProfileName} />
            </div>
          </Panel>

          <Panel className="p-room-3">
            <SectionHeader
              eyebrow="Role Verification Center"
              title="Listener Default / Tool Unlocks"
              action={<StatusBadge status={hasProfessionalAccess ? "verified" : "draft"}>{hasProfessionalAccess ? "tools active" : "listener"}</StatusBadge>}
            />
            <Text className="mt-room-2" variant="small">
              Every account starts as a listener. DJ, organizer and venue access unlocks the professional workspace without changing the core music account.
            </Text>
            <form className="mt-room-3 grid gap-room-3 lg:grid-cols-[minmax(0,1fr)_auto]" onSubmit={saveRole}>
              <label>
                <span className="room-label">Workspace role</span>
                <Select onChange={(event) => setRoleDraft(event.target.value as Role)} value={roleDraft}>
                  <option className="bg-black" value="listener">Listener</option>
                  <option className="bg-black" value="dj">DJ</option>
                  <option className="bg-black" value="organizer">Organizer</option>
                  <option className="bg-black" value="venue">Venue</option>
                </Select>
              </label>
              <Button className="self-end" loading={isSaving} type="submit" variant="primary">
                Request Access
              </Button>
            </form>
            <div className="mt-room-3 border border-roomBorder bg-black p-room-2">
              <div className="flex flex-wrap items-center justify-between gap-room-2">
                <Text variant="uiLabel">Selected unlock gate</Text>
                <StatusBadge status={getRoleUnlockGate(selectedUnlockPath).canActivate ? "accepted" : "locked"}>
                  {getRoleUnlockGate(selectedUnlockPath).label}
                </StatusBadge>
              </div>
              <Text className="mt-room-1" variant="small">
                {getRoleUnlockGate(selectedUnlockPath).message}
              </Text>
            </div>
            <div className="mt-room-3 grid gap-room-2 md:grid-cols-2">
              {unlockPaths.map((path) => (
                <RoleCard
                  key={path.role}
                  onSelect={() => setRoleDraft(path.role)}
                  path={path}
                  selected={roleDraft === path.role}
                />
              ))}
            </div>
          </Panel>
        </div>

        <div className="mt-room-4 grid gap-room-4 2xl:grid-cols-[1fr_1fr]">
          {!hasProfessionalAccess ? <ListenerAccessPreview /> : null}
          {roleDraft === "dj" || hasRoleAccess(activeRoles, ["dj"]) ? (
            <DjProfileSettingsForm
              form={djForm}
              isSaving={isSaving}
              setForm={setDjForm}
              uploadingAsset={uploadingAsset}
              onAssetUpload={uploadDjAsset}
              onSubmit={saveDjProfile}
            />
          ) : null}
          {roleDraft === "organizer" || hasRoleAccess(activeRoles, ["organizer"]) ? (
            <OrganizerProfileSettingsForm form={organizerForm} isSaving={isSaving} setForm={setOrganizerForm} onSubmit={saveOrganizerProfile} />
          ) : null}
          {roleDraft === "venue" || hasRoleAccess(activeRoles, ["venue"]) ? (
            <VenueProfileSettingsForm form={venueForm} isSaving={isSaving} setForm={setVenueForm} onSubmit={saveVenueProfile} />
          ) : null}

          <VerificationPanel
            hasProfessionalAccess={hasProfessionalAccess}
            selectedPath={selectedUnlockPath}
            unlockPaths={unlockPaths}
          />
        </div>
      </div>
    </WorkspacePageFrame>
  );
}

function SettingsCommandStrip({
  activeProfileName,
  activeProfileStatus,
  hasProfessionalAccess,
  nextStep,
  selectedUnlockPath,
  readiness,
  role
}: {
  activeProfileName: string;
  activeProfileStatus: string;
  hasProfessionalAccess: boolean;
  nextStep: ReturnType<typeof getRoleUnlockNextStep>;
  selectedUnlockPath: RoleUnlockPath;
  readiness: number;
  role: Role;
}) {
  return (
    <section className="mt-room-4 grid gap-room-2 2xl:grid-cols-[1fr_1fr_1.2fr]">
      <div className="border border-roomBorder bg-panelBlack p-room-3">
        <div className="flex items-center justify-between gap-room-2">
          <Text variant="uiLabel">Account model</Text>
          <StatusBadge status={role === "listener" ? "draft" : "selected"}>{role}</StatusBadge>
        </div>
        <Text as="h3" className="room-clamp-2 mt-room-3 text-xl" variant="title">
          {hasProfessionalAccess ? "Professional tools unlocked" : "Listener-first account"}
        </Text>
        <Text className="mt-room-2" variant="small">
          {selectedUnlockPath.subtitle}
        </Text>
        <div className="mt-room-3 h-1 border border-roomBorder bg-black">
          <div className="h-full bg-acidGreen" style={{ width: `${selectedUnlockPath.readiness}%` }} />
        </div>
        <div className="mt-room-3 border border-roomBorder bg-black p-room-2">
          <Text variant="uiLabel">Next unlock step</Text>
          <Text as="p" className="mt-room-1 text-sm" variant="title">
            {nextStep ? nextStep.label : "Path complete"}
          </Text>
          <Text className="mt-1" variant="small">
            {nextStep ? nextStep.note : "All required signals are ready. Keep the profile fresh as bookings and releases grow."}
          </Text>
          {nextStep?.href ? (
            <ButtonLink className="mt-room-2" href={nextStep.href} size="sm" variant="secondary">
              {nextStep.action ?? "Continue"}
            </ButtonLink>
          ) : null}
        </div>
      </div>
      <div className="border border-roomBorder bg-panelBlack p-room-3">
        <div className="flex items-center justify-between gap-room-2">
          <Text variant="uiLabel">Public identity</Text>
          <StatusBadge status={readiness > 70 ? "accepted" : "waiting"}>{readiness}%</StatusBadge>
        </div>
        <Text as="h3" className="room-clamp-2 mt-room-3 text-xl" variant="title">
          {activeProfileName}
        </Text>
        <Text className="mt-room-2" variant="small">
          {activeProfileStatus}. Editing profile data from Settings keeps registration clean and prevents role confusion.
        </Text>
      </div>
      <div className="border border-roomBorder bg-panelBlack p-room-3">
        <div className="flex items-center justify-between gap-room-2">
          <Text variant="uiLabel">Workspace routing</Text>
          <StatusBadge status="done">defined</StatusBadge>
        </div>
        <div className="mt-room-3 grid gap-room-2 lg:grid-cols-3">
          <RouteHint href="/library" label="Vault" note="tracks / playlists" />
          <RouteHint href="/dashboard/bookings" label="Bookings" note="case files" />
          <RouteHint href="/dashboard/events" label="Events" note="lineup desk" />
        </div>
      </div>
    </section>
  );
}

function DjProfileSettingsForm({
  form,
  isSaving,
  uploadingAsset,
  onAssetUpload,
  setForm,
  onSubmit
}: {
  form: DjSettingsForm;
  isSaving: boolean;
  uploadingAsset: "avatar_url" | "cover_image_url" | "technical_rider_url" | null;
  onAssetUpload: (
    event: ChangeEvent<HTMLInputElement>,
    field: "avatar_url" | "cover_image_url" | "technical_rider_url"
  ) => void;
  setForm: (form: DjSettingsForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Panel className="p-room-3">
      <div id="dj-profile-settings">
        <SectionHeader eyebrow="DJ tools" title="Artist Profile" />
      </div>
      <form className="mt-room-3 space-y-room-3" onSubmit={onSubmit}>
        <div className="grid gap-room-2 md:grid-cols-2">
          <Field label="Stage name" value={form.stage_name} onChange={(value) => setForm({ ...form, stage_name: value })} />
          <Field label="Genres" value={form.genres} onChange={(value) => setForm({ ...form, genres: value })} />
          <Field label="City" value={form.city} onChange={(value) => setForm({ ...form, city: value })} />
          <Field label="Country" value={form.country} onChange={(value) => setForm({ ...form, country: value })} />
          <Field label="BPM range" value={form.bpm_range} onChange={(value) => setForm({ ...form, bpm_range: value })} />
          <Field label="Price EUR" value={form.price} onChange={(value) => setForm({ ...form, price: value })} type="number" />
        </div>
        <div className="grid gap-room-2 md:grid-cols-3">
          <AssetUploadControl
            accept="image/jpeg,image/png,image/webp,image/gif"
            currentUrl={form.avatar_url}
            description="Square image used in the player, dossier, and workspace identity."
            isUploading={uploadingAsset === "avatar_url"}
            label="Avatar"
            onChange={(event) => onAssetUpload(event, "avatar_url")}
            preview="square"
          />
          <AssetUploadControl
            accept="image/jpeg,image/png,image/webp,image/gif"
            currentUrl={form.cover_image_url}
            description="Wide cover image for the artist dossier hero."
            isUploading={uploadingAsset === "cover_image_url"}
            label="Profile cover"
            onChange={(event) => onAssetUpload(event, "cover_image_url")}
            preview="wide"
          />
          <AssetUploadControl
            accept="application/pdf"
            currentUrl={form.technical_rider_url}
            description="PDF technical rider for booking trust and case files."
            id="dj-rider-upload"
            isUploading={uploadingAsset === "technical_rider_url"}
            label="Technical rider"
            onChange={(event) => onAssetUpload(event, "technical_rider_url")}
          />
        </div>
        <Field label="SoundCloud URL" value={form.soundcloud_url} onChange={(value) => setForm({ ...form, soundcloud_url: value })} />
        <Field label="Mixcloud URL" value={form.mixcloud_url} onChange={(value) => setForm({ ...form, mixcloud_url: value })} />
        <label>
          <span className="room-label">Bio</span>
          <Textarea onChange={(event) => setForm({ ...form, bio: event.target.value })} value={form.bio} />
        </label>
        <label className="flex items-center gap-room-2 border border-roomBorder p-room-2">
          <input checked={form.is_available} onChange={(event) => setForm({ ...form, is_available: event.target.checked })} type="checkbox" />
          <span className="font-mono text-[11px] uppercase text-paperWhite">Available for booking</span>
        </label>
        <Button loading={isSaving} type="submit" variant="primary">Save DJ Profile</Button>
      </form>
    </Panel>
  );
}

function OrganizerProfileSettingsForm({
  form,
  isSaving,
  setForm,
  onSubmit
}: {
  form: OrganizerSettingsForm;
  isSaving: boolean;
  setForm: (form: OrganizerSettingsForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Panel className="p-room-3">
      <div id="organizer-profile-settings">
        <SectionHeader eyebrow="Organizer tools" title="Organizer Profile" />
      </div>
      <form className="mt-room-3 space-y-room-3" onSubmit={onSubmit}>
        <Field label="Organization name" value={form.organization_name} onChange={(value) => setForm({ ...form, organization_name: value })} />
        <div className="grid gap-room-2 md:grid-cols-2">
          <Field label="City" value={form.city} onChange={(value) => setForm({ ...form, city: value })} />
          <Field label="Country" value={form.country} onChange={(value) => setForm({ ...form, country: value })} />
        </div>
        <Field label="Contact email" value={form.contact_email} onChange={(value) => setForm({ ...form, contact_email: value })} />
        <label>
          <span className="room-label">Description</span>
          <Textarea onChange={(event) => setForm({ ...form, description: event.target.value })} value={form.description} />
        </label>
        <Button loading={isSaving} type="submit" variant="primary">Save Organizer Profile</Button>
      </form>
    </Panel>
  );
}

function VenueProfileSettingsForm({
  form,
  isSaving,
  setForm,
  onSubmit
}: {
  form: VenueSettingsForm;
  isSaving: boolean;
  setForm: (form: VenueSettingsForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Panel className="p-room-3">
      <div id="venue-profile-settings">
        <SectionHeader eyebrow="Venue tools" title="Venue Profile" />
      </div>
      <form className="mt-room-3 space-y-room-3" onSubmit={onSubmit}>
        <Field label="Venue name" value={form.venue_name} onChange={(value) => setForm({ ...form, venue_name: value })} />
        <div className="grid gap-room-2 md:grid-cols-2">
          <Field label="City" value={form.city} onChange={(value) => setForm({ ...form, city: value })} />
          <Field label="Country" value={form.country} onChange={(value) => setForm({ ...form, country: value })} />
          <Field label="Address" value={form.address} onChange={(value) => setForm({ ...form, address: value })} />
          <Field label="Capacity" value={form.capacity} onChange={(value) => setForm({ ...form, capacity: value })} type="number" />
        </div>
        <Field label="Website URL" value={form.website_url} onChange={(value) => setForm({ ...form, website_url: value })} />
        <Field label="Instagram URL" value={form.instagram_url} onChange={(value) => setForm({ ...form, instagram_url: value })} />
        <label>
          <span className="room-label">Description</span>
          <Textarea onChange={(event) => setForm({ ...form, description: event.target.value })} value={form.description} />
        </label>
        <Button loading={isSaving} type="submit" variant="primary">Save Venue Profile</Button>
      </form>
    </Panel>
  );
}

function RouteHint({ href, label, note }: { href: string; label: string; note: string }) {
  return (
    <LinkishPanel href={href}>
      <Text as="span" variant="uiLabel">
        {label}
      </Text>
      <p className="mt-room-1 font-mono text-[10px] uppercase text-mutedText">{note}</p>
    </LinkishPanel>
  );
}

function LinkishPanel({ children, href }: { children: ReactNode; href: string }) {
  return (
    <ButtonLink className="justify-start border-roomBorder bg-black px-room-2 py-room-2 text-left text-paperWhite" href={href} size="sm" variant="ghost">
      <span>{children}</span>
    </ButtonLink>
  );
}

function ListenerAccessPreview() {
  return (
    <Panel className="p-room-3">
      <SectionHeader eyebrow="Listener mode" title="Sound Vault First" />
      <div className="mt-room-3 grid gap-room-2">
        {[
          ["Discover", "Browse tracks, DJ sets, streams and events before unlocking professional tools."],
          ["Save", "Build personal playlists, liked tracks, saved references and listening history."],
          ["Upgrade", "Switch role here when you are ready to publish music or manage bookings."]
        ].map(([label, note]) => (
          <div className="border border-roomBorder bg-black p-room-2" key={label}>
            <Text as="h3" className="text-lg" variant="title">
              {label}
            </Text>
            <Text className="mt-room-1" variant="small">
              {note}
            </Text>
          </div>
        ))}
      </div>
      <div className="mt-room-4 flex flex-wrap gap-room-2">
        <ButtonLink href="/library" size="sm" variant="primary">
          Open Sound Vault
        </ButtonLink>
        <ButtonLink href="/explore" size="sm" variant="secondary">
          Discover Sounds
        </ButtonLink>
      </div>
    </Panel>
  );
}

function VerificationPanel({
  hasProfessionalAccess,
  selectedPath,
  unlockPaths
}: {
  hasProfessionalAccess: boolean;
  selectedPath: RoleUnlockPath;
  unlockPaths: RoleUnlockPath[];
}) {
  const checks = [
    { label: "Account verified", state: "accepted", note: "Supabase email/password session is active." },
    {
      label: "Professional access",
      state: hasProfessionalAccess ? "accepted" : "waiting",
      note: hasProfessionalAccess
        ? "At least one DJ, Organizer or Venue toolset is active."
        : "Unlock tools when the profile path is ready."
    },
    { label: "Music routing", state: "accepted", note: "Playlists, liked tracks, queue and saved references live in Sound Vault." },
    { label: "Booking routing", state: hasProfessionalAccess ? "selected" : "draft", note: "Requests and case files live in Booking Ops after role access." }
  ];

  return (
    <Panel className="p-room-3">
      <SectionHeader
        eyebrow="Verification"
        title="Access Checklist"
        action={<StatusBadge status={selectedPath.status}>{selectedPath.readiness}%</StatusBadge>}
      />
      <div className="mt-room-3 grid gap-room-2 md:grid-cols-2">
        {unlockPaths.map((path) => (
          <RolePathProgressCard key={path.role} path={path} />
        ))}
      </div>
      <div className="mt-room-3 border border-roomBorder bg-black p-room-2">
        <div className="flex items-center justify-between gap-room-2">
          <Text variant="uiLabel">Selected path</Text>
          <StatusBadge status={selectedPath.status}>{selectedPath.status}</StatusBadge>
        </div>
        <Text as="h3" className="mt-room-2 text-xl" variant="title">
          {selectedPath.title}
        </Text>
        <Text className="mt-room-1" variant="small">
          {selectedPath.subtitle}
        </Text>
        <div className="mt-room-3 space-y-room-2">
          {selectedPath.steps.map((step, index) => (
            <div
              className={cx(
                "grid gap-room-2 border p-room-2 md:grid-cols-[auto_1fr_auto]",
                step.done ? "border-acidGreen bg-[#121A04]" : "border-roomBorder bg-panelBlack"
              )}
              key={step.id}
            >
              <span className={cx("grid h-8 w-8 place-items-center border font-mono text-[10px] font-black", step.done ? "border-acidGreen bg-acidGreen text-voidBlack" : "border-roomBorder text-mutedText")}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <Text as="h4" className="text-base" variant="title">
                  {step.label}
                </Text>
                <Text className="mt-1" variant="small">
                  {step.note}
                </Text>
              </div>
              {step.href ? (
                <ButtonLink href={step.href} size="sm" variant={step.done ? "ghost" : "secondary"}>
                  {step.done ? "Open" : step.action ?? "Continue"}
                </ButtonLink>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-room-3 space-y-room-2">
        {checks.map((check) => (
          <div className="grid gap-room-2 border border-roomBorder bg-black p-room-2 md:grid-cols-[auto_1fr]" key={check.label}>
            <StatusBadge status={check.state}>{check.state}</StatusBadge>
            <div>
              <Text as="h3" className="text-base" variant="title">
                {check.label}
              </Text>
              <Text className="mt-1" variant="small">
                {check.note}
              </Text>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-room-4 border border-roomBorder p-room-2">
        <Text variant="uiLabel">Workspace rule</Text>
        <Text className="mt-room-2" variant="small">
          Profile editing lives here. Playlists, favorites, saved references and listening history live in Sound Vault. Bookings live in Booking Ops.
        </Text>
      </div>
    </Panel>
  );
}

function RolePathProgressCard({ path }: { path: RoleUnlockPath }) {
  const nextStep = getRoleUnlockNextStep(path);
  return (
    <div className={cx("border p-room-2", path.isActive ? "border-acidGreen bg-[#121A04]" : "border-roomBorder bg-black")}>
      <div className="flex items-center justify-between gap-room-2">
        <Text variant="uiLabel">{path.role}</Text>
        <StatusBadge status={path.status}>{path.readiness}%</StatusBadge>
      </div>
      <Text as="h3" className="mt-room-2 text-lg" variant="title">
        {path.title}
      </Text>
      <div className="mt-room-2 h-1 border border-roomBorder bg-voidBlack">
        <div className={cx("h-full", path.isActive ? "bg-acidGreen" : "bg-mutedText")} style={{ width: `${path.readiness}%` }} />
      </div>
      <Text className="mt-room-2" variant="small">
        {getRoleUnlockDoneCount(path)}/{path.steps.length} steps complete
      </Text>
      <div className="mt-room-2 border border-roomBorder bg-voidBlack p-room-2">
        <Text variant="uiLabel">{nextStep ? "Next" : "Ready"}</Text>
        <Text className="mt-1" variant="small">
          {nextStep ? nextStep.label : "All unlock steps complete"}
        </Text>
      </div>
    </div>
  );
}

function SettingsFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-voidBlack p-room-2">
      <Text variant="uiLabel">{label}</Text>
      <p className="mt-room-1 break-words font-display text-xl uppercase text-paperWhite">{value}</p>
    </div>
  );
}

function RoleCard({
  onSelect,
  path,
  selected
}: {
  onSelect: () => void;
  path: RoleUnlockPath;
  selected: boolean;
}) {
  const nextStep = getRoleUnlockNextStep(path);
  const gate = getRoleUnlockGate(path);
  const opens = getRoleOpenedOptions(path.role);
  return (
    <button
      className={cx(
        "block border p-room-2 text-left transition hover:border-paperWhite",
        path.isActive ? "border-acidGreen bg-[#172200]" : selected ? "border-warningOrange bg-black" : "border-roomBorder bg-black"
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-center justify-between gap-room-2">
        <StatusBadge status={path.isActive ? "selected" : selected ? "waiting" : path.status}>
          {path.isActive ? "active" : selected ? "selected" : path.status}
        </StatusBadge>
        <span className="font-mono text-[10px] uppercase text-mutedText">{path.readiness}%</span>
      </div>
      <Text as="h3" className="mt-room-2 text-xl" variant="title">
        {path.title}
      </Text>
      <Text className="mt-room-1" variant="small">
        {path.subtitle}
      </Text>
      <div className="mt-room-2 h-1 border border-roomBorder bg-voidBlack">
        <div className={cx("h-full", path.isActive ? "bg-acidGreen" : selected ? "bg-warningOrange" : "bg-mutedText")} style={{ width: `${path.readiness}%` }} />
      </div>
      <div className="mt-room-3 border border-roomBorder bg-voidBlack p-room-2">
        <Text variant="uiLabel">{gate.canActivate ? "Gate ready" : "Next required"}</Text>
        <Text className="mt-1" variant="small">
          {nextStep ? nextStep.label : "All verification steps complete"}
        </Text>
      </div>
      <div className="mt-room-3 border-t border-roomBorder pt-room-2">
        <Text variant="uiLabel">Options opened</Text>
        <div className="mt-room-2 flex flex-wrap gap-1.5">
          {opens.map((item) => (
            <span
              className={path.isActive ? "border border-acidGreen px-2 py-1 font-mono text-[9px] uppercase text-acidGreen" : "border border-roomBorder px-2 py-1 font-mono text-[9px] uppercase text-mutedText"}
              key={item}
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

function getRoleOpenedOptions(role: Role) {
  if (role === "dj") {
    return ["Vault", "Music Lab", "Streams", "Booking CRM", "Analytics"];
  }

  if (role === "organizer") {
    return ["Event Desk", "Booking CRM", "Timeline", "Analytics"];
  }

  if (role === "venue") {
    return ["Venue events", "Lineup slots", "Timeline", "Streams", "Analytics"];
  }

  return ["Explore", "Sound Vault", "Public events", "Streams"];
}

function getUnlockContext(target: string | null) {
  if (!target) {
    return null;
  }

  const contexts: Record<string, { title: string; copy: string }> = {
    analytics: {
      title: "Analytics locked",
      copy: "Activate DJ, Organizer or Venue access first. Analytics then grows from track plays, saved moments and booking cases."
    },
    bookings: {
      title: "Booking CRM locked",
      copy: "Complete the DJ, Organizer or Venue gate here, then the CRM opens as a professional case-file layer."
    },
    calendar: {
      title: "Timeline locked",
      copy: "The operational timeline opens after professional access. Listener accounts keep public events and Sound Vault only."
    },
    dashboard: {
      title: "Workspace access",
      copy: "Dashboard is the command center. Listener accounts see music-first actions; professional tools open after DJ, Organizer or Venue verification."
    },
    dj: {
      title: "DJ tools locked",
      copy: "Complete the DJ profile step first. Music Lab, Streams, Analytics and Booking Trust unlock after the artist profile is ready."
    },
    events: {
      title: "Event Desk locked",
      copy: "Event Desk is for Organizer and Venue profiles. Add organization or venue details before creating lineup slots."
    },
    "music-lab": {
      title: "Music Lab locked",
      copy: "Music Lab is a DJ tool. Complete the DJ profile path, then shape cues, sound DNA and atmosphere briefs for each track."
    },
    musicLab: {
      title: "Music Lab locked",
      copy: "Music Lab is a DJ tool. Complete the DJ profile path, then shape cues, sound DNA and atmosphere briefs for each track."
    },
    organizer: {
      title: "Organizer tools locked",
      copy: "Create an organizer profile to unlock Event Desk, Booking CRM, lineup slots and saved sound references inside events."
    },
    role: {
      title: "Choose a role path",
      copy: "Start from listener mode, select DJ, Organizer or Venue, complete the first required profile step, then request access."
    },
    streams: {
      title: "Streams locked",
      copy: "Streaming tools open for DJ or Venue profiles after role verification."
    },
    timeline: {
      title: "Timeline locked",
      copy: "The operational timeline opens after professional access. Listener accounts keep public events and Sound Vault only."
    },
    venue: {
      title: "Venue tools locked",
      copy: "Create a venue profile to unlock event programming, lineup slots, booking requests, room calendar and streaming tools."
    }
  };

  return contexts[target] ?? contexts.role;
}

function Field({
  label,
  onChange,
  type = "text",
  value
}: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="room-label">{label}</span>
      <Input onChange={(event) => onChange(event.target.value)} type={type} value={value} />
    </label>
  );
}

function AssetUploadControl({
  accept,
  currentUrl,
  description,
  id,
  isUploading,
  label,
  onChange,
  preview = "wide"
}: {
  accept: string;
  currentUrl?: string;
  description: string;
  id?: string;
  isUploading: boolean;
  label: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  preview?: "square" | "wide";
}) {
  const isImage = accept.includes("image/");
  const previewClassName =
    preview === "square"
      ? "mt-room-2 aspect-square max-w-[180px] border border-roomBorder bg-inkPanel bg-cover bg-center grayscale"
      : "mt-room-2 aspect-[2.6/1] border border-roomBorder bg-inkPanel bg-cover bg-center grayscale";

  return (
    <div className="min-w-0 border border-roomBorder bg-black p-room-2" id={id}>
      <div className="flex items-center justify-between gap-room-2">
        <Text variant="uiLabel">{label}</Text>
        <StatusBadge status={currentUrl ? "accepted" : "draft"}>{currentUrl ? "stored" : "missing"}</StatusBadge>
      </div>
      {isImage ? (
        <div
          className={previewClassName}
          style={currentUrl ? { backgroundImage: `url("${currentUrl}")` } : undefined}
        >
          {!currentUrl ? (
            <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase text-mutedText">
              No image loaded
            </div>
          ) : null}
        </div>
      ) : null}
      <Text className="room-clamp-3 mt-room-2" variant="small">
        {description}
      </Text>
      <div className="mt-room-2 flex flex-wrap gap-room-2">
        <label className="room-outline-button min-h-8 cursor-pointer px-3 text-[9px]">
          {isUploading ? "Uploading" : "Upload file"}
          <input accept={accept} className="sr-only" disabled={isUploading} onChange={onChange} type="file" />
        </label>
        {currentUrl ? (
          <a className="room-outline-button min-h-8 px-3 text-[9px]" href={currentUrl} rel="noreferrer" target="_blank">
            Open
          </a>
        ) : null}
      </div>
    </div>
  );
}

function isMissingRiderColumn(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const errorRecord = error as { code?: string; message?: string };
  return (
    errorRecord.code === "PGRST204" ||
    errorRecord.message?.toLowerCase().includes("technical_rider_url") === true
  );
}

function isSafeInternalPath(value: string | null): value is string {
  return Boolean(value && value.startsWith("/") && !value.startsWith("//"));
}

function djToForm(profile: DjProfile | null): DjSettingsForm {
  if (!profile) {
    return emptyDjForm;
  }

  return {
    stage_name: profile.stage_name ?? "",
    bio: profile.bio ?? "",
    country: profile.country ?? "",
    city: profile.city ?? "",
    genres: profile.genres ?? "",
    bpm_range: profile.bpm_range ?? "",
    price: profile.price?.toString() ?? "",
    avatar_url: profile.avatar_url ?? "",
    cover_image_url: profile.cover_image_url ?? "",
    profile_theme: profile.profile_theme ?? "warehouse",
    soundcloud_url: profile.soundcloud_url ?? "",
    mixcloud_url: profile.mixcloud_url ?? "",
    technical_rider_url: profile.technical_rider_url ?? "",
    is_available: profile.is_available
  };
}

function organizerToForm(profile: OrganizerProfile | null): OrganizerSettingsForm {
  if (!profile) {
    return emptyOrganizerForm;
  }

  return {
    organization_name: profile.organization_name ?? "",
    country: profile.country ?? "",
    city: profile.city ?? "",
    contact_email: profile.contact_email ?? "",
    description: profile.description ?? ""
  };
}

function venueToForm(profile: VenueProfile | null): VenueSettingsForm {
  if (!profile) {
    return emptyVenueForm;
  }

  return {
    venue_name: profile.venue_name ?? "",
    country: profile.country ?? "",
    city: profile.city ?? "",
    address: profile.address ?? "",
    capacity: profile.capacity?.toString() ?? "",
    description: profile.description ?? "",
    website_url: profile.website_url ?? "",
    instagram_url: profile.instagram_url ?? ""
  };
}

function getPrimarySettingsRole(fallbackRole: Role, activeRoles: Role[]): Role {
  if (activeRoles.includes(fallbackRole) && fallbackRole !== "listener") {
    return fallbackRole;
  }

  if (hasRoleAccess(activeRoles, ["dj"])) {
    return "dj";
  }

  if (hasRoleAccess(activeRoles, ["organizer"])) {
    return "organizer";
  }

  if (hasRoleAccess(activeRoles, ["venue"])) {
    return "venue";
  }

  return "listener";
}

function getActiveProfileStatus(
  role: Role,
  djProfile: DjProfile | null,
  organizerProfile: OrganizerProfile | null,
  venueProfile: VenueProfile | null
) {
  if (role === "dj") {
    return djProfile ? "Artist dossier editable" : "Create DJ profile record";
  }

  if (role === "organizer") {
    return organizerProfile ? "Organizer desk editable" : "Create organizer profile record";
  }

  if (role === "venue") {
    return venueProfile ? "Venue profile editable" : "Create venue profile record";
  }

  if (role === "admin") {
    return "Admin scope documented for V2";
  }

  return "Listener account ready";
}
