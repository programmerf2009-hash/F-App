import { useEffect, useRef } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import "./legal.css";

export type LegalKind = "privacy" | "terms";

const UPDATED = "2026-yil 2-noyabr";

function PrivacyDoc() {
  return (
    <>
      <p className="legal__eyebrow">Maxfiylik siyosati</p>
      <h1>Ma’lumotlaringiz qanday ishlatiladi</h1>
      <p className="legal__meta">Oxirgi yangilanish: {UPDATED}</p>

      <h2>1. Qanday ma’lumot yig‘amiz</h2>
      <p>
        F App’dan foydalanish uchun siz taxallus (nickname), ism, email, jins va tug‘ilgan
        kunni kiritasiz. Profilingizga rasm va sevimli qo‘shiq qo‘shishingiz mumkin. Xabarlar,
        izohlar, e’lon qilingan maqola, Flash va Shorts hamda kanal obunalari ham saqlanadi.
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
        Ommaviy profil kartangizda faqat taxallus va rasm ko‘rinadi. Email, jins va tug‘ilgan
        kun boshqa foydalanuvchilarga ko‘rsatilmaydi.
      </p>

      <h2>4. Qancha vaqt saqlaymiz</h2>
      <p>
        Hisob faol bo‘lganda ma’lumotlar saqlanadi. Hisobni o‘chirishni so‘rasangiz, profil va
        unga bog‘langan shaxsiy ma’lumotlar o‘chiriladi. Qonun talab qilgan hollarda ayrim
        yozuvlar uzoqroq saqlanishi mumkin.
      </p>

      <h2>5. Huquqlaringiz</h2>
      <p>
        O‘z ma’lumotlaringizni ko‘rish, tuzatish yoki o‘chirishni so‘rashingiz mumkin. Buning
        uchun <a href="mailto:admin@fapp.app">admin@fapp.app</a> manziliga yozing. So‘rovni
        imkon qadar tez, odatda 30 kun ichida ko‘rib chiqamiz.
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

      <h2>8. Aloqa</h2>
      <p>
        Savollar uchun: <a href="mailto:admin@fapp.app">admin@fapp.app</a>.
      </p>
    </>
  );
}

function TermsDoc() {
  return (
    <>
      <p className="legal__eyebrow">Foydalanish shartlari</p>
      <h1>F App’dan foydalanish qoidalari</h1>
      <p className="legal__meta">Oxirgi yangilanish: {UPDATED}</p>

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

      <h2>9. Aloqa</h2>
      <p>
        Savollar uchun: <a href="mailto:admin@fapp.app">admin@fapp.app</a>.
      </p>
    </>
  );
}

export function LegalOverlay({ kind, onClose }: { kind: LegalKind; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

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

  return (
    <div className="legal" role="dialog" aria-modal="true" aria-labelledby="legal-title">
      <div className="legal__bar">
        <button
          ref={closeRef}
          type="button"
          className="legal__back"
          onClick={onClose}
          aria-label="Orqaga"
        >
          <ArrowLeft size={18} strokeWidth={2.1} />
        </button>
        <span className="legal__stamp">
          <ShieldCheck size={14} strokeWidth={2.1} />
          F App legal
        </span>
      </div>

      <article className="legal__doc" id="legal-title">
        {kind === "privacy" ? <PrivacyDoc /> : <TermsDoc />}
      </article>
    </div>
  );
}
