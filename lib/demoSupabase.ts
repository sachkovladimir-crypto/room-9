import type { BookingStatus, Role } from "@/lib/types";

type DemoUser = {
  id: string;
  email: string;
  password: string;
  user_metadata: {
    role?: Role;
  };
};

type DemoDb = {
  sessionUserId: string | null;
  users: DemoUser[];
  profiles: Record<string, unknown>[];
  dj_profiles: Record<string, unknown>[];
  organizer_profiles: Record<string, unknown>[];
  venue_profiles: Record<string, unknown>[];
  bookings: Record<string, unknown>[];
  booking_messages: Record<string, unknown>[];
  live_streams: Record<string, unknown>[];
  events: Record<string, unknown>[];
  profile_views: Record<string, unknown>[];
  track_plays: Record<string, unknown>[];
  favorites: Record<string, unknown>[];
  reviews: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  availability: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  event_tickets: Record<string, unknown>[];
  admin_reports: Record<string, unknown>[];
  stream_sessions: Record<string, unknown>[];
  subscriptions: Record<string, unknown>[];
  works: Record<string, unknown>[];
  storage: Record<string, string>;
};

type QueryFilter = {
  field: string;
  operator: "eq" | "in";
  value: unknown;
};

type QueryResult = {
  data: unknown;
  error: null | { message: string; code?: string };
};

const STORAGE_KEY = "room9_demo_db_v1";
type TableName =
  | "profiles"
  | "dj_profiles"
  | "organizer_profiles"
  | "venue_profiles"
  | "bookings"
  | "booking_messages"
  | "live_streams"
  | "events"
  | "profile_views"
  | "track_plays"
  | "favorites"
  | "reviews"
  | "notifications"
  | "availability"
  | "payments"
  | "event_tickets"
  | "admin_reports"
  | "stream_sessions"
  | "subscriptions"
  | "works";

function createEmptyDb(): DemoDb {
  return {
    sessionUserId: null,
    users: [],
    profiles: [],
    dj_profiles: [],
    organizer_profiles: [],
    venue_profiles: [],
    bookings: [],
    booking_messages: [],
    live_streams: [
      {
        id: "demo-live-stream",
        owner_id: null,
        title: "Exhale / Tresor Berlin",
        artist_name: "Amelie Lens",
        location: "Berlin",
        genre: "Techno",
        status: "live",
        starts_at: now(),
        embed_url: null,
        stream_url: null,
        thumbnail_url: null,
        created_at: now()
      },
      {
        id: "demo-archive-stream",
        owner_id: null,
        title: "Awakenings Festival",
        artist_name: "Ben Klock",
        location: "Amsterdam",
        genre: "Techno",
        status: "archived",
        starts_at: now(),
        embed_url: null,
        stream_url: null,
        thumbnail_url: null,
        created_at: now()
      }
    ],
    events: [
      {
        id: "demo-event-void",
        organizer_id: null,
        title: "Void Resonance",
        description: "A concrete-room techno event with extended DJ sets and low-light visuals.",
        venue_name: "Basement",
        city: "Berlin",
        country: "DE",
        event_date: "2026-10-24",
        event_type: "Techno",
        lineup: "DVS1 + Rodhad + Blawan",
        poster_url: null,
        created_at: now()
      }
    ],
    profile_views: [],
    track_plays: [],
    favorites: [],
    reviews: [],
    notifications: [],
    availability: [],
    payments: [],
    event_tickets: [],
    admin_reports: [],
    stream_sessions: [],
    subscriptions: [],
    works: [],
    storage: {}
  };
}

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function loadDb(): DemoDb {
  if (!canUseStorage()) {
    return createEmptyDb();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return createEmptyDb();
  }

  try {
    return { ...createEmptyDb(), ...JSON.parse(raw) } as DemoDb;
  } catch {
    return createEmptyDb();
  }
}

function saveDb(db: DemoDb) {
  if (canUseStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function now() {
  return new Date().toISOString();
}

function publicUser(user: DemoUser) {
  return {
    id: user.id,
    email: user.email,
    user_metadata: user.user_metadata
  };
}

function createSession(user: DemoUser) {
  return {
    access_token: `room9-demo-token-${user.id}`,
    token_type: "bearer",
    expires_in: 3600,
    refresh_token: `room9-demo-refresh-${user.id}`,
    user: publicUser(user)
  };
}

function normalizeRows(table: TableName, rows: Record<string, unknown>[]) {
  return rows.map((row) => {
    if (table === "dj_profiles") {
      return {
        id: createId(),
        created_at: now(),
        is_available: true,
        ...row
      };
    }

    if (table === "bookings") {
      return {
        id: createId(),
        created_at: now(),
        status: "pending" satisfies BookingStatus,
        archived_by_dj: false,
        archived_by_organizer: false,
        ...row
      };
    }

    if (table === "booking_messages") {
      return {
        id: createId(),
        created_at: now(),
        ...row
      };
    }

    if (table === "works") {
      return {
        id: createId(),
        created_at: now(),
        type: "track",
        visibility: "public",
        play_count: 0,
        like_count: 0,
        is_deleted: false,
        ...row
      };
    }

    if (table === "live_streams") {
      return {
        id: createId(),
        created_at: now(),
        status: "upcoming",
        ...row
      };
    }

    if (table === "events") {
      return {
        id: createId(),
        created_at: now(),
        ...row
      };
    }

    if (table === "profile_views" || table === "track_plays") {
      return {
        id: createId(),
        created_at: now(),
        ...row
      };
    }

    return {
      id: createId(),
      created_at: now(),
      ...row
    };
  });
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the audio file for demo storage."));
    reader.readAsDataURL(file);
  });
}

class DemoQueryBuilder {
  private action: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private filters: QueryFilter[] = [];
  private orderField: string | null = null;
  private orderAscending = true;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private payload: Record<string, unknown>[] = [];
  private wantsRows = false;
  private resultMode: "many" | "single" | "maybeSingle" = "many";

  constructor(private table: TableName) {}

  select() {
    this.wantsRows = true;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ field, operator: "eq", value });
    return this;
  }

  in(field: string, value: unknown[]) {
    this.filters.push({ field, operator: "in", value });
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orderField = field;
    this.orderAscending = options?.ascending ?? true;
    return this;
  }

  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    this.action = "insert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.action = "update";
    this.payload = [payload];
    return this;
  }

  upsert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    this.action = "upsert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  single() {
    this.resultMode = "single";
    return this.execute();
  }

  maybeSingle() {
    this.resultMode = "maybeSingle";
    return this.execute();
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<QueryResult> {
    const db = loadDb();
    const rows = db[this.table];

    if (this.action === "insert") {
      const created = normalizeRows(this.table, this.payload);
      rows.push(...created);
      saveDb(db);
      return this.response(created);
    }

    if (this.action === "update") {
      const matched = this.applyFilters(rows);
      matched.forEach((row) => Object.assign(row, this.payload[0]));
      saveDb(db);
      return this.response(matched);
    }

    if (this.action === "delete") {
      const matched = this.applyFilters(rows);
      db[this.table] = rows.filter((row) => !matched.includes(row));
      saveDb(db);
      return this.response(matched);
    }

    if (this.action === "upsert") {
      const changed = this.payload.map((payload) => {
        const existing = rows.find((row) => row.id === payload.id);
        if (existing) {
          Object.assign(existing, payload);
          return existing;
        }

        const created = normalizeRows(this.table, [payload])[0];
        rows.push(created);
        return created;
      });
      saveDb(db);
      return this.response(changed);
    }

    return this.response(this.applyRange(this.applyOrder(this.applyFilters(rows))));
  }

  private applyFilters(rows: Record<string, unknown>[]) {
    return rows.filter((row) =>
      this.filters.every((filter) => {
        if (filter.operator === "eq") {
          return row[filter.field] === filter.value;
        }

        return Array.isArray(filter.value) && filter.value.includes(row[filter.field]);
      })
    );
  }

  private applyOrder(rows: Record<string, unknown>[]) {
    if (!this.orderField) {
      return [...rows];
    }

    return [...rows].sort((a, b) => {
      const aValue = String(a[this.orderField ?? ""] ?? "");
      const bValue = String(b[this.orderField ?? ""] ?? "");
      return this.orderAscending ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    });
  }

  private applyRange(rows: Record<string, unknown>[]) {
    if (this.rangeFrom === null || this.rangeTo === null) {
      return rows;
    }

    return rows.slice(this.rangeFrom, this.rangeTo + 1);
  }

  private response(rows: Record<string, unknown>[]): QueryResult {
    if (!this.wantsRows && this.resultMode === "many") {
      return { data: null, error: null };
    }

    if (this.resultMode === "single") {
      if (rows.length === 0) {
        return { data: null, error: { message: "Demo row not found.", code: "PGRST116" } };
      }
      return { data: rows[0], error: null };
    }

    if (this.resultMode === "maybeSingle") {
      return { data: rows[0] ?? null, error: null };
    }

    return { data: rows, error: null };
  }
}

export function getDemoSupabase() {
  return {
    auth: {
      async signUp({
        email,
        password,
        options
      }: {
        email: string;
        password: string;
        options?: { data?: { role?: Role } };
      }) {
        const db = loadDb();
        const normalizedEmail = email.trim().toLowerCase();
        const existing = db.users.find((user) => user.email === normalizedEmail);

        if (existing) {
          return { data: { user: null, session: null }, error: { message: "User already registered." } };
        }

        const requestedRole = options?.data?.role;
        const role =
          requestedRole === "dj" ||
          requestedRole === "organizer" ||
          requestedRole === "listener" ||
          requestedRole === "venue"
            ? requestedRole
            : "organizer";
        const user: DemoUser = {
          id: createId(),
          email: normalizedEmail,
          password,
          user_metadata: { role }
        };

        db.users.push(user);
        db.sessionUserId = user.id;
        db.profiles.push({
          id: user.id,
          email: user.email,
          role,
          created_at: now()
        });
        saveDb(db);

        return { data: { user: publicUser(user), session: createSession(user) }, error: null };
      },
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const db = loadDb();
        const user = db.users.find(
          (item) => item.email === email.trim().toLowerCase() && item.password === password
        );

        if (!user) {
          return { data: { user: null, session: null }, error: { message: "Invalid login credentials." } };
        }

        db.sessionUserId = user.id;
        saveDb(db);
        return { data: { user: publicUser(user), session: createSession(user) }, error: null };
      },
      async getUser() {
        const db = loadDb();
        const user = db.users.find((item) => item.id === db.sessionUserId);
        return { data: { user: user ? publicUser(user) : null }, error: null };
      },
      async signOut() {
        const db = loadDb();
        db.sessionUserId = null;
        saveDb(db);
        return { error: null };
      },
      onAuthStateChange() {
        return {
          data: {
            subscription: {
              unsubscribe() {}
            }
          }
        };
      }
    },
    from(table: TableName) {
      return new DemoQueryBuilder(table);
    },
    channel() {
      return {
        on() {
          return this;
        },
        subscribe() {
          return this;
        }
      };
    },
    removeChannel() {},
    storage: {
      from() {
        return {
          async upload(path: string, file: File) {
            const db = loadDb();
            db.storage[path] = await fileToDataUrl(file);
            saveDb(db);
            return { data: { path }, error: null };
          },
          getPublicUrl(path: string) {
            const db = loadDb();
            return { data: { publicUrl: db.storage[path] ?? "" } };
          }
        };
      }
    }
  };
}
