from __future__ import annotations

from pathlib import Path

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
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "logical-data-model-room9.pdf"

FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("Room9Regular", FONT_REGULAR))
    pdfmetrics.registerFont(TTFont("Room9Bold", FONT_BOLD))


def make_styles():
    base = getSampleStyleSheet()
    base.add(
        ParagraphStyle(
            name="DocTitle",
            fontName="Room9Bold",
            fontSize=22,
            leading=28,
            alignment=TA_CENTER,
            textColor=colors.black,
            spaceAfter=14,
        )
    )
    base.add(
        ParagraphStyle(
            name="DocSubtitle",
            fontName="Room9Regular",
            fontSize=11,
            leading=16,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#333333"),
            spaceAfter=16,
        )
    )
    base.add(
        ParagraphStyle(
            name="H1Room",
            fontName="Room9Bold",
            fontSize=15,
            leading=20,
            textColor=colors.black,
            spaceBefore=10,
            spaceAfter=8,
        )
    )
    base.add(
        ParagraphStyle(
            name="H2Room",
            fontName="Room9Bold",
            fontSize=12,
            leading=16,
            textColor=colors.black,
            spaceBefore=8,
            spaceAfter=6,
        )
    )
    base.add(
        ParagraphStyle(
            name="BodyRoom",
            fontName="Room9Regular",
            fontSize=9.6,
            leading=13.5,
            alignment=TA_LEFT,
            textColor=colors.black,
            spaceAfter=6,
        )
    )
    base.add(
        ParagraphStyle(
            name="SmallRoom",
            fontName="Room9Regular",
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#222222"),
        )
    )
    base.add(
        ParagraphStyle(
            name="TableHead",
            fontName="Room9Bold",
            fontSize=7.2,
            leading=9,
            textColor=colors.white,
            alignment=TA_LEFT,
        )
    )
    base.add(
        ParagraphStyle(
            name="TableCell",
            fontName="Room9Regular",
            fontSize=7,
            leading=9,
            textColor=colors.black,
            alignment=TA_LEFT,
        )
    )
    return base


def p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text, style)


class ERDiagram(Flowable):
    def __init__(self, styles):
        super().__init__()
        self.diagram_width = 760
        self.diagram_height = 465
        self.scale_factor = 1
        self.styles = styles
        self.nodes = {
            "PROFILES": (305, 370, 150, 62, ["PK id", "email", "role"]),
            "DJ_PROFILES": (65, 275, 150, 68, ["PK id", "FK user_id", "stage_name", "genres"]),
            "ORGANIZER_PROFILES": (305, 275, 150, 62, ["PK id", "FK user_id", "organization"]),
            "VENUE_PROFILES": (545, 275, 150, 62, ["PK id", "FK user_id", "venue_name"]),
            "WORKS": (65, 170, 150, 72, ["PK id", "FK dj_id", "title", "link", "play_count"]),
            "BOOKINGS": (305, 160, 150, 82, ["PK id", "FK organizer_id", "FK dj_id", "event_date", "status"]),
            "EVENTS": (545, 172, 150, 66, ["PK id", "FK organizer_id", "title", "event_date"]),
            "TRACK_PLAYS": (20, 62, 132, 62, ["PK id", "FK work_id", "listener_id"]),
            "PROFILE_VIEWS": (175, 62, 132, 62, ["PK id", "FK dj_id", "viewer_id"]),
            "FAVORITES": (330, 62, 132, 62, ["PK id", "FK user_id", "FK dj_id"]),
            "BOOKING_MESSAGES": (485, 62, 132, 62, ["PK id", "FK booking_id", "sender_id"]),
            "REVIEWS": (640, 62, 115, 62, ["PK id", "rating", "reviewer_id"]),
            "LIVE_STREAMS": (545, 365, 150, 62, ["PK id", "FK owner_id", "title", "status"]),
        }

    def wrap(self, avail_width, avail_height):
        self.scale_factor = min(avail_width / self.diagram_width, avail_height / self.diagram_height, 1)
        return self.diagram_width * self.scale_factor, self.diagram_height * self.scale_factor

    def draw(self):
        c = self.canv
        c.saveState()
        c.scale(self.scale_factor, self.scale_factor)
        c.setStrokeColor(colors.HexColor("#bbbbbb"))
        c.setLineWidth(0.6)
        c.rect(0, 0, self.diagram_width, self.diagram_height, stroke=1, fill=0)
        c.setFont("Room9Bold", 12)
        c.setFillColor(colors.black)
        c.drawString(16, self.diagram_height - 24, "ER-ДІАГРАМА ROOM_9: ЛОГІЧНА МОДЕЛЬ ДАНИХ")
        c.setFont("Room9Regular", 7.5)
        c.setFillColor(colors.HexColor("#444444"))
        c.drawString(16, self.diagram_height - 38, "Позначення: 1 - один запис; 0..1 - необов'язковий один запис; 0..N - багато записів.")

        for a, b, label in [
            ("PROFILES", "DJ_PROFILES", "1 : 0..1  owns"),
            ("PROFILES", "ORGANIZER_PROFILES", "1 : 0..1  owns"),
            ("PROFILES", "VENUE_PROFILES", "1 : 0..1  owns"),
            ("PROFILES", "LIVE_STREAMS", "1 : 0..N  creates"),
            ("DJ_PROFILES", "WORKS", "1 : 0..N  uploads"),
            ("PROFILES", "BOOKINGS", "1 : 0..N  creates"),
            ("DJ_PROFILES", "BOOKINGS", "1 : 0..N  receives"),
            ("ORGANIZER_PROFILES", "EVENTS", "1 : 0..N  publishes"),
            ("WORKS", "TRACK_PLAYS", "1 : 0..N  is played"),
            ("DJ_PROFILES", "PROFILE_VIEWS", "1 : 0..N  is viewed"),
            ("PROFILES", "FAVORITES", "1 : 0..N  saves"),
            ("DJ_PROFILES", "FAVORITES", "1 : 0..N  is saved"),
            ("BOOKINGS", "BOOKING_MESSAGES", "1 : 0..N  contains"),
            ("BOOKINGS", "REVIEWS", "1 : 0..N  generates"),
        ]:
            self._connector(c, a, b, label)

        for name, data in self.nodes.items():
            self._node(c, name, *data)

        c.restoreState()

    def _center(self, name):
        x, y, w, h, _ = self.nodes[name]
        return x + w / 2, y + h / 2

    def _connector(self, c, source, target, label):
        x1, y1 = self._center(source)
        x2, y2 = self._center(target)
        c.setStrokeColor(colors.HexColor("#555555"))
        c.setLineWidth(0.75)
        c.line(x1, y1, x2, y2)
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        c.setFillColor(colors.white)
        c.rect(mx - 38, my - 7, 76, 13, stroke=0, fill=1)
        c.setFillColor(colors.black)
        c.setFont("Room9Regular", 6.2)
        c.drawCentredString(mx, my - 2, label)

    def _node(self, c, name, x, y, w, h, fields):
        c.setStrokeColor(colors.black)
        c.setLineWidth(0.9)
        c.setFillColor(colors.white)
        c.rect(x, y, w, h, stroke=1, fill=1)
        c.setFillColor(colors.black)
        c.rect(x, y + h - 18, w, 18, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont("Room9Bold", 7.4)
        c.drawString(x + 6, y + h - 12, name)
        c.setFillColor(colors.black)
        c.setFont("Room9Regular", 6.6)
        top = y + h - 28
        for idx, field in enumerate(fields[:5]):
            c.drawString(x + 7, top - idx * 9, field)


def page_decorator(canvas, doc):
    canvas.saveState()
    width, height = doc.pagesize
    canvas.setFont("Room9Regular", 7)
    canvas.setFillColor(colors.HexColor("#666666"))
    canvas.drawString(doc.leftMargin, 10 * mm, "ROOM_9 | Логічна модель даних")
    canvas.drawRightString(width - doc.rightMargin, 10 * mm, f"Сторінка {doc.page}")
    canvas.restoreState()


def entity_table(styles):
    rows = [
        [
            "Сутність",
            "Основні атрибути",
            "Тип сутності",
            "Пояснення",
        ],
        [
            "Профіль користувача (`profiles`)",
            "`id`, `email`, `role`, `created_at`",
            "Сильна / базова",
            "Зберігає основні дані користувача та роль: DJ, organizer, venue, listener або admin.",
        ],
        [
            "Профіль діджея (`dj_profiles`)",
            "`id`, `user_id`, `stage_name`, `bio`, `country`, `city`, `genres`, `bpm_range`, `price`, `avatar_url`, `cover_image_url`, `is_available`",
            "Залежна рольова",
            "Існує для користувача з роллю DJ та розширює базовий профіль професійними даними.",
        ],
        [
            "Профіль організатора (`organizer_profiles`)",
            "`id`, `user_id`, `organization_name`, `country`, `city`, `contact_email`, `description`",
            "Залежна рольова",
            "Описує організатора або агентство, яке бронює артистів.",
        ],
        [
            "Профіль venue / клубу (`venue_profiles`)",
            "`id`, `user_id`, `venue_name`, `country`, `city`, `address`, `capacity`, `description`, `website_url`, `instagram_url`",
            "Залежна рольова V2",
            "Окремий тип організатора: фізичний майданчик із власним профілем і календарем подій.",
        ],
        [
            "Заявка на бронювання (`bookings`)",
            "`id`, `organizer_id`, `dj_id`, `event_date`, `venue_name`, `city`, `event_type`, `message`, `status`, `created_at`",
            "Асоціативна / транзакційна",
            "Зв'язує організатора та DJ-профіль. Має власні атрибути, тому є окремою сутністю.",
        ],
        [
            "Повідомлення (`booking_messages`)",
            "`id`, `booking_id`, `sender_id`, `message`, `created_at`",
            "Залежна подієва",
            "Зберігає переписку в межах конкретної заявки на бронювання.",
        ],
        [
            "Трек / робота (`works`)",
            "`id`, `dj_id`, `title`, `type`, `link`, `cover_image`, `lyrics`, `genre`, `bpm`, `key`, `visibility`, `play_count`, `like_count`",
            "Залежна контентна",
            "Формує музичну бібліотеку DJ та використовується глобальним аудіоплеєром.",
        ],
        [
            "Подія (`events`)",
            "`id`, `organizer_id`, `title`, `description`, `venue_name`, `city`, `country`, `event_date`, `event_type`, `lineup`, `poster_url`",
            "Контентна / організаційна",
            "Описує подію, яку створює організатор або клуб.",
        ],
        [
            "Live stream (`live_streams`)",
            "`id`, `owner_id`, `title`, `artist_name`, `location`, `genre`, `status`, `starts_at`, `embed_url`, `stream_url`",
            "Контентна подієва",
            "Описує стрім або запис DJ-сету.",
        ],
        [
            "Перегляд профілю (`profile_views`)",
            "`id`, `dj_id`, `viewer_id`, `created_at`",
            "Аналітична подієва",
            "Фіксує факт перегляду DJ-профілю.",
        ],
        [
            "Прослуховування (`track_plays`)",
            "`id`, `work_id`, `dj_id`, `listener_id`, `created_at`",
            "Аналітична подієва",
            "Фіксує факт програвання треку та використовується для статистики.",
        ],
        [
            "Обране (`favorites`)",
            "`id`, `user_id`, `dj_id`, `created_at`",
            "Асоціативна",
            "Реалізує зв'язок багато-до-багатьох між користувачами та збереженими DJ.",
        ],
        [
            "Відгук (`reviews`)",
            "`id`, `booking_id`, `reviewer_id`, `reviewee_id`, `rating`, `comment`, `created_at`",
            "Асоціативна / оціночна V2",
            "Дає змогу залишати оцінку після завершеного бронювання.",
        ],
        [
            "Платіж (`payments`)",
            "`id`, `booking_id`, `payer_id`, `receiver_id`, `amount`, `currency`, `status`, `provider`",
            "Транзакційна V3",
            "Майбутня основа для escrow-платежів і монетизації бронювань.",
        ],
    ]
    return make_table(rows, styles, [42 * mm, 65 * mm, 32 * mm, 42 * mm])


def relation_table(styles):
    rows = [
        ["Зв'язок", "Тип", "Кардинальність", "Пояснення"],
        ["`profiles` - `dj_profiles`", "Ідентифікаційний рольовий", "`1 : 0..1`", "Користувач може мати один DJ-профіль, але не кожен користувач є DJ."],
        ["`profiles` - `organizer_profiles`", "Ідентифікаційний рольовий", "`1 : 0..1`", "Користувач може мати один профіль організатора."],
        ["`profiles` - `venue_profiles`", "Ідентифікаційний рольовий", "`1 : 0..1`", "Користувач із роллю venue може мати один профіль клубу."],
        ["`dj_profiles` - `works`", "Власницький", "`1 : 0..N`", "Один DJ може завантажити багато треків; кожен трек належить одному DJ."],
        ["`profiles` - `bookings`", "Транзакційний", "`1 : 0..N`", "Один організатор може створити багато заявок на бронювання."],
        ["`dj_profiles` - `bookings`", "Транзакційний", "`1 : 0..N`", "Один DJ може отримати багато заявок від різних організаторів."],
        ["`bookings` - `booking_messages`", "Залежний", "`1 : 0..N`", "Одна заявка може містити багато повідомлень переписки."],
        ["`profiles` - `booking_messages`", "Авторський", "`1 : 0..N`", "Один користувач може надіслати багато повідомлень."],
        ["`profiles` - `events`", "Організаційний", "`1 : 0..N`", "Один організатор або venue може створити багато подій."],
        ["`works` - `track_plays`", "Аналітичний", "`1 : 0..N`", "Один трек може мати багато прослуховувань."],
        ["`profiles` - `favorites` - `dj_profiles`", "Асоціативний M:N", "`M : N` через `favorites`", "Користувач може зберегти багато DJ, а DJ може бути збережений багатьма користувачами."],
        ["`bookings` - `payments`", "Фінансовий V3", "`1 : 0..N`", "Одна заявка може мати один або кілька платіжних записів."],
    ]
    return make_table(rows, styles, [50 * mm, 42 * mm, 34 * mm, 55 * mm])


def make_table(rows, styles, col_widths):
    prepared = []
    for index, row in enumerate(rows):
        style = styles["TableHead"] if index == 0 else styles["TableCell"]
        prepared.append([p(str(cell).replace("`", ""), style) for cell in row])
    table = Table(prepared, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.black),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#777777")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
            ]
        )
    )
    return table


def bullet_list(items, styles):
    story = []
    for item in items:
        story.append(p(f"• {item}", styles["BodyRoom"]))
    return story


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
        title="Логічна модель даних ROOM_9",
        author="ROOM_9",
    )

    portrait_frame = Frame(doc.leftMargin, doc.bottomMargin + 6 * mm, doc.width, doc.height - 4 * mm, id="portrait")
    landscape_size = landscape(A4)
    landscape_frame = Frame(12 * mm, 14 * mm, landscape_size[0] - 24 * mm, landscape_size[1] - 24 * mm, id="landscape")
    doc.addPageTemplates(
        [
            PageTemplate(id="portrait", frames=[portrait_frame], pagesize=A4, onPage=page_decorator),
            PageTemplate(id="landscape", frames=[landscape_frame], pagesize=landscape_size, onPage=page_decorator),
        ]
    )

    story = []
    story.append(Spacer(1, 10 * mm))
    story.append(p("ЗВІТ", styles["DocTitle"]))
    story.append(p("Логічна модель даних інформаційної системи ROOM_9", styles["DocTitle"]))
    story.append(
        p(
            "Тема: музична платформа з можливістю прослуховування треків, перегляду DJ-профілів, організації подій та бронювання діджеїв.",
            styles["DocSubtitle"],
        )
    )
    story.append(Spacer(1, 6 * mm))
    story.append(p("1. Предметна область", styles["H1Room"]))
    story.append(
        p(
            "ROOM_9 - це веб-платформа для музичного прослуховування та бронювання діджеїв. "
            "Система автоматизує робочі процеси діджеїв, організаторів подій, клубів/venue та слухачів. "
            "У межах MVP основний бізнес-процес виглядає так: DJ створює профіль і завантажує треки; "
            "організатор знаходить артиста, переглядає його музику та надсилає заявку на бронювання; "
            "після цього сторони можуть вести переписку, змінювати статус заявки та аналізувати активність.",
            styles["BodyRoom"],
        )
    )
    story.append(
        p(
            "Логічна модель побудована на основі реальної структури бази даних Supabase, яка використовується у проєкті ROOM_9.",
            styles["BodyRoom"],
        )
    )

    story.append(p("2. Сутності, атрибути та типи сутностей", styles["H1Room"]))
    story.append(entity_table(styles))

    story.append(PageBreak())
    story.append(p("3. Типи зв'язків між сутностями", styles["H1Room"]))
    story.append(relation_table(styles))

    story.append(p("4. Пояснення написів біля зв'язків", styles["H1Room"]))
    story.extend(
        bullet_list(
            [
                "<b>owns role profile</b> - базовий користувач володіє рольовим профілем DJ, організатора або venue.",
                "<b>uploads</b> - DJ завантажує музичні роботи або треки.",
                "<b>creates</b> - організатор створює заявку, подію або стрім.",
                "<b>receives</b> - DJ отримує заявки на бронювання.",
                "<b>contains</b> - заявка містить повідомлення переписки.",
                "<b>sends</b> - користувач надсилає повідомлення.",
                "<b>is viewed through</b> - DJ-профіль отримує перегляди.",
                "<b>is played through</b> - трек отримує прослуховування.",
                "<b>saves</b> - користувач додає DJ до обраного.",
                "<b>generates</b> - заявка може створити відгук або майбутній платіжний запис.",
            ],
            styles,
        )
    )
    story.append(p("Позначення кардинальностей:", styles["H2Room"]))
    story.extend(
        bullet_list(
            [
                "<b>1</b> - рівно один об'єкт.",
                "<b>0..1</b> - об'єкт може бути відсутнім або існувати в одному екземплярі.",
                "<b>0..N</b> - пов'язаних об'єктів може бути нуль, один або багато.",
                "<b>M:N</b> - зв'язок багато-до-багатьох, який у реляційній базі даних реалізується через проміжну таблицю.",
            ],
            styles,
        )
    )

    story.append(NextPageTemplate("landscape"))
    story.append(PageBreak())
    story.append(p("5. Логічна ER-діаграма інформаційної бази ROOM_9", styles["H1Room"]))
    story.append(
        p(
            "На діаграмі показано основні сутності системи, їхні первинні та зовнішні ключі, а також бізнес-зв'язки між ними.",
            styles["BodyRoom"],
        )
    )
    story.append(ERDiagram(styles))

    story.append(NextPageTemplate("portrait"))
    story.append(PageBreak())
    story.append(p("6. Висновок", styles["H1Room"]))
    story.append(
        p(
            "Логічна модель ROOM_9 побудована навколо базової сутності profiles, яка визначає користувача та його роль у системі. "
            "Рольові сутності dj_profiles, organizer_profiles і venue_profiles розширюють базовий профіль спеціалізованими даними. "
            "Основною бізнес-транзакцією є bookings, що поєднує організатора та DJ-профіль і фіксує заявку на виступ.",
            styles["BodyRoom"],
        )
    )
    story.append(
        p(
            "Музичний модуль представлено сутністю works, а взаємодію користувачів із музикою - сутностями track_plays, favorites і reviews. "
            "Для розвитку системи передбачено події, live streams, аналітику, сповіщення, календар доступності та майбутні платежі. "
            "Така структура підтримує поточний MVP і дозволяє масштабувати ROOM_9 до повноцінної музичної booking-платформи.",
            styles["BodyRoom"],
        )
    )

    doc.build(story)


if __name__ == "__main__":
    build_pdf()
    print(OUT)
