import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { db, jadwalLab, eq, ilike, and, or, desc, asc, sql } from '@jadwal/db';
import { httpLogger, log } from './logger';

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
  .use(httpLogger)
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

          if (query.search) {
            const s = `%${query.search.trim()}%`;
            conditions.push(
              or(
                ilike(jadwalLab.mataKuliah, s),
                ilike(jadwalLab.dosen, s),
                ilike(jadwalLab.kodeKelas, s),
                ilike(jadwalLab.ruangan, s)
              )
            );
          }

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
            conditions.push(ilike(jadwalLab.kodeKelas, `%${query.kodeKelas}%`));
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
          const roomFilter = query.ruangan || query.ruangLabor;
          if (roomFilter) {
            conditions.push(ilike(jadwalLab.ruangan, `%${roomFilter}%`));
          }

          const limit = Math.min(query.limit ?? 50, 200);
          const offset = query.offset ?? 0;

          const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

          const [items, totalResult] = await Promise.all([
            db
              .select()
              .from(jadwalLab)
              .where(whereClause)
              .orderBy(asc(jadwalLab.waktuMulai), asc(jadwalLab.id))
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
            search: t.Optional(t.String()),
            hari: t.Optional(t.String()),
            tanggal: t.Optional(t.String()),
            dosen: t.Optional(t.String()),
            kampus: t.Optional(t.String()),
            kodeKelas: t.Optional(t.String()),
            mataKuliah: t.Optional(t.String()),
            ruangan: t.Optional(t.String()),
            ruangLabor: t.Optional(t.String()),
            status: t.Optional(t.String()),
            limit: t.Optional(t.Numeric({ default: 50, minimum: 1, maximum: 200 })),
            offset: t.Optional(t.Numeric({ default: 0, minimum: 0 })),
          }),
        }
      )
      .get(
        '/jadwal/summary',
        async ({ query }) => {
          const conditions = [];

          if (query.search && query.search.trim() !== '') {
            const s = `%${query.search.trim()}%`;
            conditions.push(
              or(
                ilike(jadwalLab.mataKuliah, s),
                ilike(jadwalLab.dosen, s),
                ilike(jadwalLab.kodeKelas, s),
                ilike(jadwalLab.ruangan, s)
              )
            );
          }

          if (query.hari && query.hari !== 'Semua') {
            conditions.push(eq(jadwalLab.hari, query.hari));
          }

          if (query.tanggal && query.tanggal !== 'Semua' && query.tanggal.trim() !== '') {
            conditions.push(ilike(jadwalLab.tanggal, `%${query.tanggal.trim()}%`));
          }

          if (query.kampus && query.kampus !== 'Semua') {
            conditions.push(eq(jadwalLab.kampus, query.kampus));
          }

          const roomFilter = query.ruangan || query.ruangLabor;
          if (roomFilter && roomFilter !== 'Semua') {
            conditions.push(ilike(jadwalLab.ruangan, `%${roomFilter}%`));
          }

          const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

          const [totalCount, campuses, rooms, statusCounts] = await Promise.all([
            db
              .select({ count: sql<number>`count(*)::int` })
              .from(jadwalLab)
              .where(whereClause),
            db
              .selectDistinct({ kampus: jadwalLab.kampus })
              .from(jadwalLab)
              .where(sql`${jadwalLab.kampus} IS NOT NULL AND ${jadwalLab.kampus} != ''`),
            db
              .selectDistinct({ ruangan: jadwalLab.ruangan })
              .from(jadwalLab)
              .where(sql`${jadwalLab.ruangan} IS NOT NULL AND ${jadwalLab.ruangan} != ''`),
            db
              .select({
                status: jadwalLab.status,
                count: sql<number>`count(*)::int`,
              })
              .from(jadwalLab)
              .where(whereClause)
              .groupBy(jadwalLab.status),
          ]);

          const roomNames = rooms.map((r) => r.ruangan);

          let totalTatapMuka = 0;
          let totalOnline = 0;
          let totalCancel = 0;

          for (const item of statusCounts) {
            const s = item.status?.toLowerCase() || '';
            if (s.includes('tm') || s.includes('tatap muka')) {
              totalTatapMuka += item.count;
            } else if (s.includes('ol') || s.includes('online')) {
              totalOnline += item.count;
            } else if (s.includes('cancel') || s.includes('batal')) {
              totalCancel += item.count;
            }
          }

          return {
            success: true,
            data: {
              totalJadwal: totalCount[0]?.count ?? 0,
              totalTatapMuka,
              totalOnline,
              totalCancel,
              kampusList: campuses.map((c) => c.kampus),
              ruanganList: roomNames,
              ruangLaborList: roomNames,
            },
          };
        },
        {
          query: t.Object({
            tanggal: t.Optional(t.String()),
            hari: t.Optional(t.String()),
            kampus: t.Optional(t.String()),
            ruangan: t.Optional(t.String()),
            ruangLabor: t.Optional(t.String()),
            search: t.Optional(t.String()),
          }),
        }
      )
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
      .post(
        '/auth/login',
        async ({ body, set }) => {
          const expectedSecret =
            process.env.ASLAB_SECRET_CODE || process.env.ADMIN_PASSWORD
          const { secretCode } = body;

          if (!secretCode || secretCode !== expectedSecret) {
            set.status = 401;
            return {
              success: false,
              message: 'Secret code tidak valid. Akses ditolak.',
            };
          }

          const timestamp = Date.now();
          const token = Buffer.from(`aslab:${timestamp}`).toString('base64');

          return {
            success: true,
            message: 'Login berhasil sebagai Asisten Laboratorium',
            data: {
              token,
              role: 'aslab',
              authenticatedAt: new Date().toISOString(),
            },
          };
        },
        {
          body: t.Object({
            secretCode: t.String(),
          }),
        }
      )
      .get('/auth/verify', async ({ headers, set }) => {
        const authHeader = headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          set.status = 401;
          return {
            success: false,
            message: 'Sesi tidak ditemukan atau kadaluarsa',
          };
        }

        const token = authHeader.replace('Bearer ', '').trim();
        try {
          const decoded = Buffer.from(token, 'base64').toString('utf-8');
          if (!decoded.startsWith('aslab:')) {
            set.status = 401;
            return {
              success: false,
              message: 'Sesi tidak valid',
            };
          }

          return {
            success: true,
            authenticated: true,
            role: 'aslab',
          };
        } catch {
          set.status = 401;
          return {
            success: false,
            message: 'Sesi tidak valid',
          };
        }
      })
  )
  .listen({
    port: PORT,
    hostname: HOST,
  });

log.success(`🚀 ElysiaJS server is running at http://${app.server?.hostname}:${app.server?.port}`);

export type App = typeof app;
