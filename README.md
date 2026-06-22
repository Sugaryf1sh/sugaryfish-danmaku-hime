# Sugaryfish 的弹幕姬

一个面向 Windows 的 Bilibili 直播弹幕悬浮窗。它可以实时接收直播间弹幕，并提供置顶、鼠标穿透、锁定位置、透明度、字号、显示条数和明暗主题等桌面悬浮窗常用控制。

> Crafted by Sugaryfish

## Features

- 实时连接 B 站直播间弹幕服务器
- 显示普通弹幕、礼物、醒目留言、大航海等直播事件
- 支持 SESSDATA，可在可用时获取更完整的用户信息
- 无边框悬浮窗，支持置顶、鼠标穿透和锁定位置
- 支持透明度、字号、最大弹幕条数调节
- 支持 Light / Dark 两套主题
- 支持系统托盘菜单
- 支持免重新安装自动更新，更新后展示本次新特性
- 支持一键打包 Windows 便携版和安装包

## Preview

项目 UI 采用极简杂志排版风格，强调留白、低饱和色彩和精确对齐。你可以在本地运行后查看实际效果。

## Tech Stack

- [Electron](https://www.electronjs.org/)
- Node.js
- WebSocket
- pnpm / Corepack

## Requirements

- Windows 10 或更新版本
- Node.js 18 或更新版本
- Corepack

## Getting Started

```powershell
corepack enable
corepack pnpm install
corepack pnpm run dev
```

## Build

生成 Windows 便携版：

```powershell
corepack pnpm run package:win
```

生成 Windows 安装包：

```powershell
corepack pnpm run package:win
corepack pnpm run installer:win
```

生成免安装自动更新资源包：

```powershell
corepack pnpm run package:win
corepack pnpm run update-package
```

构建结果默认输出到：

- `release/Sugaryfish的弹幕姬-win32-x64/`
- `installer/Sugaryfish的弹幕姬-Setup-1.1.2.exe`
- `updates/Sugaryfish的弹幕姬-App-1.1.2.zip`
- `updates/latest.json`

## Auto Update

自动更新默认采用免重新安装模式：软件会下载 `updates/latest.json` 中声明的轻量应用资源包，用户确认后校验 SHA256，然后退出并替换 `resources/app`，再自动重启。用户设置保存在系统用户数据目录，不会被更新包覆盖。

为了照顾国内网络环境，更新检查会优先尝试 GitHub 文件 CDN：

- `cdn.jsdelivr.net`
- `fastly.jsdelivr.net`
- `gcore.jsdelivr.net`

如果下载地址是 GitHub Release 直链，软件还会自动尝试内置 GitHub 加速节点。无论使用直连、CDN 还是加速节点，更新包都必须通过 SHA256 校验才会应用。

可选环境变量：

- `DANMAKU_UPDATE_MANIFEST_URL`：自定义更新清单地址，多个地址可用英文分号分隔。
- `DANMAKU_UPDATE_MIRROR_PREFIXES`：自定义 GitHub 下载加速前缀，多个地址可用英文分号分隔。
- `DANMAKU_UPDATE_PROXY` / `HTTPS_PROXY`：需要代理时让 Electron 网络请求走指定代理。

## SESSDATA

不填写 SESSDATA 也可以连接公开直播间弹幕。填写后，在 B 站接口允许的情况下，可能获取到更完整的用户信息。

获取方式：

1. 在浏览器登录 Bilibili。
2. 打开 `https://live.bilibili.com` 或 `https://www.bilibili.com`。
3. 按 `F12` 打开开发者工具。
4. 进入 `应用（Application）`。
5. 在左侧 `存储（Storage）` 中找到 `Cookie`。
6. 选择 `https://live.bilibili.com` 或 `https://www.bilibili.com`。
7. 在表格的 `名称（Name）` 列找到 `SESSDATA`。
8. 只复制 `值（Value）`，粘贴到软件里的 SESSDATA 输入框。

SESSDATA 是登录凭据的一部分，请不要公开上传、截图泄露或分享给他人。

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl + Alt + T` | 切换置顶 |
| `Ctrl + Alt + J` | 切换鼠标穿透 |
| `Ctrl + Alt + L` | 切换锁定位置 |

## Project Structure

```text
.
├── assets/                 # 应用图标资源
├── scripts/                # 打包脚本
├── src/
│   ├── main/               # Electron 主进程和 B 站弹幕连接逻辑
│   ├── preload/            # Electron preload
│   ├── renderer/           # 悬浮窗 UI
│   └── shared/             # 默认设置等共享模块
├── electron-builder.yml    # 安装包配置
├── package.json
└── README.md
```

## Privacy

本项目不会主动上传你的 SESSDATA。该值仅用于本地连接 B 站相关接口，并保存在 Electron 的本地用户数据目录中。请自行保管登录凭据。

## Disclaimer

本项目为个人学习和桌面辅助工具项目，非 Bilibili 官方产品。B 站接口和弹幕协议可能调整，若出现连接失败、字段缺失或显示不完整，请以实际接口状态为准。

## License

未指定开源协议。若你计划公开给他人使用，建议后续补充 `LICENSE` 文件。
