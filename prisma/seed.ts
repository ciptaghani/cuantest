import { PrismaClient, type Menu } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DEFAULT_BRANDS, DEFAULT_COA, DEFAULT_PACKS, WAREHOUSES } from './seed-data';

const prisma = new PrismaClient();
const ALL_MENUS: Menu[] = ['MARKETPLACE', 'MARKETING', 'OPS', 'FINANCE', 'CS', 'DATA'];

// Seed idempotent: aman dijalankan berulang, tidak menimpa data yang sudah diubah user.
async function main() {
  for (const [i, w] of WAREHOUSES.entries()) {
    await prisma.warehouse.upsert({
      where: { code: w.code },
      update: {},
      create: { code: w.code, name: w.name, sortOrder: i },
    });
  }
  const main = await prisma.warehouse.findUniqueOrThrow({ where: { code: WAREHOUSES[0].code } });
  await prisma.appConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, mainWarehouseId: main.id, salesWarehouseId: main.id },
  });

  for (const a of DEFAULT_COA) {
    await prisma.account.upsert({
      where: { code: a.code },
      update: { isSystem: true },
      create: { ...a, isSystem: true },
    });
  }

  if ((await prisma.pack.count()) === 0) {
    await prisma.pack.createMany({ data: DEFAULT_PACKS });
  }

  for (const b of DEFAULT_BRANDS) {
    await prisma.brand.upsert({ where: { name: b.name }, update: {}, create: b });
  }

  const username = process.env.SEED_ADMIN_USERNAME;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error('SEED_ADMIN_USERNAME dan SEED_ADMIN_PASSWORD wajib diisi di .env');
  }
  if (password.length < 10) throw new Error('SEED_ADMIN_PASSWORD minimal 10 karakter');
  const existing = await prisma.user.findUnique({ where: { username } });
  if (!existing) {
    await prisma.user.create({
      data: {
        name: process.env.SEED_ADMIN_NAME || 'Admin',
        username,
        passwordHash: await bcrypt.hash(password, 12),
        role: 'ADMIN',
        permissions: { create: ALL_MENUS.map((menu) => ({ menu })) },
      },
    });
  }

  console.log(
    `Seed selesai: ${WAREHOUSES.length} gudang, ${DEFAULT_COA.length} akun, kemasan, ${DEFAULT_BRANDS.length} brand, admin "${username}"${existing ? ' (sudah ada, tidak diubah)' : ''}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
