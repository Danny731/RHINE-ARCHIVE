<div align="center">

<img src="src-tauri/icons/app.svg" alt="莱茵档案图标" width="80" />

# 莱茵档案 · Rhine Archive

**记录已知，探索未竟之境。**

Windows 本地 PDF 阅读器：书架合集、多标签、跨文件分屏、目录、标注与笔记。

当前版本：**v0.3.0**。

[下载](https://github.com/Danny731/RHINE-ARCHIVE/releases/latest) · [使用指南](docs/USER_GUIDE.md) · [开发说明](docs/DEVELOPMENT.md) · [更新记录](CHANGELOG.md)

</div>

![莱茵档案书架，使用合成演示记录](design/rhine-implementation/library-light.png)

## 阅读与整理

| 场景 | 功能 |
| --- | --- |
| 整理书籍 | 本地书架、卡片/列表、合集、多合集归类、搜索、排序、移除与恢复 |
| 同时查阅 | 顶部多标签、拖拽排序、左右/上下分屏、跨文件对照、可调比例 |
| 继续阅读 | 标签布局、页码、页内位置、缩放、旋转、跳转历史和笔记草稿恢复 |
| 导航 | PDF 目录、自动/手动目录、缩略图、书签、搜索、印刷页码校准 |
| 记录 | 文字高亮、区域框选、页笔记、标注附注、Markdown 导出 |
| 保存 | SQLite 本地保存、JSON 备份与合并恢复、版本/更新/扩展字段写入前备份 |
| 界面 | 莱茵档案主题、莱茵生命 Logo、深浅色、小窗口布局、Ctrl 加减/滚轮缩放 |

![内置原创示例的双区阅读](design/rhine-implementation/reader-light.png)

原 PDF 不改写、不默认上传。关闭标签不删书；删除合集或从书架移除不删除原 PDF、笔记和进度。最多两个阅读区、50 个标签，仅加载可见 PDF。详情见 [工作区说明](docs/WORKSPACE.md) 和 [UI 主题](docs/UI_THEME.md)。

## 下载与升级

在 [Releases](https://github.com/Danny731/RHINE-ARCHIVE/releases/latest) 下载 v0.3.0。仓库当前保持私有，下载需有访问权限的 GitHub 账号。

| 文件 | 用途 |
| --- | --- |
| Pagewise_0.3.0_x64-setup.exe | Windows x64 安装程序，推荐 |
| Pagewise.exe | 独立运行程序，无需开发服务 |
| Pagewise_0.3.0_x64-setup.exe.sig | 安装包的更新签名 |
| latest.json | 应用内更新清单 |
| Pagewise-docs-v0.3.0.zip | 指南、开发说明与设计/验证资料 |
| USER_GUIDE.md | 独立使用指南 |
| SHA256SUMS.txt | 下载文件 SHA-256 校验值 |

支持 Windows 10/11 x64，需要 Microsoft Edge WebView2 Runtime。没有提供 macOS、Linux 或 ARM64 版本。

首次安装或无法在线升级时，请手动下载当前版本。已有书库无需重新导入；文件路径失效时可重新定位同一 PDF。

v0.3.0 在“设置与备份 → 软件更新”提供检查、下载、签名校验及保存备份后安装。**仓库保持私有时，应用内匿名检查无法读取更新源**；程序不内置 GitHub 凭据。公开仓库且有更高版本发布后才可正常在线升级。直接运行版通过安装器升级会转为安装版，原独立 exe 不原地替换。规则见 [更新说明](docs/UPDATES.md)。

## 本地数据与兼容

- 数据库：%APPDATA%\com.pagewise.reader\pagewise.sqlite。
- 保护备份：同一目录的 backups 子目录，保存原始书库 JSON。
- JSON 备份包含书籍路径、阅读资料、合集和工作区，不包含 PDF 文件。
- 同一 PDF 重新选择位置时保留关联；内容不匹配不会静默替换旧笔记。
- 浏览器开发预览使用独立 localStorage / IndexedDB，不与桌面库共享。

## 从源码运行

准备 Node.js 24、Rust stable MSVC、Microsoft C++ Build Tools 与 Windows SDK、WebView2，然后运行：

```powershell
git clone https://github.com/Danny731/RHINE-ARCHIVE.git
cd RHINE-ARCHIVE
npm ci
npm run desktop
```

前端预览使用 npm run dev。正式签名打包使用 npm run package，需原更新签名私钥；它不包含在仓库中。生成与整理发布资产见 [开发说明](docs/DEVELOPMENT.md)。新设备或新协作者先读 [AGENTS.md](AGENTS.md) 和 [交接清单](docs/HANDOFF.md)。

## 验证与边界

v0.3.0 发布检查覆盖 46 项前端单元测试、22 项浏览器场景、5 项默认 Rust 测试及本次安装包签名/篡改拒绝检查。包含旧书库、合集、笔记归属、标签恢复、500 页文件、中文和深浅色/小窗口场景。浏览器与模型检查不等同于真实 Windows 安装覆盖升级或全部教材验证；原生安装升级仍需用户确认。

- 单个 PDF 上限 512 MB，整体读入；两份大扫描件同时显示可能占用较多内存。
- 无新 OCR 引擎；纯图片扫描件可阅读、框选和手动建目录。
- 自动目录支持文字层、双栏及部分 OCR 数字纠错，复杂排版仍需核对。
- 标注和自建目录保存在本机数据库，暂不写回 PDF。
- 无窗口外拖拽、多窗口、同步滚动、云同步、打印、手写或 AI 问答。

[架构](docs/ARCHITECTURE.md) · [后续计划](docs/ROADMAP.md) · [第三方组件与标志说明](THIRD_PARTY_NOTICES.md)
