const fs = require('node:fs');
const path = require('node:path');

// Windows Notepad may save a byte order mark, which JSON.parse refuses; the error names the file to fix
function readJson(filePath) {

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`'${filePath}': ${error.message}`);
  }
}


// per-install ids (the sheet and the n8n credentials) differ on every PC, so they live in the gitignored
// install.json; the committed example has them empty and the workflows then ask for them in the n8n editor
function readInstallSettings(folder) {

  const example = readJson(path.join(folder, 'install.example.json'));
  const installPath = path.join(folder, 'install.json');
  if (!fs.existsSync(installPath)) {
    console.warn("no 'install.json': building with empty sheet and credential ids (SETUP.md step 6)");
    return example;
  }
  // a key left out of install.json falls back to the empty example, so that node asks for it in the n8n editor
  const settings = { ...example, ...readJson(installPath) };
  if (!Number.isInteger(Number(settings.sheetTabGid))) {
    throw new Error(`'${installPath}': sheetTabGid must be a whole number (the gid=... in the sheet's link)`);
  }
  return settings;
}

module.exports = { readInstallSettings };
