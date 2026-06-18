const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const releaseRoot = path.join(root, "release");
const productName = "Sugaryfish的弹幕姬";
const outDir = path.join(releaseRoot, `${productName}-win32-x64`);
const appDir = path.join(outDir, "resources", "app");
const electronDist = path.join(root, "node_modules", ".pnpm", "electron@33.4.11", "node_modules", "electron", "dist");
const wsDir = path.dirname(require.resolve("ws/package.json", { paths: [root] }));
const rcedit = path.join(root, "node_modules", ".pnpm", "rcedit@3.1.0", "node_modules", "rcedit", "bin", "rcedit-x64.exe");

function rm(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function mkdir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function copyFile(src, dest) {
  mkdir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest, filter = () => true) {
  mkdir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (!filter(srcPath, entry)) continue;
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, filter);
    } else if (entry.isFile()) {
      copyFile(srcPath, destPath);
    }
  }
}

function writeJson(file, value) {
  mkdir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

if (!fs.existsSync(electronDist)) {
  throw new Error(`Electron runtime not found: ${electronDist}`);
}

rm(outDir);
mkdir(appDir);
copyDir(electronDist, outDir);

copyDir(path.join(root, "src"), path.join(appDir, "src"));
copyDir(path.join(root, "assets"), path.join(appDir, "assets"));
copyFile(path.join(root, "README.md"), path.join(appDir, "README.md"));

writeJson(path.join(appDir, "package.json"), {
  name: "danmaku-hime",
  productName,
  version: "0.1.0",
  description: "B站直播弹幕悬浮窗",
  main: "src/main/main.js",
  private: true,
  dependencies: {
    ws: "^8.18.0"
  }
});

copyDir(wsDir, path.join(appDir, "node_modules", "ws"), (srcPath, entry) => {
  if (entry.isDirectory()) {
    return !["test", "bench", ".github"].includes(entry.name);
  }
  return ![".npmignore", ".travis.yml"].includes(entry.name);
});

const electronExe = path.join(outDir, "electron.exe");
const appExe = path.join(outDir, `${productName}.exe`);
if (fs.existsSync(appExe)) fs.unlinkSync(appExe);
fs.renameSync(electronExe, appExe);

if (fs.existsSync(rcedit)) {
  execFileSync(rcedit, [appExe, "--set-icon", path.join(root, "assets", "icon.ico"), "--set-version-string", "FileDescription", productName, "--set-version-string", "ProductName", productName, "--set-version-string", "CompanyName", "Sugaryfish", "--set-version-string", "LegalCopyright", "Copyright 2026 Sugaryfish"], { stdio: "inherit" });
}

console.log(outDir);
