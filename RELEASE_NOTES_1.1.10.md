# Sugaryfish 的弹幕姬 1.1.10 测试版

## 更新亮点

- 修复自动更新确认后只关闭、不替换的问题，改用更稳定的 Windows Start-Process 启动更新器。
- 修复更新清单被 CDN 旧缓存污染的问题，每次检查都会绕过 latest.json 缓存。
