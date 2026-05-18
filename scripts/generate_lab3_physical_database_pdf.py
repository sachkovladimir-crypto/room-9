from __future__ import annotations

from pathlib import Path
from textwrap import wrap
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "lab3-physical-database-room9.pdf"

FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_MONO = "/System/Library/Fonts/SFNSMono.ttf"


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("Room9Regular", FONT_REGULAR))
    pdfmetrics.registerFont(TTFont("Room9Bold", FONT_BOLD))
    pdfmetrics.registerFont(TTFont("Room9Mono", FONT_MONO))


def make_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="TitleRoom",
            fontName="Room9Bold",
            fontSize=21,
            leading=27,
            alignment=TA_CENTER,
            spaceAfter=12,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SubtitleRoom",
            fontName="Room9Regular",
            fontSize=10.5,
            leading=15,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#333333"),
            spaceAfter=12,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H1Room",
            fontName="Room9Bold",
            fontSize=14,
            leading=19,
            spaceBefore=10,
            spaceAfter=7,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H2Room",
            fontName="Room9Bold",
            fontSize=11,
            leading=15,
            spaceBefore=7,
            spaceAfter=5,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BodyRoom",
            fontName="Room9Regular",
            fontSize=9.3,
            leading=13,
            alignment=TA_LEFT,
            spaceAfter=5,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SmallRoom",
            fontName="Room9Regular",
            fontSize=7.5,
            leading=9.5,
            textColor=colors.HexColor("#333333"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="TableHead",
            fontName="Room9Bold",
            fontSize=7.2,
            leading=9.2,
            textColor=colors.white,
        )
    )
    styles.add(
        ParagraphStyle(
            name="TableCell",
            fontName="Room9Regular",
            fontSize=6.8,
            leading=8.8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CodeRoom",
            fontName="Room9Mono",
            fontSize=5.7,
            leading=7.2,
            textColor=colors.HexColor("#111111"),
            splitLongWords=True,
        )
    )
    return styles


def p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text, style)


def page_decorator(canvas, doc):
    canvas.saveState()
    width, _ = doc.pagesize
    canvas.setFont("Room9Regular", 7)
    canvas.setFillColor(colors.HexColor("#666666"))
    canvas.drawString(doc.leftMargin, 10 * mm, "ROOM_9 | Лабораторна робота №3")
    canvas.drawRightString(width - doc.rightMargin, 10 * mm, f"Сторінка {doc.page}")
    canvas.restoreState()


def make_table(rows, styles, col_widths):
    data = []
    for i, row in enumerate(rows):
        style = styles["TableHead"] if i == 0 else styles["TableCell"]
        data.append([p(str(cell), style) for cell in row])
    table = Table(data, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.black),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#777777")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def bullets(items, styles):
    return [p(f"• {item}", styles["BodyRoom"]) for item in items]


def code_block(sql: str, styles, max_chars: int = 96):
    lines = []
    for raw in sql.strip("\n").splitlines():
        if not raw:
            lines.append("")
            continue
        wrapped = wrap(raw, max_chars, replace_whitespace=False, drop_whitespace=False) or [raw]
        lines.extend(wrapped)
    text = "<br/>".join(escape(line).replace(" ", "&nbsp;") for line in lines)
    table = Table([[Paragraph(text, styles["CodeRoom"])]], colWidths=[178 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f3f3f0")),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#888888")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


class PhysicalDiagram(Flowable):
    def __init__(self):
        super().__init__()
        self.diagram_width = 780
        self.diagram_height = 470
        self.scale_factor = 1
        self.nodes = {
            "AUTH.USERS": (310, 380, 145, 50, ["id uuid PK", "email"]),
            "PROFILES": (310, 305, 145, 64, ["id uuid PK/FK", "email text", "role text CHECK"]),
            "DJ_PROFILES": (75, 225, 160, 82, ["id uuid PK", "user_id uuid FK", "stage_name text", "genres text", "price numeric"]),
            "ORGANIZER_PROFILES": (310, 220, 160, 70, ["id uuid PK", "user_id uuid FK", "organization_name text", "city text"]),
            "VENUE_PROFILES": (545, 220, 160, 70, ["id uuid PK", "user_id uuid FK", "venue_name text", "capacity integer"]),
            "WORKS": (45, 115, 175, 90, ["id uuid PK", "dj_id uuid FK", "link text", "cover_image text", "visibility CHECK", "play_count integer"]),
            "BOOKINGS": (300, 105, 180, 98, ["id uuid PK", "organizer_id uuid FK", "dj_id uuid FK", "event_date date", "status CHECK", "archive flags"]),
            "EVENTS": (555, 120, 155, 78, ["id uuid PK", "organizer_id uuid FK", "event_date date", "poster_url text"]),
            "BOOKING_MESSAGES": (300, 25, 180, 58, ["id uuid PK", "booking_id uuid FK", "sender_id uuid FK"]),
            "ANALYTICS": (45, 20, 175, 70, ["profile_views", "track_plays", "favorites", "reviews"]),
            "LIVE_STREAMS": (555, 25, 155, 70, ["id uuid PK", "owner_id uuid FK", "status CHECK", "stream_url text"]),
            "STORAGE": (45, 380, 190, 54, ["tracks bucket", "images bucket", "RLS by user folder"]),
        }

    def wrap(self, avail_width, avail_height):
        self.scale_factor = min(avail_width / self.diagram_width, avail_height / self.diagram_height, 1)
        return self.diagram_width * self.scale_factor, self.diagram_height * self.scale_factor

    def draw(self):
        c = self.canv
        c.saveState()
        c.scale(self.scale_factor, self.scale_factor)
        c.setStrokeColor(colors.HexColor("#bbbbbb"))
        c.rect(0, 0, self.diagram_width, self.diagram_height, stroke=1, fill=0)
        c.setFont("Room9Bold", 12)
        c.setFillColor(colors.black)
        c.drawString(16, self.diagram_height - 24, "ФІЗИЧНА СХЕМА БАЗИ ДАНИХ ROOM_9")
        c.setFont("Room9Regular", 7)
        c.setFillColor(colors.HexColor("#444444"))
        c.drawString(16, self.diagram_height - 38, "PostgreSQL / Supabase: public schema, auth.users, storage.objects, PK/FK/CHECK/INDEX/RLS.")

        for source, target, label in [
            ("AUTH.USERS", "PROFILES", "FK id / trigger"),
            ("PROFILES", "DJ_PROFILES", "1 : 0..1"),
            ("PROFILES", "ORGANIZER_PROFILES", "1 : 0..1"),
            ("PROFILES", "VENUE_PROFILES", "1 : 0..1"),
            ("DJ_PROFILES", "WORKS", "1 : N"),
            ("PROFILES", "BOOKINGS", "organizer_id"),
            ("DJ_PROFILES", "BOOKINGS", "dj_id"),
            ("BOOKINGS", "BOOKING_MESSAGES", "1 : N"),
            ("WORKS", "ANALYTICS", "plays"),
            ("DJ_PROFILES", "ANALYTICS", "views/saves"),
            ("PROFILES", "EVENTS", "organizer_id"),
            ("PROFILES", "LIVE_STREAMS", "owner_id"),
            ("STORAGE", "WORKS", "audio/images URLs"),
        ]:
            self._line(c, source, target, label)

        for name, data in self.nodes.items():
            self._node(c, name, *data)
        c.restoreState()

    def _center(self, name):
        x, y, w, h, _ = self.nodes[name]
        return x + w / 2, y + h / 2

    def _line(self, c, a, b, label):
        x1, y1 = self._center(a)
        x2, y2 = self._center(b)
        c.setStrokeColor(colors.HexColor("#555555"))
        c.setLineWidth(0.75)
        c.line(x1, y1, x2, y2)
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        c.setFillColor(colors.white)
        c.rect(mx - 33, my - 6, 66, 12, stroke=0, fill=1)
        c.setFillColor(colors.black)
        c.setFont("Room9Regular", 6)
        c.drawCentredString(mx, my - 2, label)

    def _node(self, c, title, x, y, w, h, fields):
        c.setStrokeColor(colors.black)
        c.setLineWidth(0.9)
        c.setFillColor(colors.white)
        c.rect(x, y, w, h, stroke=1, fill=1)
        c.setFillColor(colors.black)
        c.rect(x, y + h - 18, w, 18, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont("Room9Bold", 7.2)
        c.drawString(x + 6, y + h - 12, title)
        c.setFillColor(colors.black)
        c.setFont("Room9Regular", 6.1)
        for index, field in enumerate(fields):
            c.drawString(x + 7, y + h - 28 - index * 8.4, field)


def physical_table(styles):
    rows = [
        ["Таблиця", "Призначення", "Ключі та обмеження", "Основні індекси"],
        ["profiles", "Базові користувачі та ролі.", "PK id; FK auth.users(id); CHECK role in dj/organizer/admin/listener/venue.", "-"],
        ["dj_profiles", "Публічні DJ-профілі.", "PK id; FK user_id; UNIQUE user_id; gen_random_uuid().", "city, country, genres, is_available, created_at"],
        ["organizer_profiles", "Дані організаторів.", "PK id; FK user_id; UNIQUE user_id.", "-"],
        ["venue_profiles", "Фізичні клуби та майданчики.", "PK id; FK user_id; UNIQUE user_id.", "city"],
        ["bookings", "Заявки на бронювання DJ.", "PK id; FK organizer_id; FK dj_id; CHECK status.", "dj_id, organizer_id, status, created_at"],
        ["booking_messages", "Повідомлення в межах заявки.", "PK id; FK booking_id; FK sender_id.", "booking_id, sender_id, created_at"],
        ["works", "Треки, обкладинки, лірика, статистика.", "PK id; FK dj_id; CHECK visibility.", "dj_id, visibility, is_deleted, play_count"],
        ["events", "Події організаторів та venue.", "PK id; FK organizer_id.", "event_date, city"],
        ["live_streams", "Сторінка стрімів і архівів сетів.", "PK id; FK owner_id; CHECK status.", "status, starts_at"],
        ["profile_views", "Аналітика переглядів DJ-профілів.", "PK id; FK dj_id; optional FK viewer_id.", "dj_id"],
        ["track_plays", "Аналітика прослуховувань.", "PK id; FK work_id; FK dj_id; optional FK listener_id.", "dj_id, work_id"],
        ["favorites", "Збережені DJ.", "PK id; FK user_id; FK dj_id; UNIQUE user_id+dj_id.", "user_id, dj_id"],
        ["reviews", "Оцінки після бронювань.", "PK id; FK booking_id; reviewer_id; reviewee_id; CHECK rating 1..5.", "reviewee_id, reviewer_id"],
        ["payments", "Майбутній escrow/payment ledger.", "PK id; FK booking_id; payer_id; receiver_id; CHECK status.", "booking_id, status"],
    ]
    return make_table(rows, styles, [32 * mm, 45 * mm, 67 * mm, 37 * mm])


CORE_SQL = """
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null check (role in ('dj', 'organizer', 'admin', 'listener', 'venue')),
  created_at timestamp with time zone default now()
);

create table if not exists public.dj_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  stage_name text,
  bio text,
  country text,
  city text,
  genres text,
  bpm_range text,
  price numeric,
  avatar_url text,
  cover_image_url text,
  profile_theme text,
  soundcloud_url text,
  mixcloud_url text,
  is_available boolean default true,
  created_at timestamp with time zone default now(),
  unique (user_id)
);

create table if not exists public.organizer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_name text,
  country text,
  city text,
  contact_email text,
  description text,
  created_at timestamp with time zone default now(),
  unique (user_id)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  dj_id uuid not null references public.dj_profiles(id) on delete cascade,
  event_date date not null,
  venue_name text not null,
  city text not null,
  event_type text not null,
  message text,
  status text default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'completed', 'paid', 'disputed')),
  archived_by_dj boolean default false,
  archived_by_organizer boolean default false,
  created_at timestamp with time zone default now()
);

create table if not exists public.booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  created_at timestamp with time zone default now()
);
"""

MEDIA_SQL = """
create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  dj_id uuid not null references public.dj_profiles(id) on delete cascade,
  title text,
  type text default 'track',
  link text,
  description text,
  cover_image text,
  lyrics text,
  genre text,
  bpm text,
  key text,
  visibility text default 'public' check (visibility in ('public', 'private')),
  play_count integer default 0,
  like_count integer default 0,
  is_deleted boolean default false,
  created_at timestamp with time zone default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid references public.profiles(id) on delete set null,
  title text not null,
  description text,
  venue_name text,
  city text,
  country text,
  event_date date,
  event_type text,
  lineup text,
  poster_url text,
  created_at timestamp with time zone default now()
);

create table if not exists public.live_streams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null,
  artist_name text not null,
  location text,
  genre text,
  status text default 'upcoming' check (status in ('live', 'upcoming', 'archived')),
  starts_at timestamp with time zone,
  embed_url text,
  stream_url text,
  thumbnail_url text,
  created_at timestamp with time zone default now()
);

create table if not exists public.profile_views (
  id uuid primary key default gen_random_uuid(),
  dj_id uuid not null references public.dj_profiles(id) on delete cascade,
  viewer_id uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default now()
);

create table if not exists public.track_plays (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  dj_id uuid not null references public.dj_profiles(id) on delete cascade,
  listener_id uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default now()
);
"""

SUPPORT_SQL = """
create table if not exists public.venue_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  venue_name text,
  country text,
  city text,
  address text,
  capacity integer,
  description text,
  website_url text,
  instagram_url text,
  created_at timestamp with time zone default now(),
  unique (user_id)
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  dj_id uuid not null references public.dj_profiles(id) on delete cascade,
  created_at timestamp with time zone default now(),
  unique (user_id, dj_id)
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamp with time zone default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  payer_id uuid references public.profiles(id) on delete set null,
  receiver_id uuid references public.profiles(id) on delete set null,
  amount numeric,
  currency text default 'EUR',
  status text check (status in ('pending', 'paid', 'released', 'refunded', 'failed')),
  provider text,
  created_at timestamp with time zone default now()
);
"""

INDEX_SQL = """
create index if not exists idx_dj_profiles_city on public.dj_profiles(city);
create index if not exists idx_dj_profiles_country on public.dj_profiles(country);
create index if not exists idx_dj_profiles_genres on public.dj_profiles(genres);
create index if not exists idx_dj_profiles_is_available on public.dj_profiles(is_available);
create index if not exists idx_bookings_dj_id on public.bookings(dj_id);
create index if not exists idx_bookings_organizer_id on public.bookings(organizer_id);
create index if not exists idx_bookings_status on public.bookings(status);
create index if not exists idx_works_dj_id on public.works(dj_id);
create index if not exists idx_works_visibility on public.works(visibility);
create index if not exists idx_events_event_date on public.events(event_date);
create index if not exists idx_events_city on public.events(city);
create index if not exists idx_live_streams_status on public.live_streams(status);
create index if not exists idx_profile_views_dj_id on public.profile_views(dj_id);
create index if not exists idx_track_plays_work_id on public.track_plays(work_id);
"""

AUTH_RLS_SQL = """
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_role text;
begin
  selected_role := coalesce(new.raw_user_meta_data ->> 'role', 'organizer');
  if selected_role not in ('dj', 'organizer', 'admin', 'listener', 'venue') then
    selected_role := 'organizer';
  end if;

  insert into public.profiles (id, email, role)
  values (new.id, new.email, selected_role)
  on conflict (id) do update
    set email = excluded.email,
        role = excluded.role;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.dj_profiles enable row level security;
alter table public.bookings enable row level security;
alter table public.works enable row level security;

create policy "demo_profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "demo_dj_profiles_update_own"
  on public.dj_profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
"""

STORAGE_SQL = """
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tracks',
  'tracks',
  true,
  52428800,
  array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'images',
  'images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "demo_tracks_insert_owner_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'tracks'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
"""


def build_pdf() -> None:
    register_fonts()
    styles = make_styles()
    OUT.parent.mkdir(parents=True, exist_ok=True)

    doc = BaseDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title="Лабораторна робота №3 - ROOM_9",
        author="ROOM_9",
    )
    portrait_frame = Frame(doc.leftMargin, doc.bottomMargin + 6 * mm, doc.width, doc.height - 4 * mm, id="portrait")
    landscape_size = landscape(A4)
    landscape_frame = Frame(10 * mm, 14 * mm, landscape_size[0] - 20 * mm, landscape_size[1] - 24 * mm, id="landscape")
    doc.addPageTemplates(
        [
            PageTemplate(id="portrait", frames=[portrait_frame], pagesize=A4, onPage=page_decorator),
            PageTemplate(id="landscape", frames=[landscape_frame], pagesize=landscape_size, onPage=page_decorator),
        ]
    )

    story = []
    story.append(Spacer(1, 8 * mm))
    story.append(p("ЛАБОРАТОРНА РОБОТА №3", styles["TitleRoom"]))
    story.append(p("Тема: Реалізація структури бази даних на фізичному рівні", styles["SubtitleRoom"]))
    story.append(
        p(
            "<b>Мета:</b> на основі логічної моделі даних інформаційної бази системи ROOM_9 побудувати модель бази даних на фізичному рівні та згенерувати код створення необхідних об'єктів бази даних.",
            styles["BodyRoom"],
        )
    )

    story.append(p("1. Обґрунтування вибору системи управління інформаційною базою", styles["H1Room"]))
    story.append(
        p(
            "Для реалізації інформаційної бази проєкту ROOM_9 обрано Supabase, який використовує PostgreSQL як основну реляційну СУБД. "
            "Такий вибір відповідає структурі предметної області: система містить користувачів, рольові профілі, заявки на бронювання, треки, події, стріми, повідомлення та аналітичні події, між якими існують чіткі зв'язки один-до-багатьох і багато-до-багатьох.",
            styles["BodyRoom"],
        )
    )
    story.extend(
        bullets(
            [
                "<b>Реляційна модель.</b> PostgreSQL дає змогу явно описати первинні та зовнішні ключі, каскадне видалення, унікальність та CHECK-обмеження.",
                "<b>Надійність транзакцій.</b> Заявки на бронювання, статуси та майбутні платежі потребують ACID-семантики.",
                "<b>Інтеграція з авторизацією.</b> Supabase Auth створює записи в auth.users, а trigger автоматично синхронізує їх із таблицею profiles.",
                "<b>Безпека на рівні рядків.</b> Row Level Security дозволяє обмежити доступ до профілів, заявок, повідомлень і файлів без використання service_role key на frontend.",
                "<b>Файлове сховище.</b> Supabase Storage використовується для audio-файлів у bucket tracks і зображень у bucket images.",
                "<b>Готовність до деплою.</b> Supabase добре інтегрується з Next.js/Vercel і дає REST/Realtime API поверх PostgreSQL.",
            ],
            styles,
        )
    )

    story.append(p("2. Фізична модель бази даних ROOM_9", styles["H1Room"]))
    story.append(
        p(
            "Фізична модель реалізована в PostgreSQL у схемі public. Для ідентифікаторів використовується тип uuid з генерацією через gen_random_uuid(), для часу - timestamp with time zone, для вартості бронювання - numeric, для статусів і ролей - text із CHECK-обмеженнями.",
            styles["BodyRoom"],
        )
    )
    story.append(physical_table(styles))

    story.append(NextPageTemplate("landscape"))
    story.append(PageBreak())
    story.append(p("3. Структура бази даних у вигляді схеми", styles["H1Room"]))
    story.append(
        p(
            "Схема нижче показує фізичні таблиці, типи ключів, основні поля та інтеграцію з auth.users і Supabase Storage.",
            styles["BodyRoom"],
        )
    )
    story.append(PhysicalDiagram())

    story.append(NextPageTemplate("portrait"))
    story.append(PageBreak())
    story.append(p("4. Коди створення необхідних об'єктів бази даних", styles["H1Room"]))
    story.append(
        p(
            "Нижче наведено ключові фрагменти SQL-коду. Повний виконуваний файл створення структури БД знаходиться у проєкті за шляхом supabase/schema.sql.",
            styles["BodyRoom"],
        )
    )
    story.append(p("4.1. Розширення та основні таблиці користувачів/бронювань", styles["H2Room"]))
    story.append(code_block(CORE_SQL, styles))

    story.append(PageBreak())
    story.append(p("4.2. Таблиці музичного контенту, подій та аналітики", styles["H2Room"]))
    story.append(code_block(MEDIA_SQL, styles))

    story.append(p("4.3. Підтримувальні та перспективні таблиці V2/V3", styles["H2Room"]))
    story.append(code_block(SUPPORT_SQL, styles))

    story.append(PageBreak())
    story.append(p("4.4. Індекси для прискорення пошуку та dashboard-запитів", styles["H2Room"]))
    story.append(code_block(INDEX_SQL, styles))

    story.append(p("4.5. Trigger авторизації та базові RLS-політики", styles["H2Room"]))
    story.append(code_block(AUTH_RLS_SQL, styles))

    story.append(PageBreak())
    story.append(p("4.6. Storage buckets для аудіо та зображень", styles["H2Room"]))
    story.append(code_block(STORAGE_SQL, styles))

    story.append(p("5. Висновок", styles["H1Room"]))
    story.append(
        p(
            "У результаті лабораторної роботи логічну модель ROOM_9 було реалізовано на фізичному рівні у PostgreSQL/Supabase. "
            "Структура містить типізовані таблиці, первинні та зовнішні ключі, CHECK-обмеження, унікальні обмеження, індекси, trigger для автоматичного створення профілю користувача, RLS-політики та storage buckets для медіафайлів.",
            styles["BodyRoom"],
        )
    )
    story.append(
        p(
            "Обрана СУБД забезпечує цілісність даних для booking-flow, безпечну роботу з ролями користувачів, можливість масштабування музичного модуля та підготовку до майбутніх функцій V2/V3: рейтингів, обраного, live-stream sessions, ticketing та escrow-платежів.",
            styles["BodyRoom"],
        )
    )

    doc.build(story)


if __name__ == "__main__":
    build_pdf()
    print(OUT)
