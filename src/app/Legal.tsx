import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import "./legal.css";

export type LegalKind = "privacy" | "terms";
type Lang = "uz" | "en";

const LANG_KEY = "fapp:legal:lang";

function readLang(): Lang {
  try {
    const saved = window.localStorage.getItem(LANG_KEY);
    if (saved === "uz" || saved === "en") return saved;
  } catch {
    /* private mode */
  }
  return "uz";
}

function PrivacyUz() {
  return (
    <>
      <p className="legal__eyebrow">Maxfiylik siyosati</p>
      <h1 id="legal-title">Ma’lumotlaringiz qanday ishlatiladi</h1>
      <p className="legal__meta">Oxirgi yangilanish: 2026-yil 2-noyabr</p>

      <h2>1. Qanday ma’lumot yig‘amiz</h2>
      <p>
        Ro‘yxatdan o‘tishda taxallus, ism, familiya, yosh va jinsni kiritasiz. Profilingizga
        rasm, kasb, qisqa tavsif va sevimli qo‘shiq qo‘shishingiz mumkin. Xabarlar, izohlar,
        e’lon qilingan maqola, Flash va Shorts hamda kanal obunalari ham saqlanadi.
      </p>
      <p>
        Bildirishnomalarga ruxsat bersangiz, qurilmangizning push-manzili (endpoint) va brauzer
        turi saqlanadi. Bu faqat siz tanlagan kanallardan tezkor xabar yuborish uchun kerak.
      </p>

      <h2>2. Nima uchun ishlatamiz</h2>
      <ul>
        <li>Hisobingizga kirish va sessiyani saqlash uchun.</li>
        <li>Xabarlar, izohlar va kanallarni ko‘rsatish uchun.</li>
        <li>Yangiliklar tasmasini va obunalaringizni tartiblash uchun.</li>
        <li>Siz yoqgan bildirishnomalarni yuborish uchun.</li>
        <li>Xavfsizlik, suiiste’mol va buzilishlarni aniqlash uchun.</li>
      </ul>

      <h2>3. Kim bilan bo‘lishamiz</h2>
      <p>
        Ma’lumotlar Supabase (baza va autentifikatsiya) hamda push-xizmat provayderlari orqali
        qayta ishlanadi. Bu provayderlar faqat xizmatni ko‘rsatish uchun ishlaydi. Biz
        ma’lumotlaringizni reklama maqsadida sotmaymiz.
      </p>
      <p>
        Ommaviy profil kartangizda faqat taxallus va rasm ko‘rinadi. Ism, yosh va jins boshqa
        foydalanuvchilarga ko‘rsatilmaydi.
      </p>

      <h2>4. Qancha vaqt saqlaymiz</h2>
      <p>
        Hisob faol bo‘lganda ma’lumotlar saqlanadi. Hisobni o‘chirish so‘rovi bajarilganda
        profil va unga bog‘langan shaxsiy ma’lumotlar o‘chiriladi. Qonun talab qilgan hollarda
        ayrim yozuvlar uzoqroq saqlanishi mumkin.
      </p>

      <h2>5. Huquqlaringiz</h2>
      <p>
        Siz o‘z ma’lumotlaringizni ko‘rish, tuzatish yoki o‘chirishni so‘rash huquqiga egasiz.
        Profil ma’lumotlarining ko‘p qismini Sozlamalar bo‘limidan o‘zingiz tahrirlashingiz
        mumkin. Boshqa so‘rovlar ilova egasi tomonidan ko‘rib chiqiladi.
      </p>

      <h2>6. Cookies va qurilma xotirasi</h2>
      <p>
        Sessiya, til, mavzu va News sozlamalari qurilma xotirasida (localStorage) saqlanadi.
        Bu ma’lumotlar reklama kuzatuvi uchun ishlatilmaydi va brauzer xotirasini tozalash
        orqali o‘chirilishi mumkin.
      </p>

      <h2>7. Bolalar</h2>
      <p>
        F App 13 yoshgacha bo‘lgan bolalarga mo‘ljallanmagan. Voyaga yetmagan foydalanuvchi
        ota-onasi yoki vasiysining roziligi bilan foydalanishi kerak.
      </p>
    </>
  );
}

function PrivacyEn() {
  return (
    <>
      <p className="legal__eyebrow">Privacy policy</p>
      <h1 id="legal-title">How your data is used</h1>
      <p className="legal__meta">Last updated: 2 November 2026</p>

      <h2>1. What we collect</h2>
      <p>
        When you sign up you enter a nickname, first and last name, age and gender. You may add
        a photo, profession, a short bio and a favourite song. Messages, comments, published
        articles, Flash items, Shorts and channel subscriptions are stored as well.
      </p>
      <p>
        If you allow notifications, we store your device push endpoint and browser type. This is
        used only to deliver breaking alerts from the channels you chose.
      </p>

      <h2>2. Why we use it</h2>
      <ul>
        <li>To sign you in and keep your session alive.</li>
        <li>To show messages, comments and channels.</li>
        <li>To rank the news feed and your subscriptions.</li>
        <li>To send the notifications you enabled.</li>
        <li>To detect security issues, abuse and rule violations.</li>
      </ul>

      <h2>3. Who we share it with</h2>
      <p>
        Data is processed through Supabase (database and authentication) and push service
        providers. These providers work only to run the service. We do not sell your data for
        advertising.
      </p>
      <p>
        Your public profile card shows only your nickname and photo. Name, age and gender are
        not shown to other users.
      </p>

      <h2>4. How long we keep it</h2>
      <p>
        Data is kept while your account is active. When an account deletion request is carried
        out, the profile and its personal data are removed. Some records may be kept longer
        where the law requires it.
      </p>

      <h2>5. Your rights</h2>
      <p>
        You may ask to see, correct or delete your data. Most profile fields can be edited by
        you in Settings. Other requests are reviewed by the app owner.
      </p>

      <h2>6. Cookies and device storage</h2>
      <p>
        Session, language, theme and News preferences are stored in device storage
        (localStorage). This data is not used for advertising tracking and can be cleared with
        your browser settings.
      </p>

      <h2>7. Children</h2>
      <p>
        F App is not intended for children under 13. Minors should use it with the consent of a
        parent or guardian.
      </p>
    </>
  );
}

function TermsUz() {
  return (
    <>
      <p className="legal__eyebrow">Foydalanish shartlari</p>
      <h1 id="legal-title">F App’dan foydalanish qoidalari</h1>
      <p className="legal__meta">Oxirgi yangilanish: 2026-yil 2-noyabr</p>

      <h2>1. Xizmat haqida</h2>
      <p>
        F App — yangiliklar, short videolar, kanallar va ijtimoiy funksiyalarni bir joyda
        birlashtirgan ilova. Ayrim bo‘limlar hali ishlab chiqilmoqda va vaqt o‘tishi bilan
        o‘zgarishi mumkin.
      </p>

      <h2>2. Hisob</h2>
      <p>
        Hisobingiz xavfsizligi uchun siz javobgarsiz. Taxallus boshqa foydalanuvchini
        chalg‘itishi yoki taniqli shaxs nomidan foydalanish uchun bo‘lmasligi kerak. Hisobni
        boshqaga topshirish faqat ilova ichidagi rasmiy topshirish jarayoni orqali amalga
        oshiriladi.
      </p>

      <h2>3. Kontent qoidalari</h2>
      <p>Quyidagilar taqiqlanadi:</p>
      <ul>
        <li>Noqonuniy, tahdidli, kamsituvchi yoki zo‘ravonlikni targ‘ib qiluvchi materiallar.</li>
        <li>Spam, aldov, firibgarlik va boshqa foydalanuvchilarni chalg‘itish.</li>
        <li>Mualliflik huquqi va shaxsiy hayotni buzish.</li>
        <li>Boshqalarning hisobiga yoki ma’lumotlariga ruxsatsiz kirishga urinish.</li>
      </ul>

      <h2>4. Kanallar va obunachilar</h2>
      <p>
        Kanal ochgan foydalanuvchi uning nomi, taxallusi va e’lonlariga javobgar. Kanal
        topshirilganda nom, taxallus, postlar va obunachilar yangi egasiga o‘tadi. Obunachilar
        istalgan vaqtda obunani bekor qilishlari mumkin.
      </p>

      <h2>5. Moderatsiya</h2>
      <p>
        Foydalanuvchilar kontentni shikoyat qilishlari mumkin. Qoidalarni buzgan material
        o‘chirilishi yoki kanal imtiyozlari cheklanishi mumkin. Jiddiy buzilishlarda hisob
        bloklanadi.
      </p>

      <h2>6. Bildirishnomalar</h2>
      <p>
        Tezkor xabarlar faqat siz ruxsat bergan qurilmalarga yuboriladi. Sozlamalardan push’ni
        istalgan vaqtda o‘chirishingiz mumkin.
      </p>

      <h2>7. Javobgarlik</h2>
      <p>
        Xizmat “bor holicha” taqdim etiladi. Uzilishlar, ma’lumot yo‘qolishi yoki uchinchi
        tomon kontenti uchun qonun ruxsat bergan darajada javobgarlik cheklanadi.
      </p>

      <h2>8. O‘zgarishlar</h2>
      <p>
        Shartlar yangilansa, ilovada ko‘rinadigan sana o‘zgaradi. Muhim o‘zgarishlar haqida
        ilova ichida xabar beramiz.
      </p>
    </>
  );
}

function TermsEn() {
  return (
    <>
      <p className="legal__eyebrow">Terms of use</p>
      <h1 id="legal-title">Rules for using F App</h1>
      <p className="legal__meta">Last updated: 2 November 2026</p>

      <h2>1. About the service</h2>
      <p>
        F App brings news, short videos, channels and social features into one app. Some
        sections are still being built and may change over time.
      </p>

      <h2>2. Your account</h2>
      <p>
        You are responsible for keeping your account safe. A nickname must not mislead other
        users or impersonate a known person. Handing an account over to someone else is only
        allowed through the official transfer flow inside the app.
      </p>

      <h2>3. Content rules</h2>
      <p>The following is not allowed:</p>
      <ul>
        <li>Illegal, threatening, hateful or violence-promoting material.</li>
        <li>Spam, deception, fraud and misleading other users.</li>
        <li>Infringing copyright or personal privacy.</li>
        <li>Trying to access someone else’s account or data without permission.</li>
      </ul>

      <h2>4. Channels and subscribers</h2>
      <p>
        Whoever opens a channel is responsible for its name, handle and posts. When a channel is
        transferred, its name, handle, posts and subscribers move to the new owner. Subscribers
        may unfollow at any time.
      </p>

      <h2>5. Moderation</h2>
      <p>
        Users can report content. Material that breaks the rules may be removed, and channel
        privileges may be limited. Serious violations lead to account suspension.
      </p>

      <h2>6. Notifications</h2>
      <p>
        Breaking alerts are sent only to devices you allowed. You can turn push off in Settings
        at any time.
      </p>

      <h2>7. Liability</h2>
      <p>
        The service is provided “as is”. Liability for outages, data loss or third-party content
        is limited to the extent the law allows.
      </p>

      <h2>8. Changes</h2>
      <p>
        When these terms change, the date shown in the app changes too. We will announce
        important changes inside the app.
      </p>
    </>
  );
}

export function LegalOverlay({ kind, onClose }: { kind: LegalKind; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [lang, setLang] = useState<Lang>(readLang);

  const chooseLang = (next: Lang) => {
    setLang(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      /* private mode */
    }
  };

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const doc =
    kind === "privacy" ? (
      lang === "uz" ? (
        <PrivacyUz />
      ) : (
        <PrivacyEn />
      )
    ) : lang === "uz" ? (
      <TermsUz />
    ) : (
      <TermsEn />
    );

  return (
    <div className="legal" role="dialog" aria-modal="true" aria-labelledby="legal-title">
      <div className="legal__bar">
        <button
          ref={closeRef}
          type="button"
          className="legal__back"
          onClick={onClose}
          aria-label={lang === "uz" ? "Orqaga" : "Back"}
        >
          <ArrowLeft size={18} strokeWidth={2.1} />
        </button>

        <div className="legal__tools">
          <span className="legal__stamp">
            <ShieldCheck size={14} strokeWidth={2.1} />
            F App legal
          </span>
          <div className="legal__lang" role="group" aria-label="Document language">
            <button
              type="button"
              className={lang === "uz" ? "is-active" : ""}
              aria-pressed={lang === "uz"}
              onClick={() => chooseLang("uz")}
            >
              UZ
            </button>
            <button
              type="button"
              className={lang === "en" ? "is-active" : ""}
              aria-pressed={lang === "en"}
              onClick={() => chooseLang("en")}
            >
              EN
            </button>
          </div>
        </div>
      </div>

      <article className="legal__doc" lang={lang}>
        {doc}
      </article>
    </div>
  );
}
