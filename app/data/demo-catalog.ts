import { euros } from "~/domain/money";
import type { AdviceArticle, PackagingPreset, Product } from "~/domain/types";

type DemoProductInput = {
  id: string;
  slug: string;
  country: string;
  name: string;
  producer: string;
  region: string;
  variety: string;
  process: string;
  altitude: number;
  notes: string[];
  price200: number;
  price1000: number;
  image: string;
  descriptionFr: string;
  descriptionEn: string;
  featured?: boolean;
};

const inputs: DemoProductInput[] = [
  {
    id: "colombia-el-recreo",
    slug: "colombie-el-recreo",
    country: "Colombie",
    name: "El Recreo",
    producer: "Alirio Rodriguez",
    region: "Acevedo, Huila",
    variety: "Caturrón",
    process: "Honey",
    altitude: 1550,
    notes: ["Pêche", "Mûre blanche", "Thé noir"],
    price200: 1300,
    price1000: 5850,
    image: "https://www.zencoffeelab.com/wp-content/uploads/2026/05/Adola-P.jpeg",
    descriptionFr: "Une tasse fruitée et douce, portée par une acidité d’agrumes et une finale délicate de thé noir.",
    descriptionEn: "A soft, fruit-forward cup with citrus acidity and a delicate black-tea finish.",
  },
  {
    id: "ethiopia-aricha",
    slug: "ethiopie-aricha-station",
    country: "Éthiopie",
    name: "Aricha",
    producer: "Faysel Abdosh et 350 petits exploitants",
    region: "Yirgacheffe, Aricha",
    variety: "Heirloom",
    process: "Nature anaérobique 168 h",
    altitude: 2100,
    notes: ["Fraise", "Myrtille", "Fruits tropicaux"],
    price200: 1800,
    price1000: 8100,
    image: "https://www.zencoffeelab.com/wp-content/uploads/2026/05/Aricha-P.jpeg",
    descriptionFr: "Une fermentation contrôlée pour une tasse explosive, intensément fruitée et parfaitement nette.",
    descriptionEn: "A controlled fermentation yielding an explosive, intensely fruity and beautifully clean cup.",
    featured: true,
  },
  {
    id: "ethiopia-adola",
    slug: "ethiopie-adola",
    country: "Éthiopie",
    name: "Adola",
    producer: "Israel Degfa et 1500 petits exploitants",
    region: "Arusi, Oromia",
    variety: "74110",
    process: "Lavé",
    altitude: 2400,
    notes: ["Pêche", "Pamplemousse", "Baies sauvages"],
    price200: 1300,
    price1000: 5850,
    image: "https://www.zencoffeelab.com/wp-content/uploads/2026/05/Adola-P.jpeg",
    descriptionFr: "La maturation lente en altitude révèle une tasse complexe, vive, florale et particulièrement élégante.",
    descriptionEn: "Slow high-altitude maturation reveals a complex, bright, floral and particularly elegant cup.",
    featured: true,
  },
  {
    id: "colombia-santa-barbara",
    slug: "colombie-santa-barbara",
    country: "Colombie",
    name: "Santa Barbara",
    producer: "Finca Santa Barbara / Area 18",
    region: "La Marquesa, Cauca",
    variety: "Bourbon rose",
    process: "Honey jaune",
    altitude: 1950,
    notes: ["Reine-claude", "Litchi", "Violette"],
    price200: 1500,
    price1000: 6750,
    image: "https://www.zencoffeelab.com/wp-content/uploads/2026/05/Santa-Barbara-P.jpeg",
    descriptionFr: "Une tasse complexe mêlant fruits verts, sucrosité tropicale et une finale florale persistante.",
    descriptionEn: "A complex cup combining green fruit, tropical sweetness and a persistent floral finish.",
    featured: true,
  },
  {
    id: "panama-finca-lorayne",
    slug: "panama-finca-lorayne",
    country: "Panama",
    name: "Finca Lorayne",
    producer: "Elia Lorayne Rosas",
    region: "Chiriquí, Boquete",
    variety: "Pacamara",
    process: "Lavé",
    altitude: 1700,
    notes: ["Abricot", "Amande", "Orange confite"],
    price200: 1300,
    price1000: 5850,
    image: "https://www.zencoffeelab.com/wp-content/uploads/2026/05/Lorayne-P.jpeg",
    descriptionFr: "Un Pacamara nuancé, doux et onctueux, entre épices, fruits jaunes et agrumes confits.",
    descriptionEn: "A nuanced, silky Pacamara balancing spice, yellow fruit and candied citrus.",
  },
  {
    id: "peru-el-laurel",
    slug: "perou-el-laurel",
    country: "Pérou",
    name: "El Laurel",
    producer: "José Rivera",
    region: "Jaén, Cajamarca",
    variety: "Inca Geisha",
    process: "Lavé",
    altitude: 1700,
    notes: ["Poire", "Citronnelle", "Fleur de cerisier"],
    price200: 1800,
    price1000: 8100,
    image: "https://www.zencoffeelab.com/wp-content/uploads/2026/05/El-Laurel-P.jpeg",
    descriptionFr: "Un Geisha élégant, très floral et juteux, à la finale fondante de pêche blanche.",
    descriptionEn: "An elegant, highly floral and juicy Geisha with a melting white-peach finish.",
    featured: true,
  },
  {
    id: "kenya-kaiguri",
    slug: "kenya-kaiguri-ab",
    country: "Kenya",
    name: "Kaiguri AB",
    producer: "Mutheka Farmers Coop",
    region: "Kaiguri, Nyeri",
    variety: "Ruiru 11, SL28, SL34",
    process: "Lavé",
    altitude: 1800,
    notes: ["Fraise", "Groseille", "Hibiscus"],
    price200: 1500,
    price1000: 6750,
    image: "https://www.zencoffeelab.com/wp-content/uploads/2026/05/Kaiguri-P.jpeg",
    descriptionFr: "Toute la richesse des cafés kényans : fruits rouges, texture beurrée et floralité persistante.",
    descriptionEn: "The richness of Kenyan coffee: red fruit, a buttery texture and a lasting floral character.",
    featured: true,
  },
];

export const demoProducts: Product[] = inputs.map((input) => {
  const displayFr = `${input.country} — ${input.name}`;
  const countryEn = ({ Éthiopie: "Ethiopia", Colombie: "Colombia", Pérou: "Peru" } as Record<string, string>)[input.country] ?? input.country;
  const displayEn = `${countryEn} — ${input.name}`;
  return {
    id: input.id,
    slug: input.slug,
    status: "published",
    altitudeMeters: input.altitude,
    featured: input.featured ?? false,
    translations: {
      "fr-FR": {
        locale: "fr-FR",
        name: displayFr,
        shortDescription: input.descriptionFr,
        body: input.descriptionFr,
        producer: input.producer,
        region: input.region,
        variety: input.variety,
        process: input.process,
        tastingNotes: input.notes,
        seoTitle: `${displayFr} | Café de spécialité`,
        seoDescription: input.descriptionFr,
      },
      "en-GB": {
        locale: "en-GB",
        name: displayEn,
        shortDescription: input.descriptionEn,
        body: input.descriptionEn,
        producer: input.producer,
        region: input.region,
        variety: input.variety,
        process: input.process,
        tastingNotes: input.notes,
        seoTitle: `${displayEn} | Specialty coffee`,
        seoDescription: input.descriptionEn,
      },
    },
    media: [
      {
        id: `${input.id}-pack`,
        url: input.image,
        alt: { "fr-FR": `Paquet de café ${displayFr}`, "en-GB": `${displayEn} coffee bag` },
        width: 1300,
        height: 1300,
        position: 0,
      },
    ],
    variants: [
      {
        id: `${input.id}-200g`,
        sku: `${input.id.toUpperCase()}-200`,
        label: "200 g",
        weightGrams: 200,
        internalCostCents: 0,
        stockOnHand: 24,
        stockReserved: 0,
        lowStockThreshold: 5,
        hsCode: "090121",
        customsOriginCountry: "FR",
        offers: [
          { id: `${input.id}-200-retail`, audience: "retail", price: euros(input.price200), minimumQuantity: 1, active: true },
        ],
      },
      {
        id: `${input.id}-1000g`,
        sku: `${input.id.toUpperCase()}-1000`,
        label: "1 kg",
        weightGrams: 1000,
        internalCostCents: 0,
        stockOnHand: 16,
        stockReserved: 0,
        lowStockThreshold: 4,
        hsCode: "090121",
        customsOriginCountry: "FR",
        offers: [
          { id: `${input.id}-1000-retail`, audience: "retail", price: euros(input.price1000), minimumQuantity: 1, active: true },
          { id: `${input.id}-1000-pro`, audience: "professional", price: euros(input.price1000), minimumQuantity: 5, active: true },
        ],
      },
    ],
  };
});

export const demoPackagingPresets: PackagingPreset[] = [
  { id: "box-s", name: "Carton S", maxNetWeightGrams: 1_000, tareWeightGrams: 180, lengthCm: 24, widthCm: 18, heightCm: 10, active: true },
  { id: "box-m", name: "Carton M", maxNetWeightGrams: 5_000, tareWeightGrams: 420, lengthCm: 38, widthCm: 28, heightCm: 22, active: true },
  { id: "box-l", name: "Carton L", maxNetWeightGrams: 20_000, tareWeightGrams: 900, lengthCm: 58, widthCm: 38, heightCm: 38, active: true },
];

export const demoArticles: AdviceArticle[] = [
  {
    slug: "recette-extraction-v60",
    publishedAt: "2026-03-20",
    title: { "fr-FR": "Recette d’extraction pour V60", "en-GB": "A V60 brewing recipe" },
    excerpt: {
      "fr-FR": "Une base simple pour révéler la clarté et la douceur d’un café légèrement torréfié.",
      "en-GB": "A simple starting point to reveal the clarity and sweetness of a lightly roasted coffee.",
    },
    body: {
      "fr-FR": ["Utilisez 15 g de café pour 250 g d’eau, moulus juste avant l’extraction.", "Versez en quatre étapes avec une eau douce à 94 °C, pour un temps total proche de trois minutes."],
      "en-GB": ["Use 15 g of coffee for 250 g of water, ground immediately before brewing.", "Pour in four stages with soft water at 94°C, aiming for a total brew time close to three minutes."],
    },
  },
  {
    slug: "importance-de-leau",
    publishedAt: "2026-03-12",
    title: { "fr-FR": "De l’importance de l’eau", "en-GB": "Why water matters" },
    excerpt: {
      "fr-FR": "L’eau compose l’essentiel de la tasse ; sa minéralité transforme radicalement l’extraction.",
      "en-GB": "Water makes up most of the cup; its mineral content can transform extraction completely.",
    },
    body: {
      "fr-FR": ["Une eau trop dure masque l’acidité et les arômes fins, tandis qu’une eau trop douce peut produire une tasse creuse.", "Commencez par une eau faiblement minéralisée et ajustez ensuite la recette."],
      "en-GB": ["Water that is too hard masks acidity and delicate flavours, while very soft water may taste hollow.", "Start with lightly mineralised water and adjust the recipe from there."],
    },
  },
];
