import type {
  NewsArticle,
  NewsCategory,
  NewsChannel,
  NewsFlash,
  NewsShort,
} from "./news-types";

/* ==========================================================================
   Demo newsroom data
   --------------------------------------------------------------------------
   The first build is intentionally local-first: it makes the complete news
   experience testable before the Supabase news schema is applied. The shapes
   match that future schema.
   ========================================================================== */

const photo = (id: string, width = 1200, height = 800) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&h=${height}&q=82`;

const portrait = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=760&h=1300&q=84`;

export const NEWS_IMAGES = {
  city: photo("photo-1477959858617-67f85cf4f1df"),
  tashkent: photo("photo-1596484552834-6a58f850e0a1"),
  business: photo("photo-1486406146926-c627a92ad1ab"),
  technology: photo("photo-1518770660439-4636190af475"),
  sport: photo("photo-1522778119026-d647f0596c20"),
  running: photo("photo-1461896836934-ffe607ba8211"),
  climate: photo("photo-1500534623283-312aade485b7"),
  press: photo("photo-1495020689067-958852a7765e"),
  world: photo("photo-1529107386315-e1a2ed48a620"),
  market: photo("photo-1611974789855-9c2a0a7236a3"),
  samarkand: photo("photo-1521295121783-8a321d551ad2"),
  nightCity: photo("photo-1519501025264-65ba15a82390"),
};

export const DEMO_CHANNELS: NewsChannel[] = [
  {
    id: "f-newsroom",
    name: "F Newsroom",
    handle: "fnewsroom",
    description:
      "The editorial desk of F News & Weather. Clear context, verified sourcing and the stories that matter to Uzbekistan.",
    category: "Top",
    ownerName: "F App Editorial",
    ownerNickname: "fnewsroom",
    verified: true,
    subscribers: 248_400,
    cover: NEWS_IMAGES.city,
    tone: "#2F6BFF",
    joined: "2024",
  },
  {
    id: "tashkent-today",
    name: "Tashkent Today",
    handle: "tashkenttoday",
    description:
      "A local desk covering transport, neighbourhoods, city hall and the small changes that shape daily life in Tashkent.",
    category: "Local",
    ownerName: "Nodira Karimova",
    ownerNickname: "nodira",
    verified: true,
    subscribers: 96_200,
    cover: NEWS_IMAGES.tashkent,
    tone: "#0F9D76",
    joined: "2024",
  },
  {
    id: "silk-road-business",
    name: "Silk Road Business",
    handle: "silkroadbiz",
    description:
      "Trade, industry, startups and the companies connecting Central Asia to the world economy.",
    category: "Business",
    ownerName: "Rustam Yuldashev",
    ownerNickname: "rustamy",
    verified: true,
    subscribers: 121_800,
    cover: NEWS_IMAGES.business,
    tone: "#3B5BDB",
    joined: "2023",
  },
  {
    id: "tech-uz",
    name: "Tech Uzbekistan",
    handle: "techuz",
    description:
      "Products, engineers and ideas coming out of Uzbekistan's fast-growing technology scene.",
    category: "Technology",
    ownerName: "Malika Tosheva",
    ownerNickname: "malikat",
    verified: true,
    subscribers: 48_900,
    cover: NEWS_IMAGES.technology,
    tone: "#6D4AFF",
    joined: "2025",
  },
  {
    id: "uz-sport",
    name: "UzSport",
    handle: "uzsport",
    description:
      "The national game, the next generation and the clubs carrying Uzbek sport beyond the region.",
    category: "Sport",
    ownerName: "Aziz Rasulov",
    ownerNickname: "azizr",
    verified: true,
    subscribers: 189_600,
    cover: NEWS_IMAGES.sport,
    tone: "#D97706",
    joined: "2023",
  },
  {
    id: "climate-desk",
    name: "Climate Desk",
    handle: "climatedesk",
    description:
      "Weather, water, heat and the long-term choices that will define life across Central Asia.",
    category: "Climate",
    ownerName: "Dilnoza Saidova",
    ownerNickname: "dilnoza",
    verified: false,
    subscribers: 23_800,
    cover: NEWS_IMAGES.climate,
    tone: "#0E8FA3",
    joined: "2025",
  },
  {
    id: "samarkand-live",
    name: "Samarkand Live",
    handle: "samarkandlive",
    description:
      "A window on Samarkand: craft, food, heritage and the people building a modern city around an ancient one.",
    category: "Culture",
    ownerName: "Bekzod Ergashev",
    ownerNickname: "bekzode",
    verified: false,
    subscribers: 17_200,
    cover: NEWS_IMAGES.samarkand,
    tone: "#B45309",
    joined: "2025",
  },
  {
    id: "world-wire",
    name: "World Wire",
    handle: "worldwire",
    description:
      "A calm, sourced read on global politics, markets and the stories that reach Central Asia.",
    category: "World",
    ownerName: "Elena Petrova",
    ownerNickname: "elenap",
    verified: true,
    subscribers: 77_500,
    cover: NEWS_IMAGES.world,
    tone: "#2563EB",
    joined: "2024",
  },
];

const cityBody = (lead: string, image: string, caption: string, quote: string) => [
  { type: "text" as const, text: lead },
  { type: "image" as const, src: image, caption },
  {
    type: "text" as const,
    text:
      "The plan is being tested in stages. Officials say the first phase will focus on the busiest interchanges, with later phases shaped by passenger numbers rather than by a fixed rollout calendar.",
  },
  { type: "quote" as const, text: quote },
  {
    type: "image" as const,
    src: NEWS_IMAGES.nightCity,
    caption: "Late-night connections would be timed around the final metro service.",
  },
  {
    type: "video" as const,
    poster: NEWS_IMAGES.city,
    caption: "A short explainer on how the night pilot would work.",
    duration: "0:58",
  },
  {
    type: "text" as const,
    text:
      "For commuters, the practical test will be reliability: late connections, clear information at stations and a predictable last service. The city says it will publish monthly performance data during the pilot.",
  },
  {
    type: "text" as const,
    text:
      "F Newsroom will keep this story updated as the first timetable is released and will add a full explainer with maps once the transport department publishes the route details.",
  },
];

export const DEMO_ARTICLES: NewsArticle[] = [
  {
    id: "metro-night-plan",
    channelId: "f-newsroom",
    category: "Top",
    title: "Tashkent unveils a 24-hour metro plan for its busiest lines",
    summary:
      "A six-month pilot would keep two lines running through the night, with late buses timed to meet the final trains.",
    body: cityBody(
      "Tashkent is preparing a late-night transport pilot that would keep two of its busiest metro lines running after midnight, according to a plan presented to city transport officials this week. The proposal is designed around shift workers, hospital staff and students who currently rely on taxis after the last train.",
      NEWS_IMAGES.tashkent,
      "Tashkent's metro network carries hundreds of thousands of passengers every day.",
      "If the first month works, we should not be afraid to make the night service permanent. The city has changed; the timetable has to change with it.",
    ),
    cover: NEWS_IMAGES.tashkent,
    region: "Tashkent",
    minutesAgo: 14,
    readMinutes: 4,
    urgent: true,
    tags: ["Tashkent", "Transport", "Metro"],
  },
  {
    id: "textile-exports",
    channelId: "silk-road-business",
    category: "Business",
    title: "Uzbekistan's textile exports cross a new quarterly high",
    summary:
      "Higher-value finished goods are beginning to outweigh raw cotton exports, according to the latest trade figures.",
    body: [
      {
        type: "text",
        text:
          "Uzbekistan's textile sector has recorded its strongest quarter for finished-goods exports, with clothing and home textiles taking a larger share of total shipments. Industry groups say the shift reflects years of investment in spinning, dyeing and design capacity.",
      },
      {
        type: "image",
        src: NEWS_IMAGES.business,
        caption: "Textile groups are moving further into finished products rather than raw material exports.",
      },
      {
        type: "text",
        text:
          "The change matters because finished goods usually carry more jobs and more value per tonne than raw cotton. Smaller producers, however, say access to finance and reliable logistics remain the biggest barriers to scaling.",
      },
      {
        type: "quote",
        text:
          "The next stage is not simply selling more. It is building brands that buyers return to season after season.",
      },
      {
        type: "text",
        text:
          "Analysts will be watching whether the trend survives the next quarter, when energy costs and shipping rates are expected to rise. For now, the direction of travel is clear: Uzbekistan wants a bigger share of the final product.",
      },
    ],
    cover: NEWS_IMAGES.business,
    minutesAgo: 42,
    readMinutes: 3,
    tags: ["Exports", "Textiles", "Economy"],
  },
  {
    id: "ai-uzbek-language",
    channelId: "tech-uz",
    category: "Technology",
    title: "Inside the Tashkent lab teaching AI to speak Uzbek",
    summary:
      "A small research team is building open language tools for a market that global models still treat as an afterthought.",
    body: [
      {
        type: "text",
        text:
          "In a quiet office near Tashkent's technology district, a team of linguists and engineers is assembling one of the country's largest open collections of Uzbek speech and text. Their goal is not a single product, but a foundation that local developers can build on.",
      },
      {
        type: "image",
        src: NEWS_IMAGES.technology,
        caption: "Uzbek is spoken by tens of millions of people, but remains underrepresented in global AI training data.",
      },
      {
        type: "text",
        text:
          "The work is painstaking. Dialects, code-switching with Russian, and a shortage of labelled audio all make the data harder to collect than the team first expected. The group is now paying volunteers for verified recordings and publishing its annotation rules openly.",
      },
      {
        type: "quote",
        text:
          "A language model should understand how people actually speak, not only how a textbook says they should.",
      },
      {
        type: "text",
        text:
          "The first public tools are expected to be small: transcription, search and a reading assistant. If they work, the team says the same dataset can support education, public services and newsrooms.",
      },
    ],
    cover: NEWS_IMAGES.technology,
    minutesAgo: 76,
    readMinutes: 5,
    tags: ["AI", "Language", "Tashkent"],
  },
  {
    id: "pakhtakor-academy",
    channelId: "uz-sport",
    category: "Sport",
    title: "Pakhtakor's academy is betting on homegrown talent",
    summary:
      "A new generation of teenage players is getting first-team minutes as the club changes how it builds a squad.",
    body: [
      {
        type: "text",
        text:
          "Pakhtakor's training ground is busier than usual. Alongside the first team, a group of academy players is preparing for a run of matches that could decide how quickly the club's next generation reaches the top level.",
      },
      {
        type: "image",
        src: NEWS_IMAGES.sport,
        caption: "The club is giving academy players more time with the first-team squad.",
      },
      {
        type: "text",
        text:
          "Coaches say the change is partly financial and partly philosophical. Developing players at home creates a more stable squad, but it also demands patience with mistakes that a senior signing would not be allowed to make.",
      },
      {
        type: "quote",
        text:
          "You cannot say you trust young players and then take them off after one bad pass. Trust has to be visible.",
      },
      {
        type: "text",
        text:
          "The next test comes this weekend, when the club is expected to name at least three academy graduates in the matchday squad. Supporters will be watching closely.",
      },
    ],
    cover: NEWS_IMAGES.sport,
    minutesAgo: 134,
    readMinutes: 4,
    tags: ["Football", "Pakhtakor", "Academy"],
  },
  {
    id: "hotter-september",
    channelId: "climate-desk",
    category: "Climate",
    title: "A hotter September is changing how Tashkent plans its streets",
    summary:
      "Shade, water and night-time cooling are moving from design extras to essential parts of the city's public spaces.",
    body: [
      {
        type: "text",
        text:
          "Tashkent's longer, hotter summers are beginning to reshape the way public space is designed. Planners are testing deeper tree canopies, lighter paving and water points in neighbourhoods where summer temperatures linger long after sunset.",
      },
      {
        type: "image",
        src: NEWS_IMAGES.climate,
        caption: "Urban shade is becoming a public-health priority during longer heatwaves.",
      },
      {
        type: "text",
        text:
          "The changes sound small, but their effect is cumulative. A shaded walk to a bus stop can mean the difference between a comfortable journey and a dangerous one for older residents and children.",
      },
      {
        type: "quote",
        text:
          "We cannot cool the whole city at once. But we can make the places people use every day safer.",
      },
      {
        type: "text",
        text:
          "The city is expected to publish a heat-action plan later this year. Climate Desk will track which measures are funded and which remain proposals.",
      },
    ],
    cover: NEWS_IMAGES.climate,
    region: "Tashkent",
    minutesAgo: 188,
    readMinutes: 4,
    tags: ["Heat", "Cities", "Climate"],
  },
  {
    id: "samarkand-night-studios",
    channelId: "samarkand-live",
    category: "Culture",
    title: "Samarkand's craft studios are opening their doors after dark",
    summary:
      "A new evening programme gives visitors a quieter view of the city's workshops, courtyards and working artisans.",
    body: [
      {
        type: "text",
        text:
          "After the day's tour groups move on, a different Samarkand begins to appear. Ceramicists, silk weavers and woodcarvers are opening their studios for small evening visits, turning the city's craft economy into something closer to a conversation.",
      },
      {
        type: "image",
        src: NEWS_IMAGES.samarkand,
        caption: "Evening studio visits are designed to show the working side of Samarkand's craft traditions.",
      },
      {
        type: "text",
        text:
          "The programme is deliberately small. Organisers say they want visitors to spend time with a single workshop rather than move quickly through a list of stops. The model also gives artisans a more direct share of tourism spending.",
      },
      {
        type: "quote",
        text:
          "People remember the person who showed them the work, not only the object they bought.",
      },
      {
        type: "text",
        text:
          "The next season begins next month, with bookings handled through participating studios. A full list of workshops will be published by the city's cultural office.",
      },
    ],
    cover: NEWS_IMAGES.samarkand,
    minutesAgo: 246,
    readMinutes: 3,
    tags: ["Samarkand", "Craft", "Travel"],
  },
  {
    id: "markets-energy-retreat",
    channelId: "world-wire",
    category: "World",
    title: "Global markets steady as energy prices cool",
    summary:
      "Investors are balancing softer fuel costs against fresh questions about growth in the world's largest economies.",
    body: [
      {
        type: "text",
        text:
          "Global equities traded in a narrow range on Friday as a pullback in energy prices offset cautious commentary from major central banks. Investors described the session as a pause rather than a change in direction.",
      },
      {
        type: "image",
        src: NEWS_IMAGES.market,
        caption: "Energy and technology shares moved in opposite directions during the session.",
      },
      {
        type: "text",
        text:
          "Lower fuel costs are generally good news for households and transport companies, but they can also signal weaker demand. That ambiguity has kept traders from making large bets ahead of next week's inflation data.",
      },
      {
        type: "quote",
        text:
          "The market is not looking for a dramatic story today. It is looking for the next piece of evidence.",
      },
      {
        type: "text",
        text:
          "Emerging-market currencies, including those in Central Asia, were broadly stable. World Wire will publish a fuller market wrap after the European close.",
      },
    ],
    cover: NEWS_IMAGES.market,
    minutesAgo: 304,
    readMinutes: 2,
    tags: ["Markets", "Energy", "Global"],
  },
  {
    id: "night-bus-routes",
    channelId: "tashkent-today",
    category: "Local",
    title: "New night bus routes connect five Tashkent districts",
    summary:
      "The first services will run on Fridays and Saturdays, with the city asking passengers to help shape the next route.",
    body: [
      {
        type: "text",
        text:
          "Five new night bus routes will begin operating across Tashkent this weekend, linking the city centre with densely populated neighbourhoods in Yunusabad, Chilanzar, Mirzo Ulugbek and Yashnabad.",
      },
      {
        type: "image",
        src: NEWS_IMAGES.nightCity,
        caption: "Night buses will run on a trial timetable for the first eight weeks.",
      },
      {
        type: "text",
        text:
          "The service is aimed at people finishing late shifts, students and residents who currently face long waits or expensive taxi journeys after the metro closes. City officials say the routes can be adjusted after the trial.",
      },
      {
        type: "text",
        text:
          "The full timetable is available at major bus stops and through the city transport app. Tashkent Today will publish a rider's guide with the first reported wait times next week.",
      },
    ],
    cover: NEWS_IMAGES.nightCity,
    region: "Tashkent",
    minutesAgo: 356,
    readMinutes: 2,
    tags: ["Tashkent", "Buses", "Transport"],
  },
];

export const DEMO_FLASHES: NewsFlash[] = [
  {
    id: "flash-metro",
    channelId: "f-newsroom",
    title: "Tashkent announces a late-night metro pilot. Here is what changes first.",
    poster: NEWS_IMAGES.tashkent,
    minutesAgo: 18,
    duration: "0:48",
    views: 34_200,
    category: "Top",
  },
  {
    id: "flash-metro-archive",
    channelId: "f-newsroom",
    title: "First look: the overnight bus routes that connect to the metro.",
    poster: NEWS_IMAGES.nightCity,
    minutesAgo: 1_560,
    duration: "0:41",
    views: 12_350,
    category: "Top",
  },
  {
    id: "flash-sport",
    channelId: "uz-sport",
    title: "Full-time: Uzbekistan 2–1 Jordan. The winning goal, from the touchline.",
    poster: NEWS_IMAGES.sport,
    minutesAgo: 37,
    duration: "0:32",
    views: 81_900,
    category: "Sport",
  },
  {
    id: "flash-market",
    channelId: "world-wire",
    title: "Markets close higher after energy prices retreat.",
    poster: NEWS_IMAGES.market,
    minutesAgo: 64,
    duration: "1:04",
    views: 12_500,
    category: "World",
  },
];

export const DEMO_SHORTS: NewsShort[] = [
  {
    id: "short-tashkent",
    channelId: "tashkent-today",
    caption:
      "A first look at Tashkent's proposed night metro map — and the two lines that would stay open.",
    poster: portrait("photo-1596484552834-6a58f850e0a1"),
    minutesAgo: 21,
    likes: 4_820,
    comments: 168,
    duration: "0:42",
  },
  {
    id: "short-sport",
    channelId: "uz-sport",
    caption:
      "The academy players who could make Pakhtakor's first-team squad this weekend.",
    poster: portrait("photo-1522778119026-d647f0596c20"),
    minutesAgo: 52,
    likes: 9_310,
    comments: 402,
    duration: "0:36",
  },
  {
    id: "short-ai",
    channelId: "tech-uz",
    caption:
      "Why teaching an AI to understand Uzbek is harder than it looks.",
    poster: portrait("photo-1518770660439-4636190af475"),
    minutesAgo: 91,
    likes: 2_740,
    comments: 94,
    duration: "0:51",
  },
  {
    id: "short-climate",
    channelId: "climate-desk",
    caption:
      "One simple change making Tashkent's streets easier to walk in September heat.",
    poster: portrait("photo-1500534623283-312aade485b7"),
    minutesAgo: 146,
    likes: 1_890,
    comments: 61,
    duration: "0:45",
  },
];

export const TRENDING_SEARCHES = ["Metro", "Textile exports", "Uzbek AI", "Pakhtakor", "Heat"];

export function channelById(
  channels: NewsChannel[],
  id: string,
): NewsChannel | null {
  return channels.find((channel) => channel.id === id) ?? null;
}

export function articlesForChannel(articles: NewsArticle[], channelId: string): NewsArticle[] {
  return articles.filter((article) => article.channelId === channelId);
}

export function categoryFromScope(scope: FeedScopeLike): NewsCategory | null {
  if (scope === "local") return "Local";
  return null;
}

type FeedScopeLike = "foryou" | "following" | "local";
