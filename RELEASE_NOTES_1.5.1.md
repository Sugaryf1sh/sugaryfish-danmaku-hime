# Sugaryfish 的弹幕姬 1.5.1

- 修复 1.5.0 更新包内 `app/package.json` 被发布脚本转码破坏后，旧版客户端无法完成免安装更新的问题。
- 新增失败版本自动更新熔断：同一目标版本更新失败后，启动自动检查不再反复弹窗；远端出现更高版本时自动恢复提示。
- 加固发布脚本：生成更新包后强制用旧版 Windows PowerShell 解析包内 `app/package.json`，验证版本号和发布日期，避免坏包再次发布。

Update package SHA256: `a2117b727d13c3ec54823d1bf566d35ae53f170d71a5f3242b84e8dde20ca91a`
