import { deflateRawSync } from 'node:zlib';

export type ZipArchiveEntry = {
  name: string;
  data: Buffer;
};

type CentralDirectoryEntry = {
  name: Buffer;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  offset: number;
};

const CRC32_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function normalizeZipName(name: string) {
  return name
    .replaceAll('\\', '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

function localFileHeader(entry: CentralDirectoryEntry) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(entry.compressedSize, 18);
  header.writeUInt32LE(entry.uncompressedSize, 22);
  header.writeUInt16LE(entry.name.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function centralDirectoryHeader(entry: CentralDirectoryEntry) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(8, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(0, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.compressedSize, 20);
  header.writeUInt32LE(entry.uncompressedSize, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.offset, 42);
  return header;
}

function endOfCentralDirectory(entryCount: number, centralDirectorySize: number, centralDirectoryOffset: number) {
  const header = Buffer.alloc(22);
  header.writeUInt32LE(0x06054b50, 0);
  header.writeUInt16LE(0, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(entryCount, 8);
  header.writeUInt16LE(entryCount, 10);
  header.writeUInt32LE(centralDirectorySize, 12);
  header.writeUInt32LE(centralDirectoryOffset, 16);
  header.writeUInt16LE(0, 20);
  return header;
}

export function createZipArchive(entries: ZipArchiveEntry[]) {
  const fileParts: Buffer[] = [];
  const centralEntries: CentralDirectoryEntry[] = [];
  let offset = 0;

  for (const entry of entries) {
    const normalizedName = normalizeZipName(entry.name);
    if (!normalizedName) {
      continue;
    }

    const name = Buffer.from(normalizedName);
    const compressed = deflateRawSync(entry.data);
    const centralEntry: CentralDirectoryEntry = {
      name,
      crc: crc32(entry.data),
      compressedSize: compressed.length,
      uncompressedSize: entry.data.length,
      offset,
    };
    const header = localFileHeader(centralEntry);
    fileParts.push(header, name, compressed);
    centralEntries.push(centralEntry);
    offset += header.length + name.length + compressed.length;
  }

  const centralDirectoryOffset = offset;
  const centralParts = centralEntries.flatMap((entry) => [centralDirectoryHeader(entry), entry.name]);
  const centralDirectorySize = centralParts.reduce((total, part) => total + part.length, 0);

  return Buffer.concat([
    ...fileParts,
    ...centralParts,
    endOfCentralDirectory(centralEntries.length, centralDirectorySize, centralDirectoryOffset),
  ]);
}
