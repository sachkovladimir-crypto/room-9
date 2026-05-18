import {
  hasRoleAccess,
  type Booking,
  type DjProfile,
  type EventLineupSlot,
  type EventPost,
  type OrganizerProfile,
  type Role,
  type SavedMoment,
  type VenueProfile,
  type Work
} from "@/lib/types";

export type RoleUnlockStep = {
  id: string;
  label: string;
  done: boolean;
  note: string;
  href?: string;
  action?: string;
};

export type RoleUnlockPath = {
  role: Role;
  title: string;
  subtitle: string;
  readiness: number;
  isActive: boolean;
  status: "locked" | "pending" | "active" | "complete";
  primaryHref: string;
  primaryAction: string;
  steps: RoleUnlockStep[];
};

export type RoleVerificationState = {
  activeRoles: Role[];
  bookings: Booking[];
  djProfile: DjProfile | null;
  eventLineupSlots: EventLineupSlot[];
  events: EventPost[];
  organizerProfile: OrganizerProfile | null;
  savedMoments: SavedMoment[];
  venueProfile: VenueProfile | null;
  works: Work[];
};

export function getRoleUnlockPaths(state: RoleVerificationState): RoleUnlockPath[] {
  return [
    buildListenerPath(state),
    buildDjPath(state),
    buildOrganizerPath(state),
    buildVenuePath(state)
  ];
}

export function getRoleUnlockPath(role: Role, state: RoleVerificationState) {
  return getRoleUnlockPaths(state).find((path) => path.role === role) ?? buildListenerPath(state);
}

export function getRoleUnlockDoneCount(path: RoleUnlockPath) {
  return path.steps.filter((step) => step.done).length;
}

export function getRoleUnlockNextStep(path: RoleUnlockPath) {
  return path.steps.find((step) => !step.done) ?? null;
}

export function getRoleUnlockGate(path: RoleUnlockPath) {
  if (path.role === "listener") {
    return {
      canActivate: true,
      label: "open",
      message: "Listener mode is always open. Music discovery, streams, events and Sound Vault stay available by default."
    };
  }

  const requiredStepId = getRequiredActivationStepId(path.role);
  const requiredStep = path.steps.find((step) => step.id === requiredStepId);

  if (path.isActive) {
    return {
      canActivate: true,
      label: "active",
      message: `${path.title} is already active. Continue the remaining checklist to unlock stronger trust, analytics and booking readiness.`
    };
  }

  if (!requiredStep) {
    return {
      canActivate: path.readiness > 0,
      label: path.readiness > 0 ? "ready" : "locked",
      message: path.readiness > 0
        ? `${path.title} has enough profile signal to request access.`
        : `Start the ${path.title} checklist before requesting access.`
    };
  }

  if (requiredStep.done) {
    return {
      canActivate: true,
      label: "ready",
      message: `${requiredStep.label} is complete. You can activate ${path.title}; the rest of the path opens progressively inside the workspace.`
    };
  }

  return {
    canActivate: false,
    label: "locked",
    message: `Complete first: ${requiredStep.label}. ${requiredStep.note}`
  };
}

export function getRequiredActivationStepId(role: Role) {
  if (role === "dj") {
    return "dj-profile";
  }

  if (role === "organizer") {
    return "organizer-profile";
  }

  if (role === "venue") {
    return "venue-profile";
  }

  return "";
}

function buildListenerPath(state: RoleVerificationState): RoleUnlockPath {
  const steps: RoleUnlockStep[] = [
    {
      id: "listener-account",
      done: true,
      label: "Create listener account",
      note: "Every ROOM_9 account starts with music discovery.",
      href: "/explore",
      action: "Explore"
    },
    {
      id: "listener-save-moment",
      done: state.savedMoments.length > 0,
      label: "Save first sound reference",
      note: "Saved moments become future briefs for events and bookings.",
      href: "/explore",
      action: "Find sound"
    },
    {
      id: "listener-vault",
      done: state.savedMoments.length > 0 || state.works.length > 0,
      label: "Build Sound Vault",
      note: "Use likes, playlists, queue and saved references before unlocking pro tools.",
      href: "/library",
      action: "Open vault"
    }
  ];

  return makePath({
    isActive: true,
    primaryAction: "Open Sound Vault",
    primaryHref: "/library",
    role: "listener",
    steps,
    subtitle: "Default account for listening, saving, playlists, streams and public events.",
    title: "Listener foundation"
  });
}

function buildDjPath(state: RoleVerificationState): RoleUnlockPath {
  const hasCoreProfile = Boolean(
    state.djProfile?.stage_name &&
      state.djProfile?.city &&
      state.djProfile?.genres &&
      state.djProfile?.bpm_range &&
      state.djProfile?.price
  );
  const firstTrack = state.works.length > 0;
  const trackCover = state.works.some((work) => Boolean(work.cover_image));
  const rider = Boolean(state.djProfile?.technical_rider_url);

  const steps: RoleUnlockStep[] = [
    {
      id: "dj-profile",
      done: hasCoreProfile,
      label: "Complete DJ profile",
      note: "Stage name, location, genre, BPM range and fee define the artist dossier.",
      href: "/dashboard/settings#dj-profile-settings",
      action: "Edit profile"
    },
    {
      id: "dj-avatar",
      done: Boolean(state.djProfile?.avatar_url),
      label: "Upload avatar",
      note: "Avatar appears in the player, Explore rows and public dossier.",
      href: "/dashboard/settings#dj-profile-settings",
      action: "Upload"
    },
    {
      id: "dj-cover",
      done: Boolean(state.djProfile?.cover_image_url),
      label: "Upload profile cover",
      note: "Cover gives the dossier a strong public music identity.",
      href: "/dashboard/settings#dj-profile-settings",
      action: "Upload"
    },
    {
      id: "dj-track",
      done: firstTrack,
      label: "Upload first track",
      note: "Public sound proof unlocks stronger discovery and booking trust.",
      href: "/library",
      action: "Upload track"
    },
    {
      id: "dj-track-cover",
      done: trackCover,
      label: "Add track cover",
      note: "Covers make Vault, player and release pages feel like a real music platform.",
      href: "/library",
      action: "Edit track"
    },
    {
      id: "dj-rider",
      done: rider,
      label: "Upload technical rider",
      note: "Rider readiness removes friction from booking case files.",
      href: "/dashboard/settings#dj-rider-upload",
      action: "Upload rider"
    },
    {
      id: "dj-analytics",
      done: firstTrack && (state.savedMoments.length > 0 || state.bookings.length > 0),
      label: "Unlock analytics",
      note: "Analytics become meaningful after tracks create saves, references or booking intent.",
      href: "/dashboard/analytics",
      action: "Open analytics"
    },
    {
      id: "dj-trust",
      done: hasCoreProfile && firstTrack && rider,
      label: "Unlock booking trust",
      note: "Profile data, sound proof and rider form the trust layer for promoters.",
      href: "/dj/" + (state.djProfile?.id ?? ""),
      action: "View dossier"
    }
  ];

  return makePath({
    isActive: hasRoleAccess(state.activeRoles, ["dj", "admin"]),
    primaryAction: "Activate DJ Tools",
    primaryHref: "/dashboard/settings?unlock=dj",
    role: "dj",
    steps,
    subtitle: "Uploads, artist dossier, rider, booking trust and sound-performance analytics.",
    title: "DJ verification"
  });
}

function buildOrganizerPath(state: RoleVerificationState): RoleUnlockPath {
  const hasProfile = Boolean(
    state.organizerProfile?.organization_name &&
      state.organizerProfile?.city &&
      state.organizerProfile?.contact_email
  );
  const firstEvent = state.events.length > 0;
  const attachedSlot = state.eventLineupSlots.some((slot) => Boolean(slot.saved_moment_id || slot.booking_id));
  const sentRequest = state.bookings.length > 0;

  const steps: RoleUnlockStep[] = [
    {
      id: "organizer-profile",
      done: hasProfile,
      label: "Add organization details",
      note: "Organization name, city and contact email identify the booking owner.",
      href: "/dashboard/settings#organizer-profile-settings",
      action: "Edit profile"
    },
    {
      id: "organizer-moment",
      done: state.savedMoments.length > 0,
      label: "Save first sound reference",
      note: "References turn listening behavior into atmosphere briefs.",
      href: "/explore",
      action: "Find sound"
    },
    {
      id: "organizer-event",
      done: firstEvent,
      label: "Create first event",
      note: "Event Desk becomes the workspace for lineup slots and booking context.",
      href: "/dashboard/events",
      action: "Create event"
    },
    {
      id: "organizer-slot",
      done: attachedSlot,
      label: "Attach sound to lineup slot",
      note: "Opening, Support, Peak, Closing and Stream slots should carry sound evidence.",
      href: "/dashboard/events",
      action: "Open slots"
    },
    {
      id: "organizer-request",
      done: sentRequest,
      label: "Send first booking request",
      note: "Booking CRM opens once a sound reference becomes a real case.",
      href: "/dashboard/bookings",
      action: "Open CRM"
    }
  ];

  return makePath({
    isActive: hasRoleAccess(state.activeRoles, ["organizer", "admin"]),
    primaryAction: "Activate Organizer Tools",
    primaryHref: "/dashboard/settings?unlock=organizer",
    role: "organizer",
    steps,
    subtitle: "Event Desk, lineup slots, saved sound references, sent requests and case files.",
    title: "Organizer tools"
  });
}

function buildVenuePath(state: RoleVerificationState): RoleUnlockPath {
  const hasProfile = Boolean(
    state.venueProfile?.venue_name &&
      state.venueProfile?.city &&
      state.venueProfile?.address &&
      state.venueProfile?.capacity
  );
  const firstEvent = state.events.length > 0;
  const hasSlot = state.eventLineupSlots.length > 0;
  const attachedSlot = state.eventLineupSlots.some((slot) => Boolean(slot.saved_moment_id || slot.booking_id));

  const steps: RoleUnlockStep[] = [
    {
      id: "venue-profile",
      done: hasProfile,
      label: "Add venue profile",
      note: "Venue name, city, address and capacity define the physical room.",
      href: "/dashboard/settings#venue-profile-settings",
      action: "Edit venue"
    },
    {
      id: "venue-event",
      done: firstEvent,
      label: "Create venue event",
      note: "Venue events carry room context, dates, capacity and budget.",
      href: "/dashboard/events",
      action: "Create event"
    },
    {
      id: "venue-slot",
      done: hasSlot,
      label: "Add lineup slots",
      note: "Slots structure the night before booking requests are sent.",
      href: "/dashboard/events",
      action: "Lineup desk"
    },
    {
      id: "venue-brief",
      done: attachedSlot,
      label: "Attach atmosphere brief",
      note: "Saved moments make the lineup brief specific instead of vague.",
      href: "/dashboard/events",
      action: "Attach brief"
    },
    {
      id: "venue-calendar",
      done: state.events.length > 1 || state.bookings.length > 0,
      label: "Unlock recurring calendar",
      note: "Multiple events or booking cases activate timeline conflict checks.",
      href: "/dashboard/calendar",
      action: "Open timeline"
    }
  ];

  return makePath({
    isActive: hasRoleAccess(state.activeRoles, ["venue", "admin"]),
    primaryAction: "Activate Venue Tools",
    primaryHref: "/dashboard/settings?unlock=venue",
    role: "venue",
    steps,
    subtitle: "Venue profile, event programming, lineup slots and recurring calendar operations.",
    title: "Venue tools"
  });
}

function makePath({
  isActive,
  primaryAction,
  primaryHref,
  role,
  steps,
  subtitle,
  title
}: {
  isActive: boolean;
  primaryAction: string;
  primaryHref: string;
  role: Role;
  steps: RoleUnlockStep[];
  subtitle: string;
  title: string;
}): RoleUnlockPath {
  const doneCount = steps.filter((step) => step.done).length;
  const readiness = Math.round((doneCount / steps.length) * 100);
  const status = readiness === 100 ? "complete" : isActive ? "active" : readiness > 0 ? "pending" : "locked";

  return {
    isActive,
    primaryAction,
    primaryHref,
    readiness,
    role,
    status,
    steps,
    subtitle,
    title
  };
}
