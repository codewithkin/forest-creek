import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

import prisma from "@forest-creek/db";
import { ensureAdmin } from "./ensure-admin";

const property = {
  slug: "forest-creek",
  name: "Forest Creek Lodge",
  tagline: "Where Nature Meets Luxury",
  description:
    "An eco-conscious retreat in the Vumba highlands above Mutare, where the cloud comes down through the trees most afternoons and the evenings smell of woodsmoke.",
  location: "261 Rhine Farm, Lower Vumba, Mutare, Zimbabwe",
  phone: "+263 71 995 6882",
  email: "admin@forestcreek.co.zw",
  heroImage: "/media/canopy-pool.webp",
  gallery: [
    "/media/executive-suite.webp",
    "/media/ensuite-bathroom.webp",
    "/media/family-room.webp",
    "/media/garden-braai.webp",
  ],
  amenities: ["Forest setting", "Canopy pool", "Garden braai", "Bar & lounge", "Kids play area"],
  sortOrder: 1,
};

const rooms = [
  {
    tier: "executive",
    name: "Executive Suite",
    description:
      "A statement of quiet luxury — an arched leather headboard against a polished marble feature wall, deep-teal accents and brass-lit nights.",
    pricePerNight: 180,
    capacity: 2,
    bedType: "King",
    amenities: [
      "Marble feature wall",
      "Arched leather headboard",
      "En-suite bath & walk-in shower",
    ],
    image: "/media/executive-suite.webp",
    images: [
      "/media/executive-suite.webp",
      "/media/ensuite-bathroom.webp",
      "/media/lodge-bar.webp",
      "/media/canopy-pool.webp",
    ],
    sortOrder: 1,
  },
  {
    tier: "family",
    name: "Family Room",
    description:
      "Room to breathe together — generous space, warm timbers and a tufted leather headboard the whole family can gather around.",
    pricePerNight: 140,
    capacity: 4,
    bedType: "1 Queen + 2 Single beds",
    amenities: ["Full-length mirrored wardrobe", "En-suite bathroom", "Braai terrace access"],
    image: "/media/family-room.webp",
    images: [
      "/media/family-room.webp",
      "/media/ensuite-bathroom.webp",
      "/media/garden-braai.webp",
      "/media/kids-play-area.webp",
    ],
    sortOrder: 2,
  },
  {
    tier: "standard",
    name: "Standard Room",
    description:
      "Cozy forest comfort — crisp linens, warm wood and a window onto the green canopy of the Vumba.",
    pricePerNight: 90,
    capacity: 2,
    bedType: "Queen",
    amenities: ["Forest-facing window", "Warm timber furnishings", "En-suite shower"],
    image: "/media/standard-room.webp",
    images: [
      "/media/standard-room.webp",
      "/media/ensuite-bathroom.webp",
      "/media/forest-walk.webp",
    ],
    sortOrder: 3,
  },
];

const activities = [
  {
    slug: "garden-braai",
    name: "Garden Braai Night",
    description:
      "A classic Zimbabwean braai under the stars on the lawn, with the mist rolling over the Vumba.",
    price: 25,
    currency: "USD",
    image: "/media/garden-braai.webp",
    sortOrder: 1,
  },
  {
    slug: "guided-forest-walk",
    name: "Guided Forest Walk",
    description: "Walk the misty forest trails around the lodge with a local guide.",
    price: 15,
    currency: "USD",
    image: "/media/forest-walk.webp",
    sortOrder: 2,
  },
  {
    slug: "canopy-pool",
    name: "Canopy Pool & Golden Hour",
    description: "Swim under the canopy and settle in for golden-hour drinks at the bar.",
    price: 10,
    currency: "USD",
    image: "/media/canopy-pool.webp",
    sortOrder: 3,
  },
  {
    slug: "vumba-mountain-drive",
    name: "Scenic Vumba Mountain Drive",
    description:
      "A drive through the green mountains — viewpoints, forest reserves and birding stops.",
    price: 40,
    currency: "USD",
    image: "/media/forest-walk.webp",
    sortOrder: 4,
  },
  // price 0 means included in the stay — the shape a free experience takes.
  {
    slug: "jumping-castle",
    name: "Jumping Castle",
    description: "Set up on the lawn for the children, at no extra charge while you are with us.",
    price: 0,
    currency: "USD",
    image: "/media/kids-play-area.webp",
    sortOrder: 5,
  },
];

async function seedProperty() {
  const { slug, ...data } = property;
  const record = await prisma.property.upsert({
    where: { slug },
    update: data,
    create: { slug, ...data },
  });

  for (const room of rooms) {
    await prisma.room.upsert({
      where: { propertyId_tier: { propertyId: record.id, tier: room.tier } },
      update: room,
      create: { ...room, propertyId: record.id },
    });
  }

  for (const activity of activities) {
    const { slug: activitySlug, ...rest } = activity;
    await prisma.activity.upsert({
      where: { propertyId_slug: { propertyId: record.id, slug: activitySlug } },
      update: rest,
      create: { ...activity, propertyId: record.id },
    });
  }

  console.log(
    `Seeded ${record.name} with ${rooms.length} rooms and ${activities.length} activities.`,
  );
  return record;
}

async function seedAdmin() {
  await ensureAdmin();
}

async function main() {
  await seedProperty();
  await seedAdmin();
}

main()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
