import { Elysia } from 'elysia';

// ANSI escape codes for clean terminal styling
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function getTimestamp(): string {
  return timeFormatter.format(new Date());
}

function colorizeStatus(status: number): string {
  if (status >= 500) return `${c.red}${c.bold}${status}${c.reset}`;
  if (status >= 400) return `${c.yellow}${c.bold}${status}${c.reset}`;
  if (status >= 300) return `${c.cyan}${c.bold}${status}${c.reset}`;
  if (status >= 200) return `${c.green}${c.bold}${status}${c.reset}`;
  return `${c.gray}${c.bold}${status}${c.reset}`;
}

function colorizeMethod(method: string): string {
  const m = method.toUpperCase();
  let color = c.gray;
  switch (m) {
    case 'GET':
      color = c.cyan;
      break;
    case 'POST':
      color = c.green;
      break;
    case 'PUT':
    case 'PATCH':
      color = c.yellow;
      break;
    case 'DELETE':
      color = c.red;
      break;
    case 'OPTIONS':
    case 'HEAD':
      color = c.gray;
      break;
    default:
      color = c.magenta;
  }
  return `${color}${c.bold}${m.padEnd(7)}${c.reset}`;
}

function colorizeDuration(ms: number): string {
  const text = ms < 1 ? '<1ms' : `${ms.toFixed(1)}ms`;
  let color = c.green;
  if (ms >= 500) {
    color = c.red;
  } else if (ms >= 150) {
    color = c.yellow;
  }
  return `${color}${text}${c.reset}`;
}

function getClientIp(request: Request, server?: any): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }
  if (server && typeof server.requestIP === 'function') {
    const socketIp = server.requestIP(request)?.address;
    if (socketIp) return socketIp;
  }
  return '-';
}

function parseStatusCode(status: unknown): number {
  if (typeof status === 'number') return status;
  if (typeof status === 'string') {
    const parsed = parseInt(status, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return 200;
}

const requestStartTimes = new WeakMap<Request, number>();

/**
 * Custom HTTP Logger Plugin for ElysiaJS
 * Automatically logs incoming path accesses, status codes, methods, durations, and client IPs.
 */
export const httpLogger = new Elysia({ name: 'http-logger' })
  .onRequest(({ request }) => {
    requestStartTimes.set(request, performance.now());
  })
  .onAfterResponse({ as: 'global' }, ({ request, set, server }) => {
    const startTime = requestStartTimes.get(request);
    const duration = startTime ? performance.now() - startTime : 0;
    const timeStr = getTimestamp();
    const status = parseStatusCode(set.status);
    const url = new URL(request.url);
    const fullPath = url.pathname + url.search;
    const ip = getClientIp(request, server);

    const logLine = [
      `${c.gray}[${timeStr} WIB]${c.reset}`,
      colorizeStatus(status),
      colorizeMethod(request.method),
      `${c.white}${fullPath}${c.reset}`,
      colorizeDuration(duration),
      ip !== '-' ? `${c.dim}(${ip})${c.reset}` : '',
    ]
      .filter(Boolean)
      .join(' ');

    console.log(logLine);
  })
  .onError({ as: 'global' }, ({ request, code, error }) => {
    // Standard 404 route not found is already handled by onAfterResponse
    if (code !== 'NOT_FOUND') {
      const timeStr = getTimestamp();
      const url = new URL(request.url);
      console.error(
        `${c.red}${c.bold}[ERROR] [${timeStr} WIB]${c.reset} ${c.yellow}${request.method} ${url.pathname}${url.search}${c.reset}`
      );
      console.error(
        `  ${c.red}↳ [${code}]${c.reset} ${error instanceof Error ? error.message : String(error)}`
      );
      if (process.env.NODE_ENV !== 'production' && error instanceof Error && error.stack) {
        const stackLines = error.stack
          .split('\n')
          .slice(1, 4)
          .map((line) => `    ${c.gray}${line.trim()}${c.reset}`)
          .join('\n');
        if (stackLines) {
          console.error(stackLines);
        }
      }
    }
  });

/**
 * General application logger utility for manual logging in services or handlers
 */
export const log = {
  info: (msg: string, ...args: any[]) => {
    console.log(
      `${c.gray}[${getTimestamp()} WIB]${c.reset} ${c.cyan}${c.bold}[INFO]${c.reset} ${msg}`,
      ...args
    );
  },
  success: (msg: string, ...args: any[]) => {
    console.log(
      `${c.gray}[${getTimestamp()} WIB]${c.reset} ${c.green}${c.bold}[SUCCESS]${c.reset} ${msg}`,
      ...args
    );
  },
  warn: (msg: string, ...args: any[]) => {
    console.warn(
      `${c.gray}[${getTimestamp()} WIB]${c.reset} ${c.yellow}${c.bold}[WARN]${c.reset} ${msg}`,
      ...args
    );
  },
  error: (msg: string, ...args: any[]) => {
    console.error(
      `${c.gray}[${getTimestamp()} WIB]${c.reset} ${c.red}${c.bold}[ERROR]${c.reset} ${msg}`,
      ...args
    );
  },
};
