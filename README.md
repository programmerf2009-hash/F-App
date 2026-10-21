# F App

One app. One ecosystem. Endless possibilities.

**Jonli sayt:** <https://programmerf2009-hash.github.io/F-App/>

Hozirgi holat: **kirish (splash) ekrani + 3 qadamli onboarding**.

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
├─ app/            # ekranlar: SplashScreen, Onboarding, HomePlaceholder
├─ components/     # CosmicBackground, LogoMark
├─ data/           # onboarding slaydlari matni
├─ lib/            # localStorage yordamchilari
└─ styles/
   ├─ tokens.css   # brend ranglari, radius, easing (light/dark)
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

## Deploy (GitHub Pages)

`main` branch'ga har push bo'lganda `.github/workflows/deploy.yml` avtomatik ishlaydi:
`npm ci` → `npm run build` → `dist/` Pages'ga yuklanadi.

- Sayt manzili: `https://<username>.github.io/F-App/`
- Subfolder uchun `VITE_BASE=/F-App/` workflow ichida beriladi
- Pages: **Settings → Pages → Source: GitHub Actions**
- Eski (avvalgi) kontent `legacy` branch'ida saqlangan

## Keyingi qadamlar

1. Supabase sxemasi + RLS
2. Design system komponentlari
3. App shell: Home · Discover · AI · Activity · Profile
