# F App

One app. One ecosystem. Endless possibilities.

**Jonli sayt:** <https://programmerf2009-hash.github.io/F-App/>

Hozirgi holat: **splash → onboarding → kirish/ro'yxatdan o'tish → Home → Settings**.

## Ishga tushirish

```bash
npm install
npm run dev
```

Brauzer: <http://localhost:5174>

## Logotip

Kirish ekranida `public/brand/fapplogo2.png` (shaffof fon, 399×399) ko'rsatiladi.
Asl fayl `brand-source/fapplogo2.png` da saqlanadi.

Qayta tayyorlash (oq fonni olib tashlash, kesish, optimallashtirish):

```bash
python scripts/prepare-logo.py brand-source/fapplogo2.png
```

Skript oq fonni **faqat chetdan** flood-fill bilan olib tashlaydi — logotip
ichidagi och rangli joylar saqlanib qoladi.

## Struktura

```
src/
├─ app/            # ekranlar: Splash, Onboarding, Auth, Home, Settings + sheet'lar
├─ components/     # CosmicBackground, LogoMark, Sheet, BottomNav, Toast
├─ data/           # onboarding slaydlari, O'zbekiston joylari (GADM)
├─ lib/            # auth, rates, weather, places, home-prefs, theme, image, song-store, validation
└─ styles/
   ├─ tokens.css   # brend ranglari, radius, easing (light/dark)
   ├─ surfaces.css # Home va Settings uchun umumiy --h-* tema tokenlari
   └─ globals.css  # reset + asosiy tipografiya
```

## Brend palitrasi

| Token | Qiymat |
|---|---|
| Navy (asosiy fon) | `#071A33` |
| Deep navy | `#07111F` |
| Electric blue | `#1677FF` |
| Gold | `#FFD447` |
| Light bg | `#F7F9FC` |

## Kirish ekrani haqida

Fon to'liq CSS gradientlarda qurilgan — hech qanday rasm yuklanmaydi:

- purpur/binafsha nebula (4 radial gradient)
- 4 qatlam yulduzlar (`radial-gradient` tile'lar) + 5 ta yorqin chaqnash
- sut yo'li tumani va chekka vignette
- sekin "twinkle" va drift animatsiyalari (`prefers-reduced-motion`da o'chadi)

## Onboarding

Kirish ekrani 3 soniya turadi, so'ngra **faqat birinchi kirishda** 3 qadamli
tanishuv ochiladi: rasm, sarlavha, tavsif, `Skip` va `Next`.

| Qism | Mobil | Desktop |
|---|---|---|
| Kompozitsiya | vertikal: rasm tepada, matn pastda | gorizontal: shisha karta, 2 ustun |
| Boshqaruv | pastda: Skip chapda, nuqtalar o'rtada, Next o'ngda | shu tartibda, matn ustunida |

- `Skip` — pastda chapda, xira matn (faqat yozuv)
- `Next` — faqat ikonka: dumaloq tugma, oxirgi slaydda belgi (check)
- Slaydlar orasida surish (swipe), klaviatura: `←` `→`, `Esc` — o'tkazib yuborish
- Matnda hech qanday emoji ishlatilmaydi

Qayta ko'rish uchun: `?onboarding=1` (yoki `?onboarding=2`, `?onboarding=3`).

Holat `localStorage`da saqlanadi: `fapp:onboarding:v1 = "done"`.
O'chirilsa, tanishuv yana bir marta ko'rinadi.

## Kirish va akkount

Ikki ekran: **Log In** (nickname + parol) va **Sign Up** (ism, familya, yosh,
jins, nickname, parol). Google, Facebook, pochta va mehmon (guest) rejimi yo'q.

**Nickname qoidasi:** faqat kichik harflar, raqamlar, `.` va `_`; kamida 2 harf,
kamida 2 raqam, kamida bitta `.` yoki `_`; 5–24 belgi; takrorlanmaydi.

**Parol:** kamida 8 belgi, murakkablik talabi yo'q.

**Qurilma tarixi:** muvaffaqiyatli kirgandan keyin akkount shu qurilmada
eslab qolinadi (ko'pi bilan 3 ta). Login ekranidagi konvert ikonkasi bosilsa
ro'yxat ochiladi; akkount tanlanganda nickname va parol maydonlari to'ladi,
parolni ko'rish (ko'z) o'chadi va kirish token bilan bajariladi.

Sessiya 30 kun saqlanadi — qayta kirishda splash'dan so'ng to'g'ridan-to'g'ri
ilova ochiladi. Chiqish (Log out) faqat sessiyani o'chiradi, qurilma tarixi qoladi.

**Hozircha** akkountlar shu qurilmada saqlanadi (`localStorage`), parol
`salt` + SHA-256 bilan hashlanadi. Supabase ulanganda faqat `src/lib/auth.ts`
ichidagi funksiyalar almashtiriladi — ekranlar o'zgarmaydi.

Kalitlar: `fapp:accounts:v1`, `fapp:device:v1`, `fapp:session:v1`.

## Home

Kirgandan keyin ochiladigan asosiy ekran. Mobil dizayn 390 px kenglikka
mo'ljallangan, desktop'da 1120 px konteyner va ikki ustunli tartib ishlatiladi.

**Valyuta kurslari** — O'zbekiston Markaziy banki (CBU) kunlik kurslari:

- manba: `https://cbu.uz/uz/arkhiv-kursov-valyut/json/` (CORS ochiq)
- 3 ta karta: standart holda `USD`, `EUR`, `RUB`; har biri so'mdagi qiymatni
  va kunlik o'zgarishni (%) ko'rsatadi
- kartani bosib istalgan CBU valyutasiga almashtirish mumkin (75 ta valyuta)
- `in UZS` tugmasi bazani o'zgartiradi — uchala karta yangi bazada ko'rinadi;
  baza bilan karta ustma-ust tushsa, o'rinlar avtomatik almashadi
- javob 30 daqiqa `localStorage`da keshlanadi, keyin fonda yangilanadi

**Ob-havo** — Open-Meteo (`api.open-meteo.com`, API kalitsiz):

- joriy harorat, his qilinishi, H/L, namlik, shamol; WMO kodi bo'yicha ikonka
- joylashuv: qurilma geolokatsiyasi (ruxsat berilgan bo'lsa) yoki ro'yxatdan
  tanlash — 14 shahar + **171 tuman** (barcha viloyatlar)
- tanlov va kurs sozlamalari: `fapp:home:v1`; kurs keshi: `fapp:rates:v1`

**Bo'sh javonlar** — yangiliklar, do'kon aksiyalari va xizmatlar uchun skelet
kartalar ko'rsatiladi, ichida hech qanday soxta kontent yo'q.

**Pastki menyu** — 5 slot: Home va Settings ishlaydi, Profile va 2 ta bo'sh joy
keyinroq to'ldiriladi. Avatar menyusida akkount va `Log out` bor.

**Tema** — Settings'dan tanlanadi: `Midnight` (to'q navy) yoki `Gold`
(krem/oltin). Tanlov `fapp:theme:v1` da saqlanadi va Home hamda Settings'da
darhol qo'llanadi.

### Joylar ma'lumotini yangilash

Tuman ro'yxati GADM 4.1 chegaralaridan yasaladi (Toshkent shahrining 11 ta
tumani GADM'da alohida yo'q — skriptda qo'lda qo'shilgan):

```bash
# gadm41_UZB_2.json yuklab olinadi:
# https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_UZB_2.json
python scripts/build-places.py path/to/gadm41_UZB_2.json
```

Natija: `src/data/uzbekistan-places.ts` (14 shahar, 171 tuman).

## Settings

Pastki menyudagi **Settings** — akkountni ko'rish, tahlil qilish va tahrirlash.
Mobil 390 px, desktop 1120 px ikki ustunli tartib.

**Akkount tahlili** — yuqoridagi kartada rasm, ism, `@nickname`, yosh va jins,
profil to'liqligi (7 band: rasm, ism, familya, yosh, kasb, musiqa, bio) hamda
ro'yxatdan o'tgan sana ko'rsatiladi.

**Majburiy maydonlar:** ism, familya, yosh, profil rasmi, kasb va bitta sevimli
musiqa. **Ixtiyoriy:** bio (160 belgi). Matn maydonlari `Save changes` bilan
saqlanadi va validatsiyadan o'tadi; rasm va musiqa esa darhol saqlanadi.

- **Rasm** — tanlangan fayl markazdan kvadrat qirqilib, 512×512 JPEG data URL'ga
  aylantiriladi va akkount yozuvida saqlanadi. Home'dagi avatar shu rasmni
  ko'rsatadi. Qo'llab-quvvatlanmaydigan format yoki 20 MB'dan katta fayl rad
  etiladi.
- **Musiqa** — bitta audio fayl (12 MB gacha). Fayl `localStorage`ga sig'magani
  uchun IndexedDB'da saqlanadi: `fapp-media` bazasi, `songs` store, kalit —
  nickname. Akkountda faqat nom, tur, hajm va davomiylik qoladi. Pleyerda
  play/pause va seek bor; `Replace` almashtiradi, savatcha o'chiradi.
- **Tema** — `Midnight` yoki `Gold`; tanlov darhol qo'llanadi.
- **Clear cache** — `fapp:rates:v1` va ob-havo xotira keshini tozalaydi.
- **Log out** — sessiyani o'chiradi, qurilma tarixi qoladi.

Kalitlar: `fapp:theme:v1` (localStorage), `fapp:accounts:v1` / `fapp:session:v1`
(profil maydonlari shu yerda), `fapp-media` (IndexedDB).

## Deploy (GitHub Pages)

`main` branch'ga har push bo'lganda `.github/workflows/deploy.yml` avtomatik ishlaydi:
`npm ci` → `npm run build` → `dist/` Pages'ga yuklanadi.

- Sayt manzili: `https://<username>.github.io/F-App/`
- Subfolder uchun `VITE_BASE=/F-App/` workflow ichida beriladi
- Pages: **Settings → Pages → Source: GitHub Actions**
- Eski (avvalgi) kontent `legacy` branch'ida saqlangan

## Keyingi qadamlar

1. Profile ekrani (Settings ma'lumotlarini ommaviy ko'rinishda)
2. Yangiliklar va do'kon aksiyalari uchun real manbalar
3. Qidiruv (header'dagi ikonka)
4. Supabase sxemasi + RLS
