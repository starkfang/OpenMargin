'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

// Readers see either the previous complete file or the new complete file.
async function atomicWrite(file, contents, io = fs) {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
  try {
    await io.writeFile(temporary, contents, {flag:'wx', mode:0o600});
    await io.rename(temporary, file);
  } finally {
    await io.unlink(temporary).catch(() => {});
  }
}
module.exports = {atomicWrite};
