// A minimal, dependency-free ZIP reader/writer built on node:zlib.
//
// The build used to shell out to `zip` and `unzip`, which do not exist on
// Windows. Doing it in-process instead makes the toolchain work identically on
// every platform, and lets us pin the timestamps so builds are reproducible.
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';

// Fixed DOS timestamp (1980-01-01). Real timestamps would make two builds of
// identical bytes hash differently, and they cost space in the archive.
const DOS_TIME = 0;
const DOS_DATE = 33;

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

export const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

/**
 * Write a ZIP containing `files` ([{ name, data }]), deflated.
 * ect/advzip recompress this afterwards; this just has to be a valid archive.
 */
export const writeZip = (path, files) => {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of files) {
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = deflateRawSync(body, { level: 9 });
    // Fall back to STORED if deflate made it bigger (tiny files can).
    const stored = deflated.length >= body.length;
    const payload = stored ? body : deflated;
    const method = stored ? 0 : 8;
    const crc = crc32(body);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);          // version needed
    lh.writeUInt16LE(0, 6);           // flags
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(DOS_TIME, 10);
    lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(payload.length, 18);
    lh.writeUInt32LE(body.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);          // extra length
    locals.push(lh, nameBuf, payload);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);          // version made by
    cd.writeUInt16LE(20, 6);          // version needed
    cd.writeUInt16LE(0, 8);           // flags
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(DOS_TIME, 12);
    cd.writeUInt16LE(DOS_DATE, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(payload.length, 20);
    cd.writeUInt32LE(body.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);          // extra
    cd.writeUInt16LE(0, 32);          // comment
    cd.writeUInt16LE(0, 34);          // disk number
    cd.writeUInt16LE(0, 36);          // internal attrs
    cd.writeUInt32LE(0, 38);          // external attrs
    cd.writeUInt32LE(offset, 42);     // local header offset
    central.push(cd, nameBuf);

    offset += lh.length + nameBuf.length + payload.length;
  }

  const localBuf = Buffer.concat(locals);
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);                    // this disk
  eocd.writeUInt16LE(0, 6);                    // disk with central dir
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);
  eocd.writeUInt16LE(0, 20);                   // comment length

  writeFileSync(path, Buffer.concat([localBuf, centralBuf, eocd]));
};

/**
 * Read every entry out of a ZIP. Handles STORED and DEFLATE, which covers
 * anything ect or advzip produce.
 */
export const readZip = (path) => {
  const buf = readFileSync(path);

  // Locate the end-of-central-directory record by scanning back for its signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 65558; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file: no end-of-central-directory record');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt central directory');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    // The local header's own name/extra lengths are authoritative for the
    // data offset - they can differ from the central directory's.
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);

    out.push({ name, data: method === 0 ? Buffer.from(raw) : inflateRawSync(raw) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
};
