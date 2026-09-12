import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { db, jadwalLab, eq, ilike, and, desc, sql } from '@jadwal/db';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const HOST = process.env.HOST || '0.0.0.0';

export const app = new Elysia()
  .use(
    cors({
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: true,
    })
  )
  .get('/', () => ({
    success: true,
    message: 'Jadwal Kuliah UNAMA API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  }))
  .group('/api', (api) =>
    api
      .get(
        '/jadwal',
        async ({ query }) => {
          const conditions = [];

          if (query.hari) {
            conditions.push(eq(jadwalLab.hari, query.hari));
          }
          if (query.tanggal) {
            conditions.push(eq(jadwalLab.tanggal, query.tanggal));
          }
          if (query.kampus) {
            conditions.push(eq(jadwalLab.kampus, query.kampus));
          }
          if (query.kodeKelas) {
            conditions.push(eq(jadwalLab.kodeKelas, query.kodeKelas));
          }
          if (query.status) {
            conditions.push(eq(jadwalLab.status, query.status));
          }
          if (query.dosen) {
            conditions.push(ilike(jadwalLab.dosen, `%${query.dosen}%`));
          }
          if (query.mataKuliah) {
            conditions.push(ilike(jadwalLab.mataKuliah, `%${query.mataKuliah}%`));
          }
          if (query.ruangLabor) {
            conditions.push(ilike(jadwalLab.ruangLabor, `%${query.ruangLabor}%`));
          }

          const limit = Math.min(query.limit ?? 50, 200);
          const offset = query.offset ?? 0;

          const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

          const [items, totalResult] = await Promise.all([
            db
              .select()
              .from(jadwalLab)
              .where(whereClause)
              .orderBy(desc(jadwalLab.id))
              .limit(limit)
              .offset(offset),
            db
              .select({ count: sql<number>`count(*)::int` })
              .from(jadwalLab)
              .where(whereClause),
          ]);

          const total = totalResult[0]?.count ?? 0;

          return {
            success: true,
            pagination: {
              total,
              limit,
              offset,
              hasMore: offset + items.length < total,
            },
            data: items,
          };
        },
        {
          query: t.Object({
            hari: t.Optional(t.String()),
            tanggal: t.Optional(t.String()),
            dosen: t.Optional(t.String()),
            kampus: t.Optional(t.String()),
            kodeKelas: t.Optional(t.String()),
            mataKuliah: t.Optional(t.String()),
            ruangLabor: t.Optional(t.String()),
            status: t.Optional(t.String()),
            limit: t.Optional(t.Numeric({ default: 50, minimum: 1, maximum: 200 })),
            offset: t.Optional(t.Numeric({ default: 0, minimum: 0 })),
          }),
        }
      )
      .get('/jadwal/summary', async () => {
        const [totalCount, campuses, rooms] = await Promise.all([
          db.select({ count: sql<number>`count(*)::int` }).from(jadwalLab),
          db
            .selectDistinct({ kampus: jadwalLab.kampus })
            .from(jadwalLab)
            .where(sql`${jadwalLab.kampus} IS NOT NULL AND ${jadwalLab.kampus} != ''`),
          db
            .selectDistinct({ ruangLabor: jadwalLab.ruangLabor })
            .from(jadwalLab)
            .where(sql`${jadwalLab.ruangLabor} IS NOT NULL AND ${jadwalLab.ruangLabor} != ''`),
        ]);

        return {
          success: true,
          data: {
            totalJadwal: totalCount[0]?.count ?? 0,
            kampusList: campuses.map((c) => c.kampus),
            ruangLaborList: rooms.map((r) => r.ruangLabor),
          },
        };
      })
      .get(
        '/jadwal/:id',
        async ({ params: { id }, set }) => {
          const [item] = await db
            .select()
            .from(jadwalLab)
            .where(eq(jadwalLab.id, id))
            .limit(1);

          if (!item) {
            set.status = 404;
            return {
              success: false,
              message: `Jadwal dengan ID ${id} tidak ditemukan`,
            };
          }

          return {
            success: true,
            data: item,
          };
        },
        {
          params: t.Object({
            id: t.Numeric(),
          }),
        }
      )
  )
  .listen({
    port: PORT,
    hostname: HOST,
  });

console.log(`🚀 ElysiaJS server is running at http://${app.server?.hostname}:${app.server?.port}`);

export type App = typeof app;
