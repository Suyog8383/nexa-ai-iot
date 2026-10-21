import { asc, eq, sql } from 'drizzle-orm';

import type { Database } from '../../db/client';
import { devices, type DeviceRow } from '../../db/schema';

type Db = Database['db'];

export type NewDeviceRow = Pick<DeviceRow, 'id' | 'name' | 'room' | 'board' | 'sensor' | 'reportingIntervalS' | 'tokenHash'>;

export async function insertDevice(db: Db, row: NewDeviceRow): Promise<DeviceRow> {
  const [created] = await db.insert(devices).values(row).returning();
  if (!created) throw new Error('insert returned no row');
  return created;
}

export function listDevices(db: Db): Promise<DeviceRow[]> {
  return db.select().from(devices).orderBy(asc(devices.createdAt), asc(devices.id));
}

export async function findDevice(db: Db, id: string): Promise<DeviceRow | null> {
  const [row] = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
  return row ?? null;
}

/** Replaces the token hash; the previous token stops working as soon as this commits. */
export async function replaceTokenHash(db: Db, id: string, tokenHash: Buffer): Promise<DeviceRow | null> {
  const [row] = await db
    .update(devices)
    .set({ tokenHash, tokenRotatedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(devices.id, id))
    .returning();
  return row ?? null;
}
