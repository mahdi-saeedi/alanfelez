-- +goose Up
-- Content (client, 2026-11-04): «مواد اولیه» → «مواد اولیه معدنی» everywhere in the pages and the FAQ, and a new privacy
-- policy (F19: the usage records of signed-in users, paid SMS metals, greetings, retention, deletion). Pages keep the
-- previous text as a revision (app.page_revisions); the admin can edit it all afterwards.

-- +goose StatementBegin
WITH n AS (
  SELECT p.slug,
         CASE WHEN p.slug = 'privacy' THEN $pv$<p>الان‌فلز (alanfelez.ir) به حریم خصوصی کاربران خود احترام می‌گذارد و اطلاعات آن‌ها را مطابق قوانین جمهوری اسلامی ایران، از جمله قانون تجارت الکترونیکی، نگهداری و حفاظت می‌کند. این صفحه توضیح می‌دهد چه اطلاعاتی از شما جمع‌آوری می‌شود، برای چه کاری، چه مدت نگهداری می‌شود و چه حقوقی درباره‌ی آن دارید. ثبت‌نام و استفاده از سایت به معنی آگاهی از این سیاست و پذیرش آن است.</p>
<h2>۱. اطلاعاتی که جمع‌آوری می‌کنیم</h2>
<ul>
<li><strong>اطلاعات حساب کاربری:</strong> شماره موبایل (که نام کاربری شما هم هست و برای ورود با کد یک‌بار مصرف به کار می‌رود)، رمز عبور (به‌صورت رمزنگاری‌شده و غیرقابل بازیابی؛ حتی کارکنان الان‌فلز آن را نمی‌بینند)، نام و نام خانوادگی، زمینه‌ی فعالیت، فلزات تخصصی و زمان پذیرش قوانین؛ و در صورت تمایل، نام شرکت، استان، شهر، آدرس و ایمیل.</li>
<li><strong>سوابق خرید و پرداخت:</strong> اشتراک خریداری‌شده، فلزهایی که برای پیامک قیمت انتخاب و پرداخت کرده‌اید، مبلغ، زمان پرداخت و شماره پیگیری درگاه. اطلاعات کارت بانکی شما فقط در صفحه‌ی درگاه پرداخت بانکی وارد می‌شود و در سامانه‌ی الان‌فلز ذخیره نمی‌شود.</li>
<li><strong>پیام‌ها و درخواست‌های پشتیبانی:</strong> متن پیام‌های فرم تماس، تیکت‌ها، تحلیل‌ها، نظرها و امتیازهایی که در سایت ثبت می‌کنید، همراه با اطلاعات تماسی که خودتان وارد می‌کنید.</li>
<li><strong>سوابق استفاده از سایت (فقط برای کاربرانی که وارد حساب خود شده‌اند):</strong> صفحه‌هایی که باز می‌کنید، مدت زمانی که هر صفحه جلوی چشم شماست و فلز یا محصولی که آن صفحه درباره‌ی آن است، همراه با حساب شما ثبت می‌شود.</li>
<li><strong>اطلاعات فنی:</strong> نشانی IP، نوع مرورگر و دستگاه، زمان ورود و استفاده از امکانات اشتراکی. این اطلاعات برای امنیت، جلوگیری از سوءاستفاده و اجرای قواعد اشتراک (از جمله شرایط بازگشت وجه) نگهداری می‌شود.</li>
</ul>
<h2>۲. هدف استفاده از اطلاعات</h2>
<ul>
<li>ایجاد و مدیریت حساب کاربری و ورود امن به آن</li>
<li>فعال‌سازی، تمدید و ارتقای اشتراک و رسیدگی به درخواست‌های بازگشت وجه</li>
<li>ارسال پیامک‌ها: کد تأیید، خوش‌آمدگویی، تأیید خرید، یادآوری پایان اشتراک و پیامک‌های قیمت فلزاتی که انتخاب کرده‌اید</li>
<li>شناخت نیاز کاربران و متناسب کردن خدمات، اطلاع‌رسانی‌ها و پیشنهادها با زمینه‌ی فعالیت و فلزات مورد علاقه‌ی آن‌ها</li>
<li>پاسخ به پیام‌ها و تیکت‌های پشتیبانی</li>
<li>حفظ امنیت سامانه، پیشگیری از تقلب و سوءاستفاده و رعایت الزامات قانونی</li>
<li>بهبود خدمات با استفاده از آمار تجمیعی</li>
</ul>
<p>اطلاعات شما به هیچ شخص یا شرکتی فروخته نمی‌شود و برای تبلیغات اشخاص دیگر در اختیار آن‌ها قرار نمی‌گیرد.</p>
<h2>۳. اشتراک اطلاعات با دیگران</h2>
<p>اطلاعات شما فقط در حد لازم برای ارائه‌ی خدمت در اختیار این ارائه‌دهندگان داخلی قرار می‌گیرد:</p>
<ul>
<li><strong>سرویس پیامک:</strong> شماره موبایل و متن پیامک، برای ارسال پیامک‌ها.</li>
<li><strong>درگاه پرداخت:</strong> مبلغ و شناسه‌ی سفارش، برای انجام و تأیید پرداخت.</li>
<li><strong>میزبانی و ذخیره‌سازی:</strong> اطلاعات و فایل‌های سایت روی سرورهای داخل ایران نگهداری می‌شود.</li>
</ul>
<p>در صورت درخواست مراجع قضایی یا قانونی صالح، اطلاعات مطابق قوانین لازم‌الاجرا و فقط به همان میزان در اختیار آن‌ها قرار می‌گیرد.</p>
<h2>۴. کوکی‌ها، آمار بازدید و سوابق استفاده</h2>
<p>سایت فقط از کوکی‌های ضروری برای ورود و حفظ نشست کاربری استفاده می‌کند و کوکی ردیابی یا تبلیغاتی ندارد.</p>
<p>برای شمارش تعداد بازدیدکنندگان روزانه، نشانی IP و نوع مرورگر با کلیدی که هر روز عوض می‌شود به یک شناسه‌ی یک‌طرفه تبدیل می‌شود؛ خود IP برای این آمار ذخیره نمی‌شود و از این شناسه نمی‌توان شما را شناسایی کرد. وقتی وارد حساب نشده‌اید، بازدید شما فقط شمرده می‌شود و به شما ربط داده نمی‌شود.</p>
<p>وقتی با حساب کاربری خود وارد سایت هستید، سوابق استفاده‌ی شما (بند ۱) ثبت می‌شود. این اطلاعات فقط در اختیار کارکنان مجاز الان‌فلز است، روی سرورهای خود الان‌فلز در داخل ایران نگهداری می‌شود و به دیگران فروخته یا داده نمی‌شود.</p>
<h2>۵. مدت نگهداری</h2>
<ul>
<li>اطلاعات حساب کاربری: تا زمانی که حساب فعال است.</li>
<li>سوابق مالی (سفارش، پرداخت و بازگشت وجه): تا ۱۰ سال، مطابق الزامات نگهداری اسناد مالی.</li>
<li>پیام‌های فرم تماس و تیکت‌های بسته‌شده: تا ۲ سال.</li>
<li>سوابق پیامک‌های ارسال‌شده: تا ۱ سال.</li>
<li>صفحه‌هایی که کاربران واردشده باز کرده‌اند: تا ۱ سال؛ خلاصه‌ی روزانه‌ی آن (زمان و فلزهای دیده‌شده): تا ۲ سال.</li>
<li>گزارش‌های فنی سامانه: تا ۳۰ روز.</li>
<li>شناسه‌های یک‌طرفه‌ی آمار بازدید: تا ۹۰ روز.</li>
</ul>
<p>با حذف حساب کاربری، اطلاعات شخصی و سوابق استفاده‌ی شما پاک می‌شود؛ فقط سوابق مالی، بدون نام و شماره، به مدت الزامی قانونی باقی می‌ماند.</p>
<h2>۶. امنیت اطلاعات</h2>
<p>ارتباط با سایت رمزنگاری‌شده (HTTPS) است، دسترسی کارکنان به اطلاعات محدود به نیاز کاری و همراه با احراز هویت دومرحله‌ای است، کارهای کارکنان در سامانه ثبت می‌شود و از اطلاعات به‌صورت منظم نسخه‌ی پشتیبان تهیه می‌شود. با این حال هیچ سامانه‌ای امنیت مطلق را تضمین نمی‌کند؛ لطفاً رمز عبور و کد تأیید خود را در اختیار دیگران قرار ندهید و از دستگاه خود محافظت کنید. الان‌فلز هرگز رمز عبور یا کد تأیید شما را از طریق تلفن، پیامک یا پیام‌رسان درخواست نمی‌کند.</p>
<h2>۷. حقوق شما</h2>
<ul>
<li>مشاهده و ویرایش اطلاعات حساب در بخش حساب کاربری</li>
<li>درخواست حذف حساب از طریق پشتیبانی (سوابق مالی به مدت الزامی قانونی نگهداری می‌شود)</li>
<li>خاموش کردن پیامک‌های قیمت در بخش حساب کاربری</li>
<li>پرسش درباره‌ی اطلاعاتی که از شما نگهداری می‌شود و درخواست اصلاح اطلاعات نادرست</li>
</ul>
<h2>۸. کاربران زیر ۱۸ سال</h2>
<p>خدمات الان‌فلز برای فعالان بازار فلزات طراحی شده است. اگر کمتر از ۱۸ سال دارید، با اطلاع و رضایت ولی یا سرپرست قانونی خود از سایت استفاده کنید.</p>
<h2>۹. تغییرات این سیاست</h2>
<p>این سیاست ممکن است به‌روزرسانی شود. تاریخ آخرین به‌روزرسانی در همین صفحه نمایش داده می‌شود و تغییرات مهم از طریق سایت اطلاع‌رسانی می‌شود. ادامه‌ی استفاده از سایت پس از انتشار تغییرات به معنی پذیرش آن‌هاست.</p>
<h2>۱۰. تماس با ما</h2>
<p>برای هر پرسش درباره‌ی حریم خصوصی از صفحه‌ی <a href="/contact">«تماس با ما»</a> یا تیکت پشتیبانی در حساب کاربری استفاده کنید.</p>$pv$
              ELSE regexp_replace(p.body_fa, 'مواد اولیه(‌ی)?(?!(‌ی)? معدنی)', 'مواد اولیه\1 معدنی', 'g') END AS body_fa,
         CASE WHEN p.slug = 'privacy' THEN $pv$<p>Alan Felez (alanfelez.ir) respects your privacy and keeps and protects users' information under the laws of the Islamic Republic of Iran, including the Electronic Commerce Act. This page explains what we collect, why, how long we keep it and your rights. Signing up and using the site means you know and accept this policy.</p>
<h2>1. What we collect</h2>
<ul>
<li><strong>Account:</strong> your mobile number (also your username, used for one-time sign-in codes), your password (stored hashed; not even our staff can see it), your name, line of business, metals of interest and when you accepted the terms; and, if you wish, company name, province, city, address and email.</li>
<li><strong>Purchases:</strong> the plan bought, the metals you paid price SMS for, the amount, payment time and the gateway's reference number. Card details are entered only on the bank gateway's page and are never stored by Alan Felez.</li>
<li><strong>Messages:</strong> contact-form messages, tickets, analyses, comments and ratings you post, with the contact details you enter.</li>
<li><strong>Site usage (signed-in users only):</strong> the pages you open, how long each page is in view and the metal or product it is about, recorded with your account.</li>
<li><strong>Technical:</strong> IP address, browser and device type, sign-in times and use of paid features, kept for security, abuse prevention and the plan rules (including refunds).</li>
</ul>
<h2>2. Why we use it</h2>
<ul>
<li>Creating and managing your account and signing you in securely</li>
<li>Activating, renewing and upgrading plans and handling refund requests</li>
<li>SMS: sign-in codes, welcome, purchase confirmation, plan reminders and price SMS for the metals you chose</li>
<li>Understanding users' needs and tailoring services, notices and offers to their business and metals of interest</li>
<li>Answering messages and tickets</li>
<li>Security, fraud prevention and legal obligations</li>
<li>Improving the service with aggregate statistics</li>
</ul>
<p>Your information is never sold and never given to others for their advertising.</p>
<h2>3. Sharing</h2>
<p>Only what's needed goes to these Iranian providers: the SMS service (number and text), the payment gateway (amount and order id), and hosting and storage on servers inside Iran. Competent judicial or legal authorities receive information only as the law requires.</p>
<h2>4. Cookies, visitor counts and usage records</h2>
<p>The site uses only the cookies needed to sign in and keep your session; no tracking or advertising cookies. Daily visitors are counted with a one-way identifier from the IP and browser under a key that changes every day; the IP itself isn't kept for this and you can't be identified from it. When you're not signed in, your visit is only counted. When you are signed in, your usage (section 1) is recorded; it is available only to authorised Alan Felez staff, kept on Alan Felez's own servers in Iran, and never sold or given to others.</p>
<h2>5. Retention</h2>
<ul>
<li>Account: while the account exists.</li>
<li>Financial records: up to 10 years, as required for financial documents.</li>
<li>Contact messages and closed tickets: up to 2 years.</li>
<li>Sent SMS: up to 1 year.</li>
<li>Pages opened by signed-in users: up to 1 year; their daily summary: up to 2 years.</li>
<li>Technical logs: up to 30 days. Visitor-count identifiers: up to 90 days.</li>
</ul>
<p>Deleting your account removes your personal details and usage records; only financial records stay, without name or number, for the legally required time.</p>
<h2>6. Security</h2>
<p>The site uses HTTPS, staff access is limited to need and protected with two-step sign-in, staff actions are logged and data is backed up regularly. No system is perfectly secure: keep your password and codes to yourself. Alan Felez never asks for your password or sign-in code by phone, SMS or messenger.</p>
<h2>7. Your rights</h2>
<ul>
<li>See and edit your account details</li>
<li>Ask support to delete your account (financial records are kept as the law requires)</li>
<li>Turn price SMS off in your account</li>
<li>Ask what we keep about you and have wrong details corrected</li>
</ul>
<h2>8. Users under 18</h2>
<p>Alan Felez is made for people working in the metals market. If you are under 18, use it with your parent's or guardian's knowledge and consent.</p>
<h2>9. Changes</h2>
<p>This policy may be updated; the last update date is shown on this page and important changes are announced on the site. Using the site after a change means accepting it.</p>
<h2>10. Contact</h2>
<p>For any privacy question, use the <a href="/en/contact">Contact us</a> page or a support ticket in your account.</p>$pv$ ELSE p.body_en END AS body_en
  FROM app.pages p
),
r AS (
  INSERT INTO app.page_revisions (slug, version, title_fa, title_en, body_fa, body_en)
  SELECT p.slug, p.version, p.title_fa, p.title_en, p.body_fa, p.body_en FROM app.pages p JOIN n ON n.slug = p.slug
  WHERE p.body_fa <> n.body_fa OR p.body_en IS DISTINCT FROM n.body_en
  ON CONFLICT (slug, version) DO NOTHING
)
UPDATE app.pages p SET body_fa = n.body_fa, body_en = n.body_en, version = p.version + 1, updated_at = now()
FROM n WHERE p.slug = n.slug AND (p.body_fa <> n.body_fa OR p.body_en IS DISTINCT FROM n.body_en);
-- +goose StatementEnd

UPDATE app.faq_items f SET
  question_fa = regexp_replace(f.question_fa, 'مواد اولیه(‌ی)?(?!(‌ی)? معدنی)', 'مواد اولیه\1 معدنی', 'g'),
  answer_fa = regexp_replace(f.answer_fa, 'مواد اولیه(‌ی)?(?!(‌ی)? معدنی)', 'مواد اولیه\1 معدنی', 'g'),
  updated_at = now()
WHERE f.question_fa ~ 'مواد اولیه(‌ی)?(?!(‌ی)? معدنی)' OR f.answer_fa ~ 'مواد اولیه(‌ی)?(?!(‌ی)? معدنی)';

-- +goose Down
-- Content edits: the previous page texts are in app.page_revisions; nothing is undone automatically.
SELECT 1;
