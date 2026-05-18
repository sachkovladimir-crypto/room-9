from __future__ import annotations

from pathlib import Path
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
OUT = ROOT / "docs" / "lab6-deployment-diagram-room9.pdf"

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
            fontSize=9.4,
            leading=13.2,
            alignment=TA_LEFT,
            spaceAfter=5,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SmallRoom",
            fontName="Room9Regular",
            fontSize=7.4,
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
            fontSize=7,
            leading=9.2,
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
    canvas.drawString(doc.leftMargin, 10 * mm, "ROOM_9 | Лабораторна робота №6")
    canvas.drawRightString(width - doc.rightMargin, 10 * mm, f"Сторінка {doc.page}")
    canvas.restoreState()


def bullets(items, styles):
    return [p(f"• {item}", styles["BodyRoom"]) for item in items]


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


class DeploymentDiagram(Flowable):
    def __init__(self):
        super().__init__()
        self.diagram_width = 790
        self.diagram_height = 470
        self.scale_factor = 1

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
        c.drawString(16, self.diagram_height - 24, "ДІАГРАМА РОЗГОРТАННЯ ROOM_9")
        c.setFont("Room9Regular", 7.2)
        c.setFillColor(colors.HexColor("#444444"))
        c.drawString(16, self.diagram_height - 38, "UML Deployment: вузли, середовища виконання, артефакти, протоколи та розміщення системи.")

        self._node(c, 30, 300, 170, 110, "<<device>>\nПристрій користувача", [
            "Browser: Chrome/Safari",
            "HTML/CSS/JS runtime",
            "ROOM_9 UI",
            "Global Audio Player",
        ])
        self._node(c, 250, 295, 210, 125, "<<cloud node>>\nVercel Hosting", [
            "<<executionEnvironment>> Node.js / Edge",
            "<<artifact>> Next.js App Router build",
            "<<artifact>> React client bundle",
            "ENV: NEXT_PUBLIC_SUPABASE_URL",
            "ENV: NEXT_PUBLIC_SUPABASE_ANON_KEY",
        ])
        self._node(c, 525, 275, 220, 160, "<<cloud node>>\nSupabase Project", [
            "<<executionEnvironment>> Supabase API",
            "Auth service",
            "PostgREST / Realtime",
            "Storage API",
            "RLS policy enforcement",
        ])
        self._node(c, 525, 145, 220, 95, "<<database node>>\nPostgreSQL", [
            "profiles, dj_profiles",
            "bookings, booking_messages",
            "works, events, live_streams",
            "indexes, triggers, RLS",
        ])
        self._node(c, 285, 105, 190, 105, "<<storage node>>\nSupabase Storage", [
            "bucket: tracks",
            "bucket: images",
            "audio/mp3/wav files",
            "covers, avatars, posters",
        ])
        self._node(c, 35, 110, 170, 92, "<<external actor>>\nDJ / Organizer / Listener", [
            "register / login",
            "browse DJs",
            "send booking request",
            "play tracks",
        ])
        self._node(c, 250, 20, 210, 55, "<<repository>>\nGitHub / Local source", [
            "Next.js source code",
            "supabase/schema.sql",
            "Vercel deployment source",
        ])
        self._node(c, 535, 20, 200, 62, "<<future external service>>\nPayment Provider", [
            "Stripe / escrow flow",
            "payments table",
            "V3 marketplace scope",
        ], dashed=True)

        self._line(c, (200, 355), (250, 355), "HTTPS: pages/assets")
        self._line(c, (460, 355), (525, 355), "HTTPS: API calls")
        self._line(c, (635, 275), (635, 240), "SQL / policies")
        self._line(c, (525, 325), (475, 170), "Storage API")
        self._line(c, (120, 300), (120, 202), "user actions")
        self._line(c, (355, 75), (355, 105), "deploy artifacts")
        self._line(c, (635, 145), (635, 82), "future payment status")
        self._line(c, (200, 330), (525, 205), "direct Supabase JS HTTPS", dashed=True)

        self._legend(c)
        c.restoreState()

    def _node(self, c, x, y, w, h, title, lines, dashed=False):
        c.saveState()
        c.setStrokeColor(colors.black)
        c.setLineWidth(0.9)
        if dashed:
            c.setDash(4, 3)
        c.setFillColor(colors.white)
        c.rect(x, y, w, h, stroke=1, fill=1)
        c.setDash()
        c.setFillColor(colors.black)
        c.rect(x, y + h - 28, w, 28, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont("Room9Bold", 7.2)
        title_lines = title.split("\n")
        c.drawString(x + 7, y + h - 11, title_lines[0])
        c.drawString(x + 7, y + h - 22, title_lines[1])
        c.setFillColor(colors.black)
        c.setFont("Room9Regular", 6.4)
        for idx, line in enumerate(lines):
            c.drawString(x + 8, y + h - 42 - idx * 10, line)
        c.restoreState()

    def _line(self, c, start, end, label, dashed=False):
        x1, y1 = start
        x2, y2 = end
        c.saveState()
        c.setStrokeColor(colors.HexColor("#444444"))
        c.setLineWidth(0.8)
        if dashed:
            c.setDash(4, 3)
        c.line(x1, y1, x2, y2)
        c.setDash()
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        c.setFillColor(colors.white)
        c.rect(mx - 44, my - 6, 88, 12, stroke=0, fill=1)
        c.setFillColor(colors.black)
        c.setFont("Room9Regular", 6)
        c.drawCentredString(mx, my - 2, label)
        c.restoreState()

    def _legend(self, c):
        c.setFont("Room9Bold", 7)
        c.setFillColor(colors.black)
        c.drawString(24, 52, "Позначення:")
        c.setFont("Room9Regular", 6.2)
        c.drawString(24, 40, "<<device>> фізичний пристрій; <<cloud node>> хмарний вузол; <<artifact>> розгорнутий файл/збірка.")
        c.drawString(24, 29, "Суцільні лінії - робочі зв'язки MVP; пунктир - прямі клієнтські/API або майбутні інтеграції.")


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
        title="Лабораторна робота №6 - ROOM_9",
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
    story.append(p("ЛАБОРАТОРНА РОБОТА №6", styles["TitleRoom"]))
    story.append(p("Тема: Діаграми розгортання", styles["SubtitleRoom"]))
    story.append(
        p(
            "<b>Мета:</b> формування навиків побудови діаграми розгортання та моделювання архітектури системи ROOM_9 на рівні вузлів, середовищ виконання, артефактів і каналів взаємодії.",
            styles["BodyRoom"],
        )
    )

    story.append(p("1. Опис моделі, зображеної на рис. 2 у методичних вказівках", styles["H1Room"]))
    story.append(
        p(
            "У методичних вказівках рис. 2 демонструє типову UML-діаграму розгортання. Така модель показує, на яких фізичних або віртуальних вузлах розміщуються програмні артефакти системи, які середовища виконання використовуються та якими каналами взаємодіють частини системи.",
            styles["BodyRoom"],
        )
    )
    story.extend(
        bullets(
            [
                "<b>Вузол</b> позначає обчислювальний ресурс: комп'ютер користувача, сервер застосунку, сервер бази даних або хмарний сервіс.",
                "<b>Середовище виконання</b> описує платформу, у якій запускається програмний код: браузер, Node.js runtime, database engine, storage API.",
                "<b>Артефакт</b> відображає фізичний результат розробки: frontend bundle, backend build, SQL schema, конфігураційний файл або контейнер.",
                "<b>Зв'язки між вузлами</b> показують протоколи обміну даними: HTTPS, REST API, SQL-з'єднання, WebSocket/Realtime.",
                "<b>Deployment relationship</b> означає, що певний артефакт розміщується на конкретному вузлі або в конкретному середовищі виконання.",
            ],
            styles,
        )
    )
    story.append(
        p(
            "Отже, головний зміст моделі на рис. 2 полягає не в описі внутрішньої логіки класів, а в демонстрації того, як готові програмні частини системи фізично розгортаються на інфраструктурі та взаємодіють у runtime.",
            styles["BodyRoom"],
        )
    )

    story.append(p("2. Архітектура системи ROOM_9 для діаграми розгортання", styles["H1Room"]))
    story.append(
        p(
            "ROOM_9 реалізована як вебсистема на основі Next.js App Router, TypeScript, Tailwind CSS і Supabase. На етапі MVP система розгортається як модульний моноліт: frontend і сторінки застосунку збираються в Next.js build та публікуються на Vercel, а авторизація, база даних, Row Level Security і файлове сховище працюють у Supabase.",
            styles["BodyRoom"],
        )
    )
    story.extend(
        bullets(
            [
                "<b>Пристрій користувача:</b> браузер відкриває ROOM_9, виконує React-код, відображає dashboard, explore, DJ profile, booking flow і глобальний аудіоплеєр.",
                "<b>Vercel Hosting:</b> приймає HTTP/HTTPS-запити, віддає Next.js-сторінки, статичні assets і клієнтський JavaScript bundle.",
                "<b>Supabase Auth:</b> забезпечує реєстрацію, login/logout і створення запису в profiles через database trigger.",
                "<b>Supabase PostgreSQL:</b> зберігає профілі, бронювання, повідомлення, треки, події, стріми, перегляди та прослуховування.",
                "<b>Supabase Storage:</b> зберігає аудіофайли у bucket tracks і зображення/обкладинки у bucket images.",
                "<b>Payment Provider:</b> у V3 може бути підключений як окремий зовнішній сервіс для escrow-платежів.",
            ],
            styles,
        )
    )

    story.append(NextPageTemplate("landscape"))
    story.append(PageBreak())
    story.append(p("3. Діаграма розгортання системи ROOM_9", styles["H1Room"]))
    story.append(
        p(
            "Діаграма показує runtime-розгортання ROOM_9: користувацький браузер, Vercel deployment, Supabase-проєкт, PostgreSQL, Storage та майбутній платіжний сервіс.",
            styles["BodyRoom"],
        )
    )
    story.append(DeploymentDiagram())

    story.append(NextPageTemplate("portrait"))
    story.append(PageBreak())
    story.append(p("4. Що спільного між класами, компонентами, артефактами та вузлами?", styles["H1Room"]))
    story.append(
        p(
            "Класи, компоненти, артефакти та вузли є елементами UML-моделювання. Вони використовуються для опису системи на різних рівнях абстракції, можуть мати назву, властивості, зв'язки з іншими елементами та входити до складу більшої моделі. Спільним є те, що всі вони допомагають формалізувати структуру програмної системи та зробити її зрозумілою для розробників, аналітиків і замовників.",
            styles["BodyRoom"],
        )
    )
    rows = [
        ["Елемент UML", "Що описує", "Рівень моделі", "Приклад для ROOM_9"],
        ["Клас", "Логічний шаблон об'єктів: атрибути, методи, поведінка.", "Проєктування коду / домену", "UserProfile, Booking, Track, Event."],
        ["Компонент", "Модуль системи з чіткою відповідальністю та інтерфейсами.", "Архітектура програмного забезпечення", "Auth module, Dashboard, Global Audio Player, Booking Chat."],
        ["Артефакт", "Фізичний файл або результат збірки, який можна розгорнути.", "Фізична реалізація", "Next.js build, React bundle, supabase/schema.sql, uploaded mp3 file."],
        ["Вузол", "Фізичний або віртуальний ресурс, де виконується або зберігається система.", "Інфраструктура / deployment", "Browser device, Vercel Hosting, Supabase PostgreSQL, Supabase Storage."],
    ]
    story.append(make_table(rows, styles, [28 * mm, 60 * mm, 44 * mm, 49 * mm]))

    story.append(p("5. У чому полягає різниця між ними?", styles["H1Room"]))
    story.extend(
        bullets(
            [
                "<b>Клас</b> описує логіку предметної області або програмного коду. Він не показує, де саме система буде запущена.",
                "<b>Компонент</b> групує класи та функції в більший модуль із конкретною відповідальністю, наприклад dashboard або booking-flow.",
                "<b>Артефакт</b> є фізичним результатом розробки: файл, збірка, скрипт бази даних, пакет або медіафайл.",
                "<b>Вузол</b> є середовищем, де артефакт розгортається або виконується: сервер, база даних, браузер, хмарна платформа.",
                "У deployment-логіці ланцюжок можна описати так: класи формують компоненти, компоненти реалізуються артефактами, а артефакти розміщуються на вузлах.",
            ],
            styles,
        )
    )

    story.append(p("6. Висновок", styles["H1Room"]))
    story.append(
        p(
            "У лабораторній роботі було розглянуто призначення UML-діаграми розгортання та побудовано deployment-модель для системи ROOM_9. Діаграма відображає основні вузли системи: браузер користувача, Vercel Hosting, Supabase Project, PostgreSQL, Supabase Storage і майбутній платіжний сервіс.",
            styles["BodyRoom"],
        )
    )
    story.append(
        p(
            "Побудована модель показує, що ROOM_9 на етапі MVP є хмарною вебсистемою з простим і зрозумілим розгортанням: frontend і application layer розміщуються на Vercel, а auth/database/storage layer реалізується Supabase. Така архітектура зручна для дипломного MVP, але водночас дозволяє масштабувати систему у V2/V3 через підключення окремих сервісів для платежів, стрімінгу, рекомендацій або аналітики.",
            styles["BodyRoom"],
        )
    )

    doc.build(story)


if __name__ == "__main__":
    build_pdf()
    print(OUT)
