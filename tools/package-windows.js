// Puts the Windows build together and makes the installer with NSIS.
// Run after "neu build --release" (npm run package:windows does both).
// Needs NSIS (makensis) installed: https://nsis.sourceforge.io  (on Linux/macOS: apt install nsis / brew install makensis)
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const root = path.join(__dirname, ".."), inst = path.join(root, "installer", "windows");
const version = String(JSON.parse(fs.readFileSync(path.join(root, "app", "neutralino.config.json"), "utf8")).version).split(".")[0];

const copy = (from, to) => fs.copyFileSync(path.join(root, from), path.join(inst, to));
copy("app/bin/neutralino-win_x64.exe", "Citekeep.exe");           // the Neutralino engine, unmodified
copy("app/dist/Citekeep/resources.neu", "resources.neu");           // Citekeep itself
copy("LICENSE.txt", "LICENSE.txt");
copy("THIRD-PARTY-NOTICES.txt", "THIRD-PARTY-NOTICES.txt");

// keep the installer's version in step with app/neutralino.config.json
const nsi = path.join(inst, "citekeep.nsi");
fs.writeFileSync(nsi, fs.readFileSync(nsi, "utf8").replace(/V\d+/g, "V" + version).replace(/"\d+\.0\.0"/, `"${version}.0.0"`));

execFileSync("makensis", ["-V2", "citekeep.nsi"], { cwd: inst, stdio: "inherit" });
console.log(`Made installer/windows/Citekeep Setup V${version}.exe`);
