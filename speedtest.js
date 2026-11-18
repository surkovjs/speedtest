#!/usr/bin/env node

const REQUEST_COUNT = 10;
const TIMEOUT_MS = 60_000;
const url = process.argv[2];

if (!url) {
  console.error('Usage:   node speedtest.js <url>');
  console.error('Example: node speedtest.js https://upload.wikimedia.org/wikipedia/commons/3/3f/Fronalpstock_big.jpg');
  process.exit(1);
}

try {
  const { protocol } = new URL(url);
  if (protocol !== 'http:' && protocol !== 'https:') throw new Error('only http/https are supported');
} catch (err) {
  console.error(`Invalid URL "${url}": ${err.message}`);
  process.exit(1);
}

/**
 * Делает один полный HTTP-запрос: дожидается полного чтения тела ответа.
 * Тело читается потоком и не хранится в памяти — считаем только байты.
 * Возвращает { elapsedMs, bytes }.
 */
async function measureOnce(url) {
  const start = performance.now();

  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
  }

  return { elapsedMs: performance.now() - start, bytes };
}

// Двоичные единицы: 1 KiB = 1024 B, 1 MiB = 1024 KiB.
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

function formatSpeed(bytesPerSec) {
  // Основная единица — MiB/s. В скобках Mbit/s (10^6 бит/с) — так скорость указывают провайдеры.
  const mibPerSec = bytesPerSec / 1024 ** 2;
  const mbit = (bytesPerSec * 8) / 1e6;
  return `${mibPerSec.toFixed(2)} MiB/s (${mbit.toFixed(2)} Mbit/s)`;
}

async function main() {
  console.log(`URL:        ${url}`);
  console.log(`Requests:   ${REQUEST_COUNT}`);
  console.log('---');

  const results = [];

  // Последовательно, без параллелизма — как в задании.
  for (let i = 1; i <= REQUEST_COUNT; i++) {
    try {
      const r = await measureOnce(url);
      results.push(r);
      console.log(`[${i}/${REQUEST_COUNT}] ${r.elapsedMs.toFixed(2)} ms, ${formatBytes(r.bytes)}`);
    } catch (err) {
      const reason = err.name === 'TimeoutError' ? `timeout after ${TIMEOUT_MS / 1000}s` : (err.cause?.code || err.message);
      console.error(`[${i}/${REQUEST_COUNT}] Failed: ${reason}`);
      process.exit(1);
    }
  }

  const totalMs = results.reduce((s, r) => s + r.elapsedMs, 0);
  const totalBytes = results.reduce((s, r) => s + r.bytes, 0);
  const avgMs = totalMs / results.length;
  const bytesPerSec = totalBytes / (totalMs / 1000);

  console.log('---');
  console.log(`Average request time: ${avgMs.toFixed(2)} ms`);
  console.log(`Total downloaded:     ${formatBytes(totalBytes)}`);
  console.log(`Average speed:        ${formatSpeed(bytesPerSec)}`);
}

main();
