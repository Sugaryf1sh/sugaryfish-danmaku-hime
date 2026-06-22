# Sugaryfish Danmaku Hime 1.1.3 Update Bridge

This bridge is for users whose 1.1.3 app closes during auto-update but still stays on 1.1.3.

## How to use

1. Extract the bridge zip.
2. Double-click `修复1.1.3自动更新.cmd`.
3. Wait until it shows `Bridge repair succeeded`.
4. The app will restart automatically.

If Windows blocks writing to the install directory, right-click the `.cmd` file and choose "Run as administrator".

## What it does

- Finds the installed app directory.
- Downloads or uses the bundled latest resource package.
- Verifies SHA256 before replacing anything.
- Backs up the old `resources/app` directory.
- Replaces app resources and verifies the installed version.
- Verifies the repaired app still contains the latest update pipeline:
  update status IPC, visible progress banner, mirror download fallback, and result notes.
- Restarts the app.

Logs are written to `%TEMP%\sugaryfish-danmaku-bridge`.
