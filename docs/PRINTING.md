# Printing the vehicle card / طباعة بطاقة المركبة

Printer: **Evolis Zenius Classic**, single-sided, 300 dpi, CR80 card
(85.60 × 53.98 mm), landscape. Ribbon: colour (YMCKO) or monochrome (black).

> Everything below about the printer driver and the print dialog is written
> from the printer's documented behaviour and has **not** been verified on the
> physical printer. Use the *printer setup card* (below) to verify, and correct
> this file with what you see.

---

## العربية

### قبل أول طباعة (مرة واحدة لكل جهاز)

1. في صفحة إصدار البطاقة اضغط **«بطاقة إعداد الطابعة»** واطبعها على بطاقة بيضاء.
2. افحص النتيجة:
   - الخطوط 1 و2 و3 مم واضحة كلها، ولا يقص الحدّ أي سطر.
   - الصليب في المنتصف، وكل سطر 4 جوانب البطاقة ظاهر (لا يوجد هامش مقصوص).
   - سلّم الخطوط: يُقرأ حتى 6 نقاط بالعربية واللاتينية.
   - رموز QR الثلاثة (22 و14 و9 مم) كلها تُقرأ بكاميرا الهاتف. إن لم يُقرأ الأصغر فالمشكلة في دقة الطابعة أو الشريط، والبطاقة الفعلية تستعمل رمزًا بحجم 29 مم.
3. إن كانت الحواف مقصوصة أو الطباعة مصغّرة، راجع الإعدادات أدناه.

### إعدادات تعريف الطابعة (Evolis Print Center / Driver)

| الإعداد | القيمة |
|---|---|
| حجم البطاقة / Card format | CR80 (85.60 × 53.98) |
| الاتجاه / Orientation | أفقي (Landscape) |
| الوجه / Sides | وجه واحد (Single side) |
| الدقة / Resolution | 300 dpi (الافتراضية) |
| الشريط / Ribbon | YMCKO للألوان، أو أحادي (Black) لشريط أسود |
| الهوامش / Margins | صفر، **طباعة حتى الحافة** (Edge to edge / Full bleed) إن توفّر |
| التحجيم / Scaling | 100% بلا تحجيم، وبلا «ملاءمة للصفحة» |
| ألوان الأسود | اطبع الأسود بالشريط K (لا تُركّبه من CMY) كي يبقى رمز QR حادًا |

### نافذة الطباعة في Chrome

يفتح البرنامج نافذة الطباعة بعد الضغط على «طباعة». اختر:

- **الوجهة:** طابعة البطاقات (Evolis Zenius).
- **حجم الورق:** CR80 (أو المخصّص 85.6 × 53.98 مم).
- **الاتجاه:** أفقي.
- **الهوامش:** بلا.
- **المقياس:** 100% (ليس «ملاءمة»).
- **الخيارات الإضافية:** فعّل «رسومات الخلفية» (Background graphics).
- **الصفحات:** صفحة واحدة. إن ظهرت صفحتان فأبلغ مسؤول المنظومة.

لتجنب النافذة في المكتب شغّل Chrome بالخيار `--kiosk-printing` فتُطبع مباشرةً على الطابعة الافتراضية.

### شريط أحادي اللون

فعّل خانة **«شريط أحادي اللون — اطبع بالأسود فقط»** في صفحة الإصدار. تُطبع البطاقة نفسها بالأسود فقط: بلا تعبئة ألوان، وكل شيء أسود على أبيض، ورمز QR أسود نقي.

### استكشاف الأخطاء

| العَرَض | السبب المحتمل | الحل |
|---|---|---|
| الطباعة مقصوصة من يمين أو أسفل | تحجيم أو هامش | المقياس 100%، الهوامش بلا، حجم CR80 |
| تظهر صفحتان / بطاقة بيضاء ثانية | حجم ورق مختلف عن CR80 | اختر CR80 أفقي |
| الطباعة مقلوبة أو بالطول | اتجاه عمودي | اتجاه أفقي |
| رمز QR لا يُقرأ | رأس طباعة متّسخ، أو رمز مطبوع بألوان مركّبة | نظّف الرأس، اطبع بطاقة الإعداد، فعّل الأسود الحقيقي |
| الخط العربي متقطّع الحروف | طابعة لا تدعم النص المتّجهي | حدّث تعريف الطابعة؛ أبلغ المسؤول |
| الألوان باهتة أو مائلة | الشريط قارب على النفاد | بدّل الشريط |
| بطاقة بيضاء تخرج فارغة | بطاقة مقلوبة في الحاضن | ضع الوجه المطبوع نحو الأعلى |

---

## English

### Before the first print (once per device)

1. On the card issue screen press **«بطاقة إعداد الطابعة»** (printer setup card) and print it on a blank card.
2. Check the result:
   - The 1, 2 and 3 mm lines are all visible and none is clipped at an edge.
   - The centre cross is centred and all four card edges show a line (no margin is cropped).
   - The font ladder reads down to 6 pt in Arabic and Latin.
   - All three QR codes (22, 14 and 9 mm) scan with a phone camera. The real card uses a ~29 mm code; if the smallest does not scan, that points at print head or ribbon quality.
3. If edges are cropped or the print is shrunk, review the settings below.

### Evolis driver settings (Evolis Print Center)

| Setting | Value |
|---|---|
| Card format | CR80 (85.60 × 53.98 mm) |
| Orientation | Landscape |
| Sides | Single side |
| Resolution | 300 dpi (default) |
| Ribbon | YMCKO for colour, or monochrome (black) for a black ribbon |
| Margins | Zero; edge-to-edge / full bleed if offered |
| Scaling | 100%, no "fit to page" |
| Black | Print black with the K panel (not composed from CMY) so the QR code stays sharp |

### Chrome print dialog

After «طباعة» the app opens the print dialog. Choose:

- **Destination:** the card printer (Evolis Zenius).
- **Paper size:** CR80 (or custom 85.6 × 53.98 mm).
- **Layout:** Landscape.
- **Margins:** None.
- **Scale:** 100% (not "fit").
- **More settings:** enable *Background graphics*.
- **Pages:** one. If two appear, tell the system administrator.

To skip the dialog at an office, start Chrome with `--kiosk-printing`; it then prints straight to the default printer.

### Monochrome ribbon

Tick **«شريط أحادي اللون — اطبع بالأسود فقط»** on the issue screen. The same card prints in black only: no colour fills, everything pure black on white, QR code pure black.

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Right or bottom edge cut off | scaling or margins | Scale 100%, margins none, CR80 |
| Two pages / a blank second card | paper size is not CR80 | pick CR80 landscape |
| Print is rotated or portrait | orientation | landscape |
| QR will not scan | dirty head, or QR composed from CMY colours | clean the head, print the setup card, use true black |
| Arabic letters look broken | driver rasterising text badly | update the driver; tell the administrator |
| Colours faint or off | ribbon nearly empty | replace the ribbon |
| Blank card comes out | card loaded upside down | printable side up |

---

## What the app guarantees (so you do not have to check it)

- The PDF page is exactly 85.60 × 53.98 mm (tested to 0.01 mm), one page, one face.
- Text and QR are vector. Fonts (Cairo) are embedded.
- Everything sits at least 2 mm inside the edge; no line is thinner than 0.25 mm; text is 7 pt regular / 6 pt bold or larger.
- The QR is pure black on white with a 4-module quiet zone, about 29 mm.
- The card shows: plate (largest), make and model, colour, year, fuel, chassis number, booklet number, card number and issue date, and «مديرية أمن ‹البلدية›». It shows no owner name and no national ID.
