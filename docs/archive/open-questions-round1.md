# Open Questions for the Client

Status: ⏳ = waiting on the client. When the client answers, write the answer inline and change the status to ✅.
Persian versions (ready to forward) are at the bottom.

## A. Contradictions between the documents

1. ⏳ **Sitemap: 7 pages or 10?** The Persian docs list 7 pages. The EN doc and the summary draft list 10
   (they add FAQ, About, Contact). Is the 10-page list final?
2. ⏳ **Marketplace vs. auctions.** The sitemap says «مزایدات — اتصال به مزایدات ایران ضایعات»
   (a connection to an external Iran Zayeat auctions service). But the «مزایدات» page in the design is a full
   buy/sell marketplace with our own listings plus an auction section. Which one is it?
   - Our own marketplace + our own auction system, or
   - Integration with Iran Zayeat (API? embedded? just links?), or
   - Both?
   Also: is there still a separate «خرید و فروش» page? The home page service card and the hero button «ورود به بازار خرید و فروش» still point to one.
3. ⏳ **Home page: "latest auctions" or "latest listings"?** The summary sitemap says the home page shows «آخرین مزایدات»,
   and a note says the section after live prices is auctions, blurred, and open to Silver **and Gold**. The design shows
   «آخرین آگهی‌های بازار» (listings) with only seller info locked (Silver). Which is correct?
4. ⏳ **Auction access.** The comparison table says Silver = view only, Gold = full participation. The summary note says auctions are open to Silver and Gold. Please confirm.
5. 🟡 *(The new FAQ.docx says 3 tiers, no Enterprise. It conflicts with the design, see #44.)* **3 or 4 tiers?** The sitemap says «۳ سطح اشتراک». The plans page shows 4 (including Enterprise). The home banner shows 3.
6. ⏳ **What is the purple «حرفه‌ای / Pro» tier?** The News & Analysis service card and the «اشتراک حرفه‌ای» banner use it,
   but no plan is called Pro. Is it the same as Gold?
7. ⏳ **"News & Analysis" renamed to "Forecast & Analysis" (پیش‌بینی و تحلیل).** Is this only a rename, or is there new
   forecasting functionality (for example AI price prediction)? The summary draft left this section empty.
8. ✅ *(live site: «بازار آنلاین — به‌روزرسانی لحظه‌ای»; the EN doc's «بازار زنده» is a translation slip)* **Hero badge text.** «بازار زنده — به‌روزرسانی لحظه‌ای» (EN doc) vs «بازار آنلاین — به‌روزرسانی لحظه‌ای» (Persian docs).
9. ⏳ **Header menu items.** The design header has 6 items. The EN doc lists 10 (including FAQ, About, Contact) in the header.
   Where do اشتراک‌ها, FAQ, About, and Contact go? Footer only? The EN doc also says "4 subscription levels" in one place and "3" in another.
10. ⏳ **Sticky bottom pill nav** (خانه، اشتراک، قیمت‌ها، …، تماس). Is this part of the real site, or just the Figma Make preview's
    page switcher? It sits on top of the content in every screenshot.
11. ⏳ **Sell tag color** in the marketplace: red (home) or pink (marketplace doc)?

## B. Missing content or information

12. ✅ *(FAQ.docx now provides 50 Q&As in 10 categories, so it replaces the prototype FAQ.)* 🟡 *(Earlier note: the live site has answers for all 10 FAQ questions + 4 subscription questions, saved in `docs/content/faq.md`; the About and Contact copy is also there. Still open: 6 FAQ tabs (پرداخت, خرید و فروش, مزایدات, امنیت, ماشین حساب, اخبار و تحلیل) have no questions. Is the prototype copy final?)* **FAQ answers.** The FAQ page shows 10 questions (by category), and the subscription page shows 4 more. We need all the answer text.
    The sitemap says «متن نوشته شده» for FAQ/About/Contact. Where is that text? Is the copy in the Figma design final?
13. ⏳ **Contact page details.** Are the phone (021-…), address, email (support@alanfelez.ir), and hours real, or placeholders?
    Where should contact form submissions go (email, admin panel, ticketing)? What options go in the «موضوع» dropdown?
14. ⏳ **About page copy and stats** (200+, 28,000+ trades, 4,500+ listings, 12,000+ users). Real numbers or placeholders? Static, or pulled live from the DB?
15. ⏳ **Footer date and copyright** show 1403. Should the "updated" date be dynamic (latest price update) and the year current (1405)?
16. ✅ *(font = **Vazirmatn**, free OFL license. Still worth asking for the Figma Make source/export.)* **Exact Persian font** (name and license). Can the client give us the Figma file or Figma Make source/export?
    It would give us exact fonts, spacing, and assets, and possibly reusable code.
17. ⏳ **Logo and brand assets** in vector format (SVG). Icon set used for the service cards.

## C. Business logic

18. 🟡 *(The live prototype uses: net weight = weight × (1−impurity%); value = net × price × (1−deductions%) − shipping. So shipping is **subtracted**, while the doc says «+ shipping». Ask him to confirm the prototype's version.)* **Calculator formula.** Are deductions % and impurity % applied to **weight** (the net weight box suggests this) or to **value**?
    Is shipping **added** (buyer view) or **subtracted** (seller view)? The spec says "+ shipping". Please give one worked example.
19. ⏳ **Pricing.** Monthly prices are given. What are the quarterly price and discount? Yearly = 20% off monthly × 12?
20. ⏳ **"Limited" for Free.** How many listings can a Free user see? Which live prices? What does the limited calculator allow?
21. ✅ *(The FAQ answer says no: subscription only, no per-listing payment.)* **FAQ says «آیا می‌توانم فقط اطلاعات یک آگهی را خریداری کنم؟»** Is there pay-per-listing (a one-off contact-info purchase)
    alongside subscriptions? What does it cost?
22. 🟡 *(FAQ: dedicated spaces per niche, e.g. «ضایعات آلومینیوم اصفهان», where members share rates and opportunities; available from Silver. Still open: is it built in-platform like a chat/forum, or external groups? Who creates them?)* **Trading groups (گروه‌های معاملاتی)** appear in Silver and in the FAQ. What are they? A chat? Links to Telegram/WhatsApp groups?
23. ⏳ **Market intelligence / Matching**, **price alerts** (channel: SMS, email, push?), **featured listings**, **featured business profile**.
    We need the expected behavior for each.
24. ⏳ **Listing moderation.** Are listings published immediately or after admin approval? Do they expire? How does reporting (گزارش تخلف) work?
25. ⏳ **Verification («تأیید شده ✓»).** Manual admin review or automated? What documents are required?
26. 🟡 *(Prototype: refund within the first 7 days if unused; upgrades any time with proration; methods = online gateway, Shetab card, bank transfer. Still open: downgrades, and what "unused" means.)* **Refund policy** and plan change mid-cycle (proration?).

## D. Technical and integrations

27. ⏳ **Price data sources.** How do we get data from بورس کالا, تالار آهن, بازار آزاد, and LME: official API, a paid data provider,
    scraping, or manual entry by staff? How often should prices update? Who owns the data agreements?
28. 🟡 *(FAQ.docx mentions a password plus «فراموشی رمز عبور». Still open: is phone OTP also used? Which SMS provider?)* **Auth.** Phone + OTP, email, or both? Which SMS provider (Kavenegar, Ghasedak, …)?
29. ⏳ **Payment gateway** (Zarinpal, IDPay, a bank gateway …)? Does the client already have a merchant account?
30. ⏳ **Admin panel scope.** Beyond the news CMS: managing prices, users, listings, auctions, subscriptions, and FAQ. Is a full admin panel in scope?
31. ⏳ **Content team.** Who writes the news and expert analysis? Non-technical staff (so they need a CMS)?
32. ⏳ **Mobile.** Will a mobile design be provided, or do we adapt the desktop design ourselves?
33. ⏳ **Hosting and domain.** Iranian hosting (needed for local gateways and SMS)? Is alanfelez.ir already owned?
34. ⏳ **Languages.** Persian only, or English later too?
35. ⏳ **Enterprise API.** What data does it expose, and what are the rate limits and docs expectations?


## E. Found while checking the live site (2026-09-27)

36. ⏳ **Which revision is final?** The live link is an **older** version than the screenshots in «پروپوزال خلاصه».
    Live nav: صفحه اصلی · قیمت فلزات · نمودار قیمت · ماشین حساب · اخبار و تحلیل · خرید و فروش · مزایدات, and the «مزایدات» link just goes to home.
    Screenshots nav: … پیش‌بینی و تحلیل · مزایدات · ماشین حساب, with no «خرید و فروش». Can he publish the latest version to the link?
37. ⏳ **Contact hours conflict.** The contact card says «شنبه تا پنج‌شنبه ۹–۱۸». The hours box says «۸ صبح — ۶ عصر شنبه تا چهارشنبه، ۸ صبح — ۱ ظهر پنج‌شنبه».
    Also: are the phone «۰۲۱-۴۸۵۲۳-۴۵۶» and address «تهران، خیابان ولیعصر، پلاک ۱۲۰۰، طبقه ۵» real? (Relates to #13.)
38. ⏳ **Live chat «چت زنده — ۲۴ ساعته در روزهای کاری».** Third-party (Goftino, Raychat, Crisp…) or built in? Who staffs it?
39. ⏳ **Screens that aren't designed:** login/sign-up (the buttons do nothing), user dashboard («اشتراک من» in the FAQ), listing detail page,
    post-listing form, report-listing form, checkout/payment, upgrade flow (the «ارتقا» buttons do nothing), notifications, privacy (حریم خصوصی)
    and terms (شرایط استفاده) pages linked in the footer. Will he design these, or do we design them in the same style? Who writes the privacy/terms text?
40. ⏳ **Extra data sources.** The About page lists Shanghai Metal Market and the Central Bank (بانک مرکزی) in addition to IME, Iron Market, Free Market, and LME. Are these in scope?
41. ⏳ **Chart unit conversion.** The chart unit dropdown offers تومان/ریال and کیلوگرم/تن. Where does the ton data come from? (Just ×1000?)
42. ⏳ **Icons.** The prototype uses emoji (💰📈🧮📰🛒🔨), but the doc says "flat icons". Keep emoji, or get a real icon set?


## F. Conflicts between the new content docs (FAQ / درباره ما / قوانین) and the design (2026-09-27)

43. ⏳ **Brand spelling.** The content docs write «الان‌فلز» and «الان فلز». The design and the older docs write «آلان‌فلز».
    Which is official? (It changes every page, the logo and SEO.)
44. ⏳ **Is the new scope final?** The content docs describe a different product from the Figma design:
    - **3 tiers**, no Enterprise (the design has 4).
    - **Buyers can't post buy requests.** Only load holders can post («اعلام بار»). The design has «+ ثبت درخواست خرید» and buy/sell tabs.
    - **«مزایدات» = «بورس کالا و حراج‌های روزانه»**, i.e. IME daily offerings/auction data. The design has a bidding system (minimum bid, deadline, bid count, «ارتقا برای شرکت»).
    - **Gold features differ.** The content docs put the calculator, SMS alerts, forecast scenarios and daily auction info in Gold, while the design has the calculator as Free/limited.
      Silver is described only as "broader price/chart/history access". There's nothing about seller contact info or posting listings.
    If the content docs are final, the design has to change: the Subscriptions page, the marketplace, the auctions, the Home service cards, and the comparison table.
    **We need a new, final tier/feature table.**
45. ⏳ **About page "values" section is a draft.** It's an acrostic on the letters ا-ل-ا-ن-ف-ل-ز, with 3–4 options per letter and one marked «(پیشنهاد شما)».
    He needs to pick one value per letter. Also, is the About page layout the prototype's (cards, "covered markets", services) or a new design for this text?
46. ⏳ **Legal contradiction in the Terms (§4).** It says «الان فلز تضمین میدهد درصورت اعلام بار با قیمت سایت، خریدار با همان قیمت را به اعلام کننده بار متصل کند»
    (a guarantee to find a buyer at the site price). But the closing warning and FAQ #26 say there's **no** guarantee a deal happens. Which applies?
    If the guarantee stays, what's the business process behind it (staff matching buyers, deadlines)? Recommend a legal review.
47. ⏳ **Terms placeholders.** The last-updated date, the official email and the phone are «[... درج شود]».
48. ⏳ **Privacy policy text** is referenced (Terms §20, FAQ #46) but hasn't been provided.
49. ⏳ **«مجوزها و اعتبار» page** (FAQ #47). Which licenses and seals (eNamad, Samandehi, …)? Do they already exist? Is there a design?
50. ⏳ **SMS service.** What does it cost (included in a tier or bought separately)? Can users choose a threshold for sharp price moves? Also email/push, or SMS only?
51. ⏳ **«اعلام بار» fields.** The FAQ lists product, specs, quantity/tonnage, quality/grade, loading location, delivery terms, proposed price and contact.
    The design card has only product, weight, city and price. Should we build the full form? Photos and analysis documents?
    Who reviews listings, and is there a review step before publishing (FAQ #25)?
52. ⏳ **IME / daily auction data.** Where does it come from, and what exactly is shown (offerings, volumes, clearing prices)? No design exists for it.
53. ⏳ **Domains.** Both Alanfelez.ir and Alanfelez.com. Which is primary, with the other redirecting to it?
54. ⏳ **Support ticketing.** FAQ #50 mentions tickets and a messenger. Do we build a ticket system? Which messenger (Bale, Eitaa, Telegram, WhatsApp)?
55. ⏳ **Calculator inputs.** FAQ #35 mentions a currency rate as an input. Should the calculator support USD-based prices (e.g. LME × rate)?

---

## نسخه فارسی (برای ارسال به کارفرما)

۱. نقشه سایت ۷ صفحه‌ای است یا ۱۰ صفحه‌ای (با سوالات متداول، درباره ما و تماس با ما)؟
۲. صفحه «مزایدات» در سایت‌مپ «اتصال به مزایدات ایران ضایعات» ذکر شده، اما در طرح یک بازار خرید و فروش کامل با آگهی و بخش مزایده داخلی است. کدام صحیح است؟ اگر اتصال به ایران ضایعات است، از چه طریقی (API، لینک، نمایش داخل سایت)؟ آیا صفحه «خرید و فروش» جداگانه هنوز وجود دارد؟
۳. در صفحه اصلی «آخرین مزایدات» (تار برای کاربران غیرمشترک) نمایش داده شود یا «آخرین آگهی‌های بازار» مطابق طرح؟
۴. مزایدات برای نقره‌ای فقط مشاهده و برای طلایی شرکت کامل است یا برای هر دو باز است؟
۵. اشتراک‌ها ۳ سطح هستند یا ۴ سطح (همراه با سازمانی)؟
۶. سطح «حرفه‌ای» (بنفش) کدام پلن است؟ همان طلایی است؟
۷. تغییر نام «اخبار و تحلیل» به «پیش‌بینی و تحلیل» فقط تغییر عنوان است یا قابلیت پیش‌بینی قیمت (مثلاً با هوش مصنوعی) هم اضافه می‌شود؟
۸. متن نشان هیرو: «بازار زنده» یا «بازار آنلاین»؟
۹. منوی هدر ۶ گزینه دارد. اشتراک‌ها، سوالات متداول، درباره ما و تماس با ما کجا قرار بگیرند؟
۱۰. نوار ناوبری شناور پایین صفحه (خانه، اشتراک، …، تماس) بخشی از سایت نهایی است یا فقط ناوبری پیش‌نمایش فیگما؟
۱۱. رنگ برچسب «فروش»: قرمز یا صورتی؟
۱۲. متن پاسخ تمام سوالات متداول (۱۰ سوال صفحه FAQ و ۴ سوال صفحه اشتراک). منظور از «متن نوشته شده» برای صفحات FAQ، درباره ما و تماس چیست؟ آیا متن موجود در طرح نهایی است؟
۱۳. اطلاعات صفحه تماس (تلفن، آدرس، ایمیل، ساعات کاری) واقعی هستند؟ پیام‌های فرم تماس به کجا ارسال شوند؟ گزینه‌های «موضوع» چیست؟
۱۴. آمارهای صفحه اصلی (۲۰۰+، ۲۸,۰۰۰+، ۴,۵۰۰+، ۱۲,۰۰۰+) واقعی هستند؟ ثابت باشند یا به‌صورت خودکار از داده‌های سایت محاسبه شوند؟
۱۵. تاریخ به‌روزرسانی و سال کپی‌رایت در فوتر (۱۴۰۳) خودکار شوند؟
۱۶. نام و لایسنس فونت فارسی. امکان دسترسی به فایل فیگما یا خروجی کد Figma Make وجود دارد؟
۱۷. فایل لوگو و آیکون‌ها با فرمت SVG.
۱۸. فرمول ماشین‌حساب: درصد کسورات و ناخالصی از وزن کم می‌شود یا از مبلغ؟ هزینه حمل اضافه می‌شود یا کسر؟ لطفاً یک مثال عددی ارائه دهید.
۱۹. قیمت اشتراک سه‌ماهه و میزان تخفیف آن چقدر است؟ سالانه = ۲۰٪ تخفیف نسبت به ۱۲ ماه؟
۲۰. «محدود» در پلن رایگان دقیقاً یعنی چه (تعداد آگهی قابل مشاهده، کدام قیمت‌ها، کدام امکانات ماشین‌حساب)؟
۲۱. در FAQ آمده «آیا می‌توانم فقط اطلاعات یک آگهی را خریداری کنم؟». آیا خرید تکی اطلاعات تماس یک آگهی وجود دارد؟ قیمت آن چقدر است؟
۲۲. «گروه‌های معاملاتی» چیست؟ (چت داخلی، لینک گروه تلگرام/واتساپ، …)
۲۳. رفتار دقیق «هوش بازار / Matching»، «هشدار قیمت» (از طریق پیامک، ایمیل یا نوتیفیکیشن)، «آگهی ویژه» و «پروفایل تجاری ویژه» چیست؟
۲۴. آگهی‌ها بلافاصله منتشر شوند یا پس از تأیید ادمین؟ مدت اعتبار آگهی؟ روند رسیدگی به گزارش تخلف؟
۲۵. فرآیند تأیید هویت (نشان «تأیید شده ✓») دستی است یا خودکار؟ چه مدارکی لازم است؟
۲۶. سیاست بازگشت وجه و تغییر پلن در میانه دوره (محاسبه مابه‌التفاوت)؟
۲۷. داده‌های قیمت از بورس کالا، تالار آهن، بازار آزاد و LME چگونه تأمین می‌شود (API رسمی، ارائه‌دهنده داده، ورود دستی)؟ هر چند وقت یک‌بار به‌روز شود؟
۲۸. روش ورود: موبایل + کد یک‌بارمصرف، ایمیل یا هر دو؟ کدام سرویس پیامک؟
۲۹. کدام درگاه پرداخت؟ آیا حساب پذیرنده (مرچنت) از قبل وجود دارد؟
۳۰. آیا پنل مدیریت کامل (قیمت‌ها، کاربران، آگهی‌ها، مزایدات، اشتراک‌ها، FAQ) در محدوده پروژه است؟
۳۱. تولید محتوای اخبار و تحلیل‌ها با چه کسی است؟
۳۲. طرح موبایل ارائه می‌شود یا تیم توسعه آن را تطبیق دهد؟
۳۳. هاستینگ داخل ایران باشد؟ دامنه alanfelez.ir خریداری شده است؟
۳۴. سایت فقط فارسی است یا نسخه انگلیسی هم در آینده لازم است؟
۳۵. API پلن سازمانی چه داده‌هایی را ارائه می‌دهد و محدودیت‌های آن چیست؟
۳۶. لینک طرح زنده نسخه قدیمی‌تری نسبت به تصاویر «پروپوزال خلاصه» است (منوی متفاوت، لینک مزایدات در نسخه زنده به صفحه اصلی می‌رود). کدام نسخه نهایی است؟ امکان انتشار آخرین نسخه روی لینک هست؟
۳۷. ساعات کاری در صفحه تماس دو مقدار متفاوت دارد («شنبه تا پنج‌شنبه ۹–۱۸» و «۸–۱۸ شنبه تا چهارشنبه، ۸–۱۳ پنج‌شنبه»). کدام صحیح است؟ تلفن و آدرس واقعی هستند؟
۳۸. «پشتیبانی آنلاین / چت زنده ۲۴ ساعته» با چه سرویسی (گفتینو، رایچت، …) یا ساخت داخلی؟ چه کسی پاسخ می‌دهد؟
۳۹. صفحات ورود/ثبت‌نام، داشبورد کاربر («اشتراک من»)، جزئیات آگهی، فرم ثبت آگهی، فرم گزارش آگهی، پرداخت، روند ارتقا، اعلان‌ها و صفحات حریم خصوصی و شرایط استفاده طراحی نشده‌اند. طراحی آن‌ها با شماست یا تیم توسعه با همین سبک طراحی کند؟ متن حریم خصوصی و شرایط استفاده را چه کسی تهیه می‌کند؟
۴۰. در صفحه درباره ما، Shanghai Metal Market و بانک مرکزی هم به‌عنوان منبع داده آمده‌اند. این منابع هم در محدوده پروژه هستند؟
۴۱. در نمودار، واحد ریال/تومان و کیلوگرم/تن قابل انتخاب است. داده «تن» از کجا تأمین می‌شود (صرفاً ضرب در ۱۰۰۰)؟
۴۲. آیکون‌ها در طرح به‌صورت ایموجی هستند. همین بماند یا مجموعه آیکون اختصاصی استفاده شود؟

(موارد ۸، ۱۶ و ۲۱ از روی لینک زنده پاسخ داده شدند؛ موارد ۱۲، ۱۸، ۲۲ و ۲۶ نیاز به تأیید نهایی دارند.)

### موارد جدید (بر اساس فایل‌های FAQ، درباره ما و قوانین)
۴۳. املای رسمی نام برند «الان‌فلز» است یا «آلان‌فلز»؟ (در متن‌های جدید «الان‌فلز» و در طرح «آلان‌فلز» آمده است.)
۴۴. متن‌های جدید با طرح فیگما تفاوت اساسی دارند: ۳ سطح اشتراک (بدون سازمانی)، عدم امکان ثبت درخواست خرید (فقط اعلام بار توسط دارنده بار)، «مزایدات» به معنی اطلاعات بورس کالا و حراج‌های روزانه (نه سیستم مزایده با ثبت پیشنهاد)، و قرار گرفتن ماشین حساب و پیامک در اشتراک طلایی. کدام نهایی است؟ لطفاً جدول نهایی امکانات هر سطح اشتراک را ارسال کنید.
۴۵. بخش «ارزش‌های ما» در درباره ما هنوز پیش‌نویس است (برای هر حرف چند گزینه). لطفاً برای هر حرف یک مورد انتخاب کنید. چیدمان صفحه درباره ما مطابق طرح فعلی باشد یا طراحی جدید؟
۴۶. در بند ۴ قوانین آمده «الان فلز تضمین می‌دهد در صورت اعلام بار با قیمت سایت، خریدار با همان قیمت را متصل کند»، اما در هشدار پایانی و FAQ آمده که هیچ تضمینی برای انجام معامله وجود ندارد. کدام صحیح است؟ اگر تضمین باقی می‌ماند، فرآیند اجرایی آن چیست؟ پیشنهاد می‌شود متن توسط مشاور حقوقی بررسی شود.
۴۷. تاریخ به‌روزرسانی، ایمیل و شماره تماس رسمی در قوانین جای‌خالی دارند.
۴۸. متن «حریم خصوصی» ارسال نشده است.
۴۹. صفحه «مجوزها و اعتبار»: کدام مجوزها (اینماد، ساماندهی، …)؟ آیا از قبل اخذ شده‌اند؟ طرحی برای این صفحه دارید؟
۵۰. سرویس پیامک: هزینه آن جزو اشتراک است یا جداگانه؟ کاربر آستانه «تغییر شدید» را خودش تعیین می‌کند؟ فقط پیامک یا ایمیل/نوتیفیکیشن هم؟
۵۱. فیلدهای «اعلام بار» (مشخصات فنی، تناژ، عیار، محل بارگیری، شرایط تحویل و …) بیشتر از کارت طرح است. فرم کامل پیاده شود؟ امکان بارگذاری تصویر یا آنالیز؟ آگهی‌ها قبل از انتشار بررسی می‌شوند؟ توسط چه کسی؟
۵۲. داده‌های بورس کالا و حراج‌های روزانه از کجا تأمین می‌شود و دقیقاً چه اطلاعاتی نمایش داده شود؟ طرحی برای آن وجود ندارد.
۵۳. دامنه اصلی Alanfelez.ir است یا Alanfelez.com (دیگری ریدایرکت شود)؟
۵۴. سیستم تیکت پشتیبانی ساخته شود؟ کدام پیام‌رسان (بله، ایتا، تلگرام، واتساپ)؟
۵۵. در FAQ به «نرخ ارز» به‌عنوان ورودی ماشین حساب اشاره شده. محاسبه بر اساس قیمت دلاری (مثلاً LME × نرخ ارز) هم لازم است؟
