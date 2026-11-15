const fs = require('node:fs');
const path = require('node:path');

// per-install ids (the sheet and the n8n credentials) differ on every PC, so they live in the gitignored
// install.json; the committed example has them empty and the workflows then ask for them in the n8n editor
function readInstallSettings(folder) {

  const installPath = path.join(folder, 'install.json');
  if (fs.existsSync(installPath)) return JSON.parse(fs.readFileSync(installPath, 'utf8'));
  console.warn("no 'install.json': building with empty sheet and credential ids (SETUP.md step 6)");
  return JSON.parse(fs.readFileSync(path.join(folder, 'install.example.json'), 'utf8'));
}

module.exports = { readInstallSettings };
