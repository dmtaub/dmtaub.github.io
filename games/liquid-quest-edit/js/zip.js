// A minimal ZIP writer and reader, no dependencies.
//
// The writer is store-only — no compression, entries go in verbatim. Level JSON
// is small and this avoids pulling a compression library into what is meant to
// be a double-clickable folder of static files. Every unzip tool reads it. The
// reader takes those back, plus deflated entries where the browser can inflate
// them for us.
//
// Used so "Save project" produces one file whose inside mirrors the project
// layout (levels/whatever.json), making the drop-in a drag rather than a dozen
// separate downloads — and so "Open project" can take that same file back.

(function () {
  "use strict";

  const CRC_TABLE = (function () {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  // DOS date/time, which is what the ZIP header wants.
  function dosTime(date) {
    return ((date.getHours() << 11) | (date.getMinutes() << 5)
      | (date.getSeconds() / 2)) & 0xffff;
  }
  function dosDate(date) {
    return (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5)
      | date.getDate()) & 0xffff;
  }

  function u16(v) { return [v & 0xff, (v >>> 8) & 0xff]; }
  function u32(v) {
    return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  }

  // files: [{ name: "levels/x.json", text: "..." }]
  //     or [{ name: "art/backgrounds/x.png", bytes: Uint8Array }]
  //
  // Bytes exist because imported background pictures ride along in the same
  // zip as the levels that use them; store-only means a PNG goes in verbatim,
  // which is what it already is.
  function build(files) {
    const encoder = new TextEncoder();
    const now = new Date();
    const chunks = [];
    const central = [];
    let offset = 0;

    files.forEach(function (file) {
      const nameBytes = encoder.encode(file.name);
      const dataBytes = file.bytes || encoder.encode(file.text);
      const crc = crc32(dataBytes);
      const time = dosTime(now);
      const date = dosDate(now);

      const local = [].concat(
        u32(0x04034b50),      // local file header signature
        u16(20),              // version needed
        u16(0),               // flags
        u16(0),               // method 0 = stored
        u16(time), u16(date),
        u32(crc),
        u32(dataBytes.length), // compressed size
        u32(dataBytes.length), // uncompressed size
        u16(nameBytes.length),
        u16(0)                 // extra field length
      );

      chunks.push(new Uint8Array(local), nameBytes, dataBytes);

      central.push({
        nameBytes: nameBytes,
        crc: crc,
        size: dataBytes.length,
        time: time,
        date: date,
        offset: offset,
      });

      offset += local.length + nameBytes.length + dataBytes.length;
    });

    const centralStart = offset;
    let centralSize = 0;

    central.forEach(function (entry) {
      const header = [].concat(
        u32(0x02014b50),      // central directory signature
        u16(20), u16(20),     // version made by / needed
        u16(0), u16(0),       // flags / method
        u16(entry.time), u16(entry.date),
        u32(entry.crc),
        u32(entry.size), u32(entry.size),
        u16(entry.nameBytes.length),
        u16(0), u16(0),       // extra / comment length
        u16(0),               // disk number
        u16(0), u32(0),       // internal / external attrs
        u32(entry.offset)
      );
      chunks.push(new Uint8Array(header), entry.nameBytes);
      centralSize += header.length + entry.nameBytes.length;
    });

    const end = [].concat(
      u32(0x06054b50),
      u16(0), u16(0),
      u16(central.length), u16(central.length),
      u32(centralSize), u32(centralStart),
      u16(0)
    );
    chunks.push(new Uint8Array(end));

    return new Blob(chunks, { type: "application/zip" });
  }

  // ------------------------------------------------------------------ read
  // The other half of build(): "Open project" takes the zip that "Save project"
  // wrote, so the editor can hand someone a file and take it back again.
  //
  // Reads the central directory rather than walking local headers — a local
  // header is allowed to carry zeroed sizes (flag bit 3, sizes in a trailing
  // descriptor), and the central directory never is. Store-only is what this
  // writer emits; a zip re-made by another tool is usually deflated, so method
  // 8 goes through the browser's own inflater where there is one, and says so
  // plainly where there isn't.
  //
  // Async on every path, so the store-only case doesn't become a different
  // sort of call from the deflated one.
  //
  // Returns {files: [{name, bytes}], problems: [sentence, ...]}.
  async function read(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const end = findEndRecord(view);
    if (end < 0) {
      return { files: [], problems: ["That doesn't look like a zip file."] };
    }

    const count = view.getUint16(end + 10, true);
    let offset = view.getUint32(end + 16, true);
    const files = [];
    const problems = [];

    for (let i = 0; i < count; i++) {
      if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
        problems.push("The zip's contents list is damaged.");
        break;
      }
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const name = decodeName(bytes.subarray(offset + 46, offset + 46 + nameLength));
      offset += 46 + nameLength + extraLength + commentLength;

      // A folder entry: no bytes, nothing to give back.
      if (/\/$/.test(name)) continue;

      // The local header's own name and extra lengths are what say where the
      // data starts; they are allowed to differ from the central copy's.
      const localName = view.getUint16(localOffset + 26, true);
      const localExtra = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localName + localExtra;
      const raw = bytes.subarray(start, start + compressedSize);

      if (method === 0) {
        files.push({ name: name, bytes: raw.slice() });
        continue;
      }
      if (method === 8 && typeof window.DecompressionStream === "function") {
        try {
          files.push({ name: name, bytes: await inflateRaw(raw) });
        } catch (err) {
          problems.push(name + " is compressed in a way this browser couldn't open.");
        }
        continue;
      }
      problems.push(name + " is compressed (zip method " + method + ") and this "
        + "editor only reads uncompressed zips. Unzip it and open the folder instead.");
    }

    return { files: files, problems: problems };
  }

  async function inflateRaw(raw) {
    const stream = new window.DecompressionStream("deflate-raw");
    const out = await new Response(
      new Blob([raw]).stream().pipeThrough(stream)).arrayBuffer();
    return new Uint8Array(out);
  }

  // Scanned backwards: the end record is last, but a zip comment can follow it.
  function findEndRecord(view) {
    const min = Math.max(0, view.byteLength - 22 - 0xffff);
    for (let i = view.byteLength - 22; i >= min; i--) {
      if (view.getUint32(i, true) === 0x06054b50) return i;
    }
    return -1;
  }

  function decodeName(nameBytes) {
    try {
      return new TextDecoder("utf-8").decode(nameBytes);
    } catch (err) {
      let out = "";
      for (let i = 0; i < nameBytes.length; i++) out += String.fromCharCode(nameBytes[i]);
      return out;
    }
  }

  window.Zip = { build: build, read: read, inflateRaw: inflateRaw, crc32: crc32 };
})();
