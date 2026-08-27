// A minimal store-only ZIP writer, ~80 lines, no dependencies.
//
// "Store-only" means no compression — the entries go in verbatim. Level JSON is
// small and this avoids pulling a compression library into what is meant to be
// a double-clickable folder of static files. Every unzip tool reads it.
//
// Used so "Save everything for Godot" produces one file whose inside mirrors
// the project layout (levels/whatever.json), making the drop-in a drag rather
// than a dozen separate downloads.

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

  window.Zip = { build: build, crc32: crc32 };
})();
