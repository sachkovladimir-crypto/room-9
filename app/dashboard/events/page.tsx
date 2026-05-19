"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { MissingConfigNotice } from "@/components/AuthNotice";
import { Button, ButtonLink, Input, MetricCard, Panel, SectionHeader, Select, StatusBadge, Text, Textarea, cx } from "@/components/room9-ui";
import {
  WorkspaceCommandGrid,
  WorkspaceCommandPanel,
  WorkspaceMetricGrid,
  WorkspaceNotice,
  WorkspaceOpsHeader,
  WorkspacePageFrame,
  canAccessWorkspaceSection,
  getWorkspaceUnlockHref
} from "@/components/workspace/WorkspaceShell";
import { formatDate } from "@/lib/format";
import { trackUserInteraction } from "@/lib/interactions";
import { loadRoleAccess } from "@/lib/roleAccess";
import { recommendMomentsForSlot, type MomentSlotSignal } from "@/lib/signalEngine";
import { readVaultSavedMoments, type VaultSavedMoment } from "@/lib/soundVault";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  isMissingAuthSession,
  logSupabaseError
} from "@/lib/supabase";
import { blendUserSoundProfileWithIntent, getUserSoundProfileHeadline } from "@/lib/userSoundProfile";
import { readUserSoundProfile } from "@/lib/userSoundProfileStore";
import {
  hasRoleAccess,
  isBookingClientRole,
  type Booking,
  type EventLineupSlot,
  type EventLineupSlotType,
  type EventPost,
  type Profile,
  type Role,
  type UserSoundProfile
} from "@/lib/types";

type EventForm = {
  title: string;
  event_date: string;
  venue_name: string;
  city: string;
  event_type: string;
  description: string;
};

const emptyEventForm: EventForm = {
  title: "",
  event_date: "",
  venue_name: "",
  city: "",
  event_type: "Club night",
  description: ""
};

const LINEUP_SLOT_TYPES: Array<{ type: EventLineupSlotType; label: string }> = [
  { type: "opening", label: "Opening" },
  { type: "support", label: "Support" },
  { type: "peak", label: "Peak" },
  { type: "closing", label: "Closing" },
  { type: "stream", label: "Stream" }
];

export default function DashboardEventsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeRoles, setActiveRoles] = useState<Role[]>(["listener"]);
  const [events, setEvents] = useState<EventPost[]>([]);
  const [lineupSlots, setLineupSlots] = useState<EventLineupSlot[]>([]);
  const [savedMoments, setSavedMoments] = useState<VaultSavedMoment[]>([]);
  const [soundProfile, setSoundProfile] = useState<UserSoundProfile | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [eventForm, setEventForm] = useState<EventForm>(emptyEventForm);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      return;
    }

    async function loadEventsDesk() {
      setIsLoading(true);
      setError("");

      try {
        const supabase = getSupabase();
        const { data: sessionData, error: userError } = await supabase.auth.getSession();

        if (userError) {
          if (isMissingAuthSession(userError)) {
            router.push("/login?next=/dashboard/events");
            return;
          }

          logSupabaseError("Dashboard events auth failed", userError);
          setError(formatSupabaseError(userError, "Could not load event desk."));
          return;
        }

        const user = sessionData.session?.user ?? null;
        if (!user) {
          router.push("/login?next=/dashboard/events");
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError || !profileData) {
          logSupabaseError("Dashboard events profile failed", profileError);
          setError(formatSupabaseError(profileError, "Could not load workspace profile."));
          return;
        }

        const loadedProfile = profileData as Profile;
        setProfile(loadedProfile);
        setSoundProfile(await readUserSoundProfile(loadedProfile.id));
        const loadedRoles = await loadRoleAccess(supabase, loadedProfile.id, loadedProfile.role);
        setActiveRoles(loadedRoles);

        if (!canAccessWorkspaceSection("events", loadedRoles)) {
          router.replace(getWorkspaceUnlockHref("events"));
          return;
        }

        const eventQuery = supabase.from("events").select("*").order("event_date", { ascending: true });
        const { data: eventData, error: eventError } = isBookingClientRole(loadedRoles)
          ? await eventQuery.eq("organizer_id", loadedProfile.id).limit(80)
          : await eventQuery.limit(12);

        if (eventError) {
          logSupabaseError("Dashboard events rows failed", eventError);
          setError(formatSupabaseError(eventError, "Could not load event pages."));
          return;
        }

        const loadedEvents = (eventData as EventPost[]) ?? [];
        setEvents(loadedEvents);
        setSelectedEventId((current) => current ?? loadedEvents[0]?.id ?? null);

        const eventIds = loadedEvents.map((event) => event.id);
        if (eventIds.length > 0) {
          const { data: slotData, error: slotError } = await supabase
            .from("event_lineup_slots")
            .select("*")
            .in("event_id", eventIds.slice(0, 80))
            .order("position", { ascending: true })
            .limit(500);

          if (slotError) {
            logSupabaseError("Dashboard events lineup slots failed", slotError);
          } else {
            setLineupSlots((slotData as EventLineupSlot[]) ?? []);
          }
        }

        if (isBookingClientRole(loadedRoles)) {
          readVaultSavedMoments(loadedProfile.id)
            .then(setSavedMoments)
            .catch((caughtError) => logSupabaseError("Dashboard events saved references failed", caughtError));

          const { data: bookingData, error: bookingError } = await supabase
            .from("bookings")
            .select("*")
            .eq("organizer_id", loadedProfile.id)
            .order("created_at", { ascending: false })
            .limit(120);

          if (bookingError) {
            logSupabaseError("Dashboard events bookings failed", bookingError);
          } else {
            setBookings((bookingData as Booking[]) ?? []);
          }
        }
      } catch (caughtError) {
        logSupabaseError("Dashboard events unexpected failure", caughtError);
        setError(formatSupabaseError(caughtError, "Could not load event desk."));
      } finally {
        setIsLoading(false);
      }
    }

    loadEventsDesk();
  }, [router]);

  const publishedCount = events.filter((event) => event.poster_url || event.description).length;
  const draftCount = Math.max(0, events.length - publishedCount);
  const pendingBookings = bookings.filter((booking) => booking.status === "pending").length;
  const slotCount = lineupSlots.length;
  const holdSlotCount = lineupSlots.filter((slot) => slot.status === "hold" || slot.status === "accepted").length;
  const eventCities = useMemo(
    () => Array.from(new Set(events.map((event) => event.city).filter(Boolean))).length,
    [events]
  );

  if (!hasSupabaseConfig()) {
    return <MissingConfigNotice />;
  }

  if (isLoading) {
    return (
      <main className="room-page">
        <section className="room-shell py-12">
          <div className="room-card min-h-[620px] animate-pulse" />
        </section>
      </main>
    );
  }

  if (error && !profile) {
    return (
      <main className="room-page">
        <section className="room-shell py-12">
          <EmptyState title="Event desk unavailable" message={error} href="/dashboard" action="Dashboard" />
        </section>
      </main>
    );
  }

  const canManageEvents = isBookingClientRole(activeRoles);
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? events[0] ?? null;
  const selectedSlots = selectedEvent ? getLineupSlotsForEvent(selectedEvent.id, lineupSlots) : [];
  const eventDeskRole = getEventDeskRole(profile?.role ?? "listener", activeRoles);
  const eventDeskCopy = getEventDeskCopy(eventDeskRole);
  const slotSignalIntent = blendUserSoundProfileWithIntent(soundProfile);
  const soundProfileHeadline = getUserSoundProfileHeadline(soundProfile);

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !canManageEvents) {
      setError("Organizer or venue access is required to create events.");
      return;
    }

    if (!eventForm.title.trim() || !eventForm.event_date || !eventForm.venue_name.trim()) {
      setError("Event title, date, and venue are required.");
      return;
    }

    setIsCreating(true);
    setError("");
    setNotice("");

    try {
      const supabase = getSupabase();

      if (editingEventId) {
        const { data, error: updateError } = await supabase
          .from("events")
          .update({
            title: eventForm.title,
            event_date: eventForm.event_date,
            venue_name: eventForm.venue_name,
            city: eventForm.city,
            event_type: eventForm.event_type,
            description: eventForm.description
          })
          .eq("id", editingEventId)
          .eq("organizer_id", profile.id)
          .select("*")
          .single();

        if (updateError) {
          logSupabaseError("Dashboard event update failed", updateError);
          setError(formatSupabaseError(updateError, "Could not update event."));
          return;
        }

        const updatedEvent = data as EventPost;
        setEvents((current) => current.map((item) => (item.id === updatedEvent.id ? updatedEvent : item)));
        setSelectedEventId(updatedEvent.id);
        setEditingEventId(null);
        setEventForm(emptyEventForm);
        setNotice("Event updated inside Event Desk.");
        return;
      }

      const { data, error: createError } = await supabase
        .from("events")
        .insert({
          organizer_id: profile.id,
          title: eventForm.title,
          event_date: eventForm.event_date,
          venue_name: eventForm.venue_name,
          city: eventForm.city,
          event_type: eventForm.event_type,
          description: eventForm.description,
          lineup: "Opening: Searching\nSupport: Searching\nPeak: Searching\nClosing: Searching\nStream: Optional"
        })
        .select("*")
        .single();

      if (createError) {
        logSupabaseError("Dashboard event create failed", createError);
        setError(formatSupabaseError(createError, "Could not create event."));
        return;
      }

      const createdEvent = data as EventPost;
      const { data: slotData, error: slotError } = await supabase
        .from("event_lineup_slots")
        .insert(
          LINEUP_SLOT_TYPES.map((slot, index) => ({
            event_id: createdEvent.id,
            slot_type: slot.type,
            position: index,
            status: slot.type === "stream" ? "optional" : "searching"
          }))
        )
        .select("*");

      if (slotError) {
        logSupabaseError("Dashboard event slot create failed", slotError);
      } else {
        setLineupSlots((current) => [...((slotData as EventLineupSlot[]) ?? []), ...current]);
      }

      setEvents((current) => [createdEvent, ...current]);
      setSelectedEventId(createdEvent.id);
      setEventForm(emptyEventForm);
      setNotice("Event created. Fill lineup slots from saved sound references or discovery.");
    } catch (caughtError) {
      logSupabaseError("Dashboard event create unexpected failure", caughtError);
      setError(formatSupabaseError(caughtError, "Could not create event."));
    } finally {
      setIsCreating(false);
    }
  }

  function loadEventIntoForm(event: EventPost) {
    setSelectedEventId(event.id);
    setEditingEventId(event.id);
    setEventForm({
      title: event.title,
      event_date: event.event_date?.slice(0, 10) ?? "",
      venue_name: event.venue_name ?? "",
      city: event.city ?? "",
      event_type: event.event_type ?? "Club night",
      description: event.description ?? ""
    });

    window.setTimeout(() => {
      document.getElementById("quick-event")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  async function attachMomentToSlot(slot: EventLineupSlot, moment: VaultSavedMoment) {
    if (!profile || !canManageEvents) {
      return;
    }

    setError("");
    setNotice("");

    try {
      const supabase = getSupabase();
      const payload = {
        event_id: slot.event_id,
        slot_type: slot.slot_type,
        position: slot.position ?? LINEUP_SLOT_TYPES.findIndex((item) => item.type === slot.slot_type),
        saved_moment_id: moment.id,
        dj_id: moment.djId ?? null,
        status: "hold",
        notes: `${moment.trackTitle} / ${moment.timestampLabel} / ${moment.momentLabel}`,
        updated_at: new Date().toISOString()
      };
      const isVirtualSlot = slot.id.startsWith("virtual-");
      const query = isVirtualSlot
        ? supabase.from("event_lineup_slots").insert(payload).select("*").single()
        : supabase.from("event_lineup_slots").update(payload).eq("id", slot.id).select("*").single();

      const { data, error: slotError } = await query;

      if (slotError) {
        logSupabaseError("Dashboard event attach moment failed", slotError);
        setError(formatSupabaseError(slotError, "Could not attach saved reference to lineup slot."));
        return;
      }

      const updatedSlot = data as EventLineupSlot;
      setLineupSlots((current) => [
        updatedSlot,
        ...current.filter((item) => item.id !== slot.id && item.id !== updatedSlot.id)
      ]);
      trackUserInteraction({
        djId: moment.djId,
        eventId: slot.event_id,
        interactionType: "attach_to_event_slot",
        metadata: {
          saved_moment_id: moment.id,
          slot_type: slot.slot_type,
          timestamp_label: moment.timestampLabel
        },
        scope: profile.id,
        timestampSeconds: moment.timestamp,
        workId: moment.trackId
      });
      setNotice(`${moment.momentLabel} attached to ${slot.slot_type}.`);
    } catch (caughtError) {
      logSupabaseError("Dashboard event attach moment unexpected failure", caughtError);
      setError(formatSupabaseError(caughtError, "Could not attach saved reference to lineup slot."));
    }
  }

  return (
    <WorkspacePageFrame
      active="events"
      email={profile?.email}
      pendingCount={pendingBookings}
      profileLabel={profile?.email || "ROOM_9"}
      readiness={canManageEvents ? 78 : 58}
      role={activeRoles}
    >
      <div className="px-room-3 py-room-3 xl:px-room-4">
        <WorkspaceOpsHeader
          description={eventDeskCopy.description}
          eyebrow={eventDeskCopy.eyebrow}
          title={eventDeskCopy.title}
          actions={
            <>
            {canManageEvents ? (
              <ButtonLink
                href="#quick-event"
                variant="primary"
                onClick={() => {
                  setEditingEventId(null);
                  setEventForm(emptyEventForm);
                }}
              >
                New Event
              </ButtonLink>
            ) : null}
            <ButtonLink href="/events" variant="secondary">
              Public Events
            </ButtonLink>
            </>
          }
        />

        {error ? <WorkspaceNotice tone="error">{error}</WorkspaceNotice> : null}
        {notice ? <WorkspaceNotice>{notice}</WorkspaceNotice> : null}

        <WorkspaceMetricGrid columns={5}>
          <MetricCard active={events.length > 0} label="Event pages" note="Managed here" value={events.length} />
          <MetricCard active={holdSlotCount > 0} label="Lineup holds" note="Moments attached" value={holdSlotCount} />
          <MetricCard label="Slots" note="Opening to stream" value={slotCount || selectedSlots.length} />
          <MetricCard label="Drafts" note={`${publishedCount} public`} value={draftCount} />
          <MetricCard label="Cities" note="Programming markets" value={eventCities} />
        </WorkspaceMetricGrid>

        <EventFlowStrip
          canManageEvents={canManageEvents}
          eventsCount={events.length}
          role={eventDeskRole}
          savedMomentsCount={savedMoments.length}
          soundProfileHeadline={soundProfile ? soundProfileHeadline : null}
        />

        {selectedEvent ? (
          <SelectedEventCommand
            bookings={bookings}
            canManageEvents={canManageEvents}
            event={selectedEvent}
            savedMomentsCount={savedMoments.length}
            slots={selectedSlots}
          />
        ) : null}

        <div className="mt-room-4 grid gap-room-4 xl:grid-cols-[1fr_0.86fr]">
          <Panel className="p-room-3">
            <SectionHeader
              action={canManageEvents ? <ButtonLink href="#quick-event" size="sm" variant="secondary">Create / Edit</ButtonLink> : null}
              eyebrow={canManageEvents ? "Owned events" : "Public reference"}
              title="Event Operations"
            />
            <div className="mt-room-3 space-y-room-2">
              {events.length === 0 ? (
                <div className="border border-dashed border-roomBorder bg-black p-room-3">
                  <StatusBadge status="draft">event desk empty</StatusBadge>
                  <Text as="h3" className="mt-room-3 text-xl" variant="title">
                    Build the first event page, then fill lineup slots from saved references.
                  </Text>
                  <Text className="mt-room-2" variant="small">
                    The intended flow is music first: save a sound reference, attach it to Opening / Support / Peak /
                    Closing / Stream, then send a booking request with that context.
                  </Text>
                  <div className="mt-room-3 flex flex-wrap gap-room-2">
                    {canManageEvents ? (
                      <ButtonLink href="#quick-event" size="sm" variant="primary">
                        New Event
                      </ButtonLink>
                    ) : null}
                    <ButtonLink href="/explore" size="sm" variant="secondary">
                      Find Sound
                    </ButtonLink>
                  </div>
                </div>
              ) : (
                events.map((event) => (
                  <EventDeskRow
                    canEdit={canManageEvents}
                    event={event}
                    isActive={selectedEvent?.id === event.id}
                    key={event.id}
                    requestCount={countEventRequests(bookings, event)}
                    onEdit={() => loadEventIntoForm(event)}
                    onSelect={() => setSelectedEventId(event.id)}
                  />
                ))
              )}
            </div>
          </Panel>

          {canManageEvents ? (
            <div id="quick-event" className="scroll-mt-room-4">
              <Panel className="p-room-3">
                <SectionHeader eyebrow={editingEventId ? "Edit" : "Create"} title={editingEventId ? "Event Details" : "Quick Event"} />
                <form className="mt-room-3 space-y-room-3" onSubmit={createEvent}>
                  <label>
                    <span className="room-label">Event title</span>
                    <Input value={eventForm.title} onChange={(inputEvent) => setEventForm({ ...eventForm, title: inputEvent.target.value })} placeholder="UNDERGROUND FESTIVAL" />
                  </label>
                  <div className="grid gap-room-2 md:grid-cols-2">
                    <label>
                      <span className="room-label">Date</span>
                      <Input type="date" value={eventForm.event_date} onChange={(inputEvent) => setEventForm({ ...eventForm, event_date: inputEvent.target.value })} />
                    </label>
                    <label>
                      <span className="room-label">Event type</span>
                      <Input value={eventForm.event_type} onChange={(inputEvent) => setEventForm({ ...eventForm, event_type: inputEvent.target.value })} placeholder="Club night" />
                    </label>
                  </div>
                  <div className="grid gap-room-2 md:grid-cols-2">
                    <label>
                      <span className="room-label">Venue</span>
                      <Input value={eventForm.venue_name} onChange={(inputEvent) => setEventForm({ ...eventForm, venue_name: inputEvent.target.value })} placeholder="BASEMENT" />
                    </label>
                    <label>
                      <span className="room-label">City</span>
                      <Input value={eventForm.city} onChange={(inputEvent) => setEventForm({ ...eventForm, city: inputEvent.target.value })} placeholder="Berlin" />
                    </label>
                  </div>
                  <label>
                    <span className="room-label">Brief</span>
                    <Textarea value={eventForm.description} onChange={(inputEvent) => setEventForm({ ...eventForm, description: inputEvent.target.value })} placeholder="Room, sound direction, audience and lineup target..." />
                  </label>
                  <Button className="w-full" loading={isCreating} type="submit" variant="primary">
                    {editingEventId ? "Save Event" : "Create Event"}
                  </Button>
                  {editingEventId ? (
                    <Button
                      className="w-full"
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setEditingEventId(null);
                        setEventForm(emptyEventForm);
                      }}
                    >
                      Cancel Edit
                    </Button>
                  ) : null}
                </form>
              </Panel>
            </div>
          ) : (
            <Panel className="p-room-3">
              <SectionHeader eyebrow="Access" title="Organizer / Venue Tools" />
              <Text className="mt-room-3" variant="small">
                Event creation unlocks after organizer or venue verification. You can still use public events and sound discovery as a listener.
              </Text>
              <ButtonLink className="mt-room-3" href="/dashboard/settings" variant="secondary">
                Open Settings
              </ButtonLink>
            </Panel>
          )}
        </div>

        <div id="lineup-builder" className="mt-room-4 scroll-mt-room-4">
        <Panel className="p-room-3">
          <SectionHeader
            eyebrow="Lineup builder"
            title={selectedEvent ? selectedEvent.title : "Opening / Support / Peak / Closing / Stream"}
            action={<Text variant="uiLabel">{selectedSlots.length} slots</Text>}
          />
          {selectedSlots.length === 0 ? (
            <Text className="mt-room-3" variant="small">Select or create an event to build lineup slots.</Text>
          ) : (
            <div className="mt-room-3 grid gap-px overflow-hidden border border-roomBorder bg-line xl:grid-cols-5">
              {selectedSlots.map((slot) => {
                const label = LINEUP_SLOT_TYPES.find((item) => item.type === slot.slot_type)?.label ?? slot.slot_type;
                const attachedMoment = savedMoments.find((moment) => moment.id === slot.saved_moment_id);
                const recommended = attachedMoment
                  ? null
                  : recommendMomentsForSlot(savedMoments, slot.slot_type, 1, slotSignalIntent)[0] ?? null;
                return (
                  <LineupSlotCard
                    attachedMoment={attachedMoment}
                    canManageEvents={canManageEvents}
                    eventId={selectedEvent?.id}
                    key={slot.id}
                    label={label}
                    recommendedMoment={recommended?.moment as VaultSavedMoment | undefined}
                    recommendedSignal={recommended?.signal}
                    savedMoments={savedMoments}
                    slot={slot}
                    slotBooking={getSlotBooking(slot, bookings)}
                    onAttach={(moment) => attachMomentToSlot(slot, moment)}
                  />
                );
              })}
            </div>
          )}
        </Panel>
        </div>

        <div className="mt-room-4 grid gap-room-4 xl:grid-cols-[1fr_0.72fr]">
          <SavedMomentRail savedMoments={savedMoments} />
          <EventRoutePanel role={eventDeskRole} />
        </div>
      </div>
    </WorkspacePageFrame>
  );
}

function EventFlowStrip({
  canManageEvents,
  eventsCount,
  role,
  savedMomentsCount,
  soundProfileHeadline
}: {
  canManageEvents: boolean;
  eventsCount: number;
  role?: Profile["role"];
  savedMomentsCount: number;
  soundProfileHeadline?: string | null;
}) {
  const deskLabel = role === "venue" ? "venue desk" : role === "organizer" ? "organizer desk" : "event desk";
  return (
    <div>
      {soundProfileHeadline ? (
        <div className="mb-room-3 flex flex-wrap items-center justify-between gap-room-2 border border-roomBorder bg-panelBlack px-room-3 py-room-2">
          <Text variant="uiLabel">Sound Profile informs slot suggestions</Text>
          <span className="font-mono text-[10px] uppercase text-acidGreen">{soundProfileHeadline}</span>
        </div>
      ) : null}
      <WorkspaceCommandGrid columns={5}>
        {[
          ["01", "Event page", eventsCount > 0 ? `${eventsCount} active` : "create draft"],
          ["02", "Sound reference", savedMomentsCount > 0 ? `${savedMomentsCount} ready` : "listen first"],
          ["03", "Lineup slot", "opening / support / peak / closing"],
          ["04", "Booking request", "send with atmosphere brief"],
          ["05", "Calendar check", "detect holds and conflicts"]
        ].map(([index, title, copy], itemIndex) => (
          <WorkspaceCommandPanel
            active={itemIndex === 2}
            body={copy}
            key={title}
            label={`${deskLabel} / ${index}`}
            status={!canManageEvents && itemIndex > 1 ? <StatusBadge status="draft">locked</StatusBadge> : null}
            title={title}
          />
        ))}
      </WorkspaceCommandGrid>
    </div>
  );
}

function LineupSlotCard({
  attachedMoment,
  canManageEvents,
  eventId,
  label,
  recommendedMoment,
  recommendedSignal,
  savedMoments,
  slot,
  slotBooking,
  onAttach
}: {
  attachedMoment?: VaultSavedMoment;
  canManageEvents: boolean;
  eventId?: string;
  label: string;
  recommendedMoment?: VaultSavedMoment;
  recommendedSignal?: MomentSlotSignal;
  savedMoments: VaultSavedMoment[];
  slot: EventLineupSlot;
  slotBooking?: Booking;
  onAttach: (moment: VaultSavedMoment) => void;
}) {
  const slotState = getSlotPresentation(slot, attachedMoment, slotBooking);
  return (
    <div className="flex min-h-[300px] flex-col bg-black p-room-2">
      <div className="flex items-center justify-between gap-room-2">
        <Text variant="uiLabel">{label}</Text>
        <StatusBadge status={slotState.badge}>{slotState.label}</StatusBadge>
      </div>
      <Text as="h3" className="mt-room-4 text-xl" variant="title">
        {attachedMoment?.artist || slotState.title}
      </Text>
      <Text className="mt-room-2 min-h-[58px]" variant="small">
        {attachedMoment
          ? `${attachedMoment.trackTitle} / ${attachedMoment.timestampLabel} / ${attachedMoment.momentLabel}`
          : slotState.copy}
      </Text>
      {attachedMoment ? (
        <div className="mt-room-3 grid grid-cols-2 gap-px border border-roomBorder bg-line">
          <div className="bg-inkPanel p-room-2">
            <Text variant="uiLabel">Reference</Text>
            <Text className="mt-room-1" variant="mono">{attachedMoment.timestampLabel}</Text>
          </div>
          <div className="bg-inkPanel p-room-2">
            <Text variant="uiLabel">Energy</Text>
            <Text className="mt-room-1" variant="mono">{attachedMoment.energy}</Text>
          </div>
        </div>
      ) : recommendedMoment && recommendedSignal ? (
        <button
          className="mt-room-3 border border-acidGreen/50 bg-[#101700] p-room-2 text-left transition hover:border-acidGreen"
          onClick={() => canManageEvents && onAttach(recommendedMoment)}
          type="button"
        >
          <div className="flex items-center justify-between gap-room-2">
            <Text variant="uiLabel">Signal suggestion</Text>
            <span className="font-mono text-[10px] uppercase text-acidGreen">{recommendedSignal.fit}% fit</span>
          </div>
          <Text as="h4" className="mt-room-2 text-lg" variant="title">
            {recommendedMoment.trackTitle}
          </Text>
          <Text className="mt-room-1" variant="small">
            {[recommendedMoment.timestampLabel, recommendedMoment.momentLabel, recommendedSignal.slotLabel].filter(Boolean).join(" / ")}
          </Text>
          <Text className="mt-room-2" variant="small">
            {recommendedSignal.reasons[0]}
          </Text>
        </button>
      ) : null}
      <div className="mt-auto border-t border-roomBorder pt-room-2">
        {canManageEvents ? (
          <Select
            aria-label={`Attach saved reference to ${label}`}
            className="min-h-9 py-2 text-xs"
            value={slot.saved_moment_id ?? ""}
            onChange={(selectEvent) => {
              const moment = savedMoments.find((item) => item.id === selectEvent.target.value);
              if (moment) {
                onAttach(moment);
              }
            }}
          >
            <option className="bg-black" value="">
              {savedMoments.length ? "Attach sound reference" : "No saved references"}
            </option>
            {savedMoments.map((moment) => (
              <option className="bg-black" key={moment.id} value={moment.id}>
                {moment.trackTitle} / {moment.timestampLabel}
              </option>
            ))}
          </Select>
        ) : (
          <Text variant="small">Organizer tools locked.</Text>
        )}
        <div className="mt-room-2 grid gap-room-2">
          {slotBooking ? (
            <>
              <ButtonLink className="w-full" href={`/booking/details/${slotBooking.id}`} size="sm" variant="primary">
                Open Case
              </ButtonLink>
              <ButtonLink className="w-full" href="/dashboard/bookings" size="sm" variant="ghost">
                Booking CRM
              </ButtonLink>
            </>
          ) : attachedMoment?.djId ? (
            <>
              <ButtonLink
                className="w-full"
                href={getBriefBookingHref(attachedMoment, eventId, slot)}
                size="sm"
                variant="primary"
              >
                Use As Brief
              </ButtonLink>
              <ButtonLink className="w-full" href={`/track/${attachedMoment.trackId}`} size="sm" variant="ghost">
                Open Track
              </ButtonLink>
            </>
          ) : (
            <ButtonLink className="w-full" href="/explore" size="sm" variant="secondary">
              Find Sound
            </ButtonLink>
          )}
        </div>
      </div>
    </div>
  );
}

function getBriefBookingHref(moment: VaultSavedMoment, eventId: string | undefined, slot: EventLineupSlot) {
  if (!moment.djId) {
    return "/explore";
  }

  const params = new URLSearchParams({
    workId: moment.trackId,
    t: String(Math.round(moment.timestamp)),
    momentId: moment.id
  });

  if (eventId) {
    params.set("eventId", eventId);
  }

  if (!slot.id.startsWith("virtual-")) {
    params.set("slotId", slot.id);
  }

  return `/booking/${moment.djId}?${params.toString()}`;
}

function SelectedEventCommand({
  bookings,
  canManageEvents,
  event,
  savedMomentsCount,
  slots
}: {
  bookings: Booking[];
  canManageEvents: boolean;
  event: EventPost;
  savedMomentsCount: number;
  slots: EventLineupSlot[];
}) {
  const filledSlots = slots.filter((slot) => slot.saved_moment_id || slot.dj_id || slot.status === "hold" || slot.status === "accepted").length;
  const acceptedSlots = slots.filter((slot) => {
    const booking = getSlotBooking(slot, bookings);
    return slot.status === "accepted" || booking?.status === "accepted" || booking?.status === "paid" || booking?.status === "completed";
  }).length;
  const relatedRequests = countEventRequests(bookings, event);
  const readiness = Math.min(
    100,
    Math.round(
      (Number(Boolean(event.title)) +
        Number(Boolean(event.event_date)) +
        Number(Boolean(event.venue_name)) +
        Number(Boolean(event.city)) +
        Math.min(filledSlots, 5) +
        Math.min(relatedRequests, 2)) *
        12.5
    )
  );
  const nextAction = getEventNextAction(canManageEvents, filledSlots, savedMomentsCount, relatedRequests);

  return (
    <Panel className="mt-room-4 p-room-3">
      <div className="grid gap-room-4 xl:grid-cols-[1fr_320px]">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-room-3">
            <div>
              <Text variant="uiLabel">Selected Event Command</Text>
              <Text as="h2" className="mt-room-2 text-3xl" variant="display">
                {event.title}
              </Text>
              <Text className="mt-room-2 max-w-3xl" variant="small">
                Turn saved atmosphere briefs into lineup decisions, then convert ready slots into booking requests.
              </Text>
            </div>
            <StatusBadge status={readiness > 70 ? "verified" : "pending"}>{readiness}% ready</StatusBadge>
          </div>
          <div className="mt-room-4 grid gap-px border border-roomBorder bg-line md:grid-cols-4">
            <CommandFact label="Date" value={formatDate(event.event_date)} />
            <CommandFact label="Venue" value={event.venue_name || "Venue TBA"} />
            <CommandFact label="City" value={event.city || "City TBA"} />
            <CommandFact label="Type" value={event.event_type || "Event"} />
          </div>
        </div>
        <div className="border border-roomBorder bg-black p-room-3">
          <Text variant="uiLabel">Next Best Action</Text>
          <Text as="h3" className="mt-room-3 text-xl" variant="title">
            {nextAction.title}
          </Text>
          <Text className="mt-room-2" variant="small">{nextAction.copy}</Text>
          <div className="mt-room-3 grid grid-cols-3 gap-room-2">
            <MiniProgress label="Slots" value={`${filledSlots}/${slots.length || 5}`} active={filledSlots > 0} />
            <MiniProgress label="Requests" value={relatedRequests} active={relatedRequests > 0} />
            <MiniProgress label="Accepted" value={acceptedSlots} active={acceptedSlots > 0} />
          </div>
          <ButtonLink className="mt-room-3 w-full" href={nextAction.href} size="sm" variant={nextAction.primary ? "primary" : "secondary"}>
            {nextAction.action}
          </ButtonLink>
        </div>
      </div>
    </Panel>
  );
}

function CommandFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-black p-room-2">
      <Text variant="uiLabel">{label}</Text>
      <Text className="mt-room-2" variant="mono">{value}</Text>
    </div>
  );
}

function MiniProgress({ active, label, value }: { active: boolean; label: string; value: number | string }) {
  return (
    <div className={cx("border p-room-2", active ? "border-acidGreen bg-acidGreen/10" : "border-roomBorder bg-inkPanel")}>
      <Text variant="uiLabel">{label}</Text>
      <Text className={cx("mt-room-1", active ? "text-acidGreen" : "text-paperWhite")} variant="mono">{value}</Text>
    </div>
  );
}

function getEventNextAction(canManageEvents: boolean, filledSlots: number, savedMomentsCount: number, relatedRequests: number) {
  if (!canManageEvents) {
    return {
      action: "Unlock Tools",
      copy: "Organizer or venue verification is required before event programming tools become active.",
      href: "/dashboard/settings",
      primary: false,
      title: "Verify Organizer Access"
    };
  }

  if (savedMomentsCount === 0) {
    return {
      action: "Find Sound",
      copy: "Save a sound reference first. The event desk becomes useful when every slot has a listening-based brief.",
      href: "/explore",
      primary: true,
      title: "Collect First Brief"
    };
  }

  if (filledSlots === 0) {
    return {
      action: "Fill Slots",
      copy: "Attach a saved reference to Opening, Support, Peak, Closing, or Stream before sending requests.",
      href: "#lineup-builder",
      primary: true,
      title: "Attach A Brief"
    };
  }

  if (relatedRequests === 0) {
    return {
      action: "Send Request",
      copy: "At least one slot has a sound reference. Convert the ready slot into a booking request.",
      href: "#lineup-builder",
      primary: true,
      title: "Create First Booking"
    };
  }

  return {
    action: "Open Booking CRM",
    copy: "Requests are already moving. Review negotiation, rider, contract, and escrow preview from Booking CRM.",
    href: "/dashboard/bookings",
    primary: false,
    title: "Review Active Cases"
  };
}

function getSlotPresentation(slot: EventLineupSlot, attachedMoment?: VaultSavedMoment, booking?: Booking) {
  if (slot.status === "accepted" || booking?.status === "accepted" || booking?.status === "paid" || booking?.status === "completed") {
    return {
      badge: "accepted",
      copy: "The artist is confirmed for this slot.",
      label: "accepted",
      title: "Confirmed"
    };
  }

  if (booking?.status === "pending") {
    return {
      badge: "sent",
      copy: "Booking request was sent from this sound reference and is waiting for artist response.",
      label: "request sent",
      title: "Case Open"
    };
  }

  if (booking?.status === "declined" || booking?.status === "cancelled" || booking?.status === "disputed") {
    return {
      badge: "blocked",
      copy: "The linked booking case needs review before this slot can move forward.",
      label: booking.status,
      title: "Blocked"
    };
  }

  if (attachedMoment?.djId) {
    return {
      badge: "selected",
      copy: "This slot has a saved sound reference and is ready to become an atmosphere brief.",
      label: "request ready",
      title: "Brief attached"
    };
  }

  if (slot.status === "hold") {
    return {
      badge: "pending",
      copy: "A hold exists, but the slot still needs a complete sound reference.",
      label: "hold",
      title: "Hold"
    };
  }

  if (slot.status === "optional") {
    return {
      badge: "draft",
      copy: "Optional stream slot. Attach a saved reference if the room needs broadcast programming.",
      label: "optional",
      title: "Optional"
    };
  }

  return {
    badge: "draft",
    copy: "Attach a saved sound reference from Sound Vault, then use it as the booking brief.",
    label: "empty",
    title: "Searching"
  };
}

function SavedMomentRail({ savedMoments }: { savedMoments: VaultSavedMoment[] }) {
  return (
    <Panel className="p-room-3">
      <SectionHeader eyebrow="Saved sound" title="Atmosphere Briefs" />
      <div className="mt-room-3 grid gap-room-2 md:grid-cols-2">
        {savedMoments.length === 0 ? (
          <div className="border border-dashed border-roomBorder bg-black p-room-3 md:col-span-2">
            <Text variant="small">
              No saved sound references yet. Open a Track Page, select a peak, then save it to the Sound Vault.
            </Text>
            <ButtonLink className="mt-room-3" href="/explore" size="sm" variant="secondary">
              Open Discovery
            </ButtonLink>
          </div>
        ) : (
          savedMoments.slice(0, 4).map((moment) => (
            <Link
              className="block border border-roomBorder bg-black p-room-2 hover:border-paperWhite"
              href={`/track/${moment.trackId}`}
              key={moment.id}
            >
              <StatusBadge status="selected">sound ref</StatusBadge>
              <Text as="h3" className="mt-room-2 text-lg" variant="title">
                {moment.trackTitle}
              </Text>
              <Text className="mt-room-1" variant="small">
                {[moment.artist, moment.timestampLabel, moment.momentLabel].filter(Boolean).join(" / ")}
              </Text>
            </Link>
          ))
        )}
      </div>
    </Panel>
  );
}

function EventRoutePanel({ role }: { role?: Profile["role"] }) {
  const venueMode = role === "venue";
  return (
    <Panel className="p-room-3">
      <SectionHeader eyebrow={venueMode ? "Venue route" : "Organizer route"} title="Event To Booking" />
      <div className="mt-room-3 space-y-room-2">
        {[
          venueMode ? "Create room program" : "Create event page",
          "Fill lineup slots",
          "Attach atmosphere brief",
          "Send booking request",
          "Check calendar conflict"
        ].map((step, index) => (
          <div className="grid grid-cols-[32px_1fr] items-center gap-room-2 border border-roomBorder bg-black p-room-2" key={step}>
            <span className={cx("grid h-8 w-8 place-items-center font-mono text-[10px] font-black", index === 2 ? "bg-acidGreen text-voidBlack" : "bg-inkPanel text-mutedText")}>
              {index + 1}
            </span>
            <Text variant="small">{step}</Text>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function getEventDeskRole(fallbackRole: Role, activeRoles: Role[]): Role {
  if (activeRoles.includes(fallbackRole) && fallbackRole !== "listener") {
    return fallbackRole;
  }

  if (hasRoleAccess(activeRoles, ["venue"])) {
    return "venue";
  }

  if (hasRoleAccess(activeRoles, ["organizer"])) {
    return "organizer";
  }

  return "listener";
}

function getEventDeskCopy(role?: Profile["role"]) {
  if (role === "venue") {
    return {
      eyebrow: "Venue Workspace / Event Desk",
      title: "Room Programming",
      description:
        "Create venue event pages, fill recurring lineup slots from saved sound references, send booking requests, and detect conflicts before the room is published."
    };
  }

  if (role === "organizer") {
    return {
      eyebrow: "Organizer Workspace / Event Desk",
      title: "Lineup Builder",
      description:
        "Build event pages, fill Opening / Support / Peak / Closing / Stream slots from saved sound references, then send booking requests with real listening context."
    };
  }

  return {
    eyebrow: "Workspace / Event Desk",
    title: "Event Desk",
    description:
      "Event creation unlocks for organizer and venue roles. Listener mode can still browse events and collect sound references before verification."
  };
}

function EventDeskRow({
  canEdit,
  event,
  isActive,
  onEdit,
  onSelect,
  requestCount
}: {
  canEdit: boolean;
  event: EventPost;
  isActive: boolean;
  onEdit: () => void;
  onSelect: () => void;
  requestCount: number;
}) {
  const status = event.poster_url || event.description ? "public" : "draft";
  return (
    <article className={cx("grid gap-room-3 border p-room-2 md:grid-cols-[1fr_auto] md:items-center", isActive ? "border-acidGreen bg-inkPanel" : "border-roomBorder")}>
      <div>
        <div className="flex flex-wrap items-center gap-room-2">
          <StatusBadge status={status}>{status}</StatusBadge>
          <Text as="h3" className="text-xl" variant="title">
            {event.title}
          </Text>
        </div>
        <Text className="mt-room-1" variant="mono">
          {[formatDate(event.event_date), event.venue_name, event.city, event.event_type].filter(Boolean).join(" / ")}
        </Text>
        <Text className="mt-room-1" variant="small">
          {requestCount} related booking request{requestCount === 1 ? "" : "s"}
        </Text>
      </div>
      <div className="flex flex-wrap gap-room-2">
        <Button size="sm" type="button" variant={isActive ? "primary" : "ghost"} onClick={onSelect}>
          Use
        </Button>
        {canEdit ? (
          <Button onClick={onEdit} size="sm" type="button" variant="ghost">
            Edit
          </Button>
        ) : null}
        <ButtonLink href={`/events/${event.id}`} size="sm" variant="secondary">
          View
        </ButtonLink>
      </div>
    </article>
  );
}

function countCityRequests(bookings: Booking[], city: string | null) {
  if (!city) {
    return 0;
  }

  return bookings.filter((booking) => booking.city.trim().toLowerCase() === city.trim().toLowerCase()).length;
}

function countEventRequests(bookings: Booking[], event: EventPost) {
  const eventSpecificCount = bookings.filter((booking) => booking.source_event_id === event.id).length;
  if (eventSpecificCount > 0) {
    return eventSpecificCount;
  }

  return countCityRequests(bookings, event.city);
}

function getSlotBooking(slot: EventLineupSlot, bookings: Booking[]) {
  if (slot.booking_id) {
    const directBooking = bookings.find((booking) => booking.id === slot.booking_id);
    if (directBooking) {
      return directBooking;
    }
  }

  if (!slot.id.startsWith("virtual-")) {
    const sourceSlotBooking = bookings.find((booking) => booking.source_slot_id === slot.id);
    if (sourceSlotBooking) {
      return sourceSlotBooking;
    }
  }

  if (slot.saved_moment_id) {
    const savedMomentBooking = bookings.find((booking) => booking.source_saved_moment_id === slot.saved_moment_id);
    if (savedMomentBooking) {
      return savedMomentBooking;
    }
  }

  return undefined;
}

function getLineupSlotsForEvent(eventId: string, slots: EventLineupSlot[]): EventLineupSlot[] {
  return LINEUP_SLOT_TYPES.map((slot, index) => {
    const existing = slots.find((item) => item.event_id === eventId && item.slot_type === slot.type);
    return (
      existing ?? {
        id: `virtual-${eventId}-${slot.type}`,
        event_id: eventId,
        slot_type: slot.type,
        dj_id: null,
        saved_moment_id: null,
        booking_id: null,
        status: slot.type === "stream" ? "optional" : "searching",
        position: index,
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: null
      }
    );
  });
}
