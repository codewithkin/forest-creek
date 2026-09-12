import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { hashPassword } from "better-auth/crypto";

config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

import { env } from "@forest-creek/env/server";
import prisma from "@forest-creek/db";

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
    description:
      "Swim under the canopy and settle in for golden-hour drinks at the bar.",
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
    image: "/media/vumba-drive.webp",
    sortOrder: 4,
  },
];

async function seedRoomsAndActivities() {
  for (const room of rooms) {
    await prisma.room.upsert({
      where: { tier: room.tier },
      update: room,
      create: room,
    });
  }
  for (const activity of activities) {
    const { slug, ...data } = activity;
    await prisma.activity.upsert({
      where: { slug },
      update: data,
      create: activity,
    });
  }
  console.log(`Seeded ${rooms.length} rooms and ${activities.length} activities.`);
}

async function seedAdmin() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.log("ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin creation.");
    return;
  }

  const passwordHash = await hashPassword(env.ADMIN_PASSWORD);
  const existing = await prisma.user.findUnique({ where: { email: env.ADMIN_EMAIL } });

  if (existing) {
    await prisma.user.update({
      where: { email: env.ADMIN_EMAIL },
      data: { role: "admin" },
    });
    await prisma.account.updateMany({
      where: { providerId: "credential", userId: existing.id },
      data: { password: passwordHash },
    });
    console.log(`Admin updated: ${env.ADMIN_EMAIL}`);
  } else {
    const id = randomUUID();
    await prisma.user.create({
      data: {
        id,
        name: "Thembie",
        email: env.ADMIN_EMAIL,
        emailVerified: true,
        role: "admin",
      },
    });
    await prisma.account.create({
      data: {
        id: randomUUID(),
        userId: id,
        providerId: "credential",
        issuer: "local:credential",
        accountId: id,
        password: passwordHash,
      },
    });
    console.log(`Admin created: ${env.ADMIN_EMAIL}`);
  }
}

async function main() {
  await seedRoomsAndActivities();
  await seedAdmin();
}

main()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });