<div align="center">

<img src="src-tauri/icons/app.svg" alt="莱茵档案图标" width="80" />

# 莱茵档案 · RHINE ARCHIVE

**记录已知，探索未竟之境。**

莱茵生命风格的本地 PDF 阅读器，支持 Windows 和 Apple Silicon Mac。

[下载已发布版本](https://github.com/Danny731/RHINE-ARCHIVE/releases/latest) · [第三方组件与许可](THIRD_PARTY_NOTICES.md)

</div>

## 功能

- **书架整理**：合集、搜索排序、列表/卡片视图、移除与恢复；真实 PDF 封面和封面页选择。
- **多文档阅读**：顶部标签、左右/上下分屏、跨文件对照、独立阅读位置。
- **阅读与导航**：连续/单页/双页、缩放旋转、目录、缩略图、搜索、书签和页码校准。
- **目录管理**：从文字层生成目录、手动编辑、草稿保存和上一版恢复。
- **记录与导出**：高亮、框选、笔记、手写画笔、整笔橡皮擦、撤销/重做、Markdown 笔记及手写 PDF 副本。
- **本地保存**：SQLite 书库、自动/手动备份与预览恢复，保存标签布局、进度和阅读资料。

v0.5.0 新增自动备份与恢复预览、大 PDF 和分屏性能改进、紧凑阅读界面、同步深色 PDF 页面及真实封面。

请在“设置与备份”底部查看**构建编号**，或点击“复制构建信息”确认具体版本；编号包含构建时间与源码提交标识，复制内容不包含书籍路径或笔记。Release 附件中的 `BUILD-INFO-windows.json` 和 `BUILD-INFO-macos.json` 与对应平台界面使用同一份构建信息；CI 测试包使用 `BUILD-INFO.json`。

## 使用

**普通用户只需下载一个安装包，不需要下载全部附件。**

打开 [Releases 下载页](https://github.com/Danny731/RHINE-ARCHIVE/releases/latest)，按系统选择：

- **Windows 10/11 x64**：下载 `RHINE-ARCHIVE_0.5.0_x64-setup.exe`，双击安装。
- **Mac M 系列，macOS 26.0+**：下载 `RHINE-ARCHIVE_0.5.0_aarch64.dmg`，打开后拖入“应用程序”。

安装包已包含应用文件，不需要下载其他附件。Windows 安装器会检测 WebView2 Runtime，缺失时联网下载并安装；已有兼容运行环境时直接使用。用户无需安装 Node.js、Rust 或开发工具。

Windows 如果希望免安装运行，可以选择 `RHINE-ARCHIVE.exe`，和安装包二选一；独立 exe 不会自动安装 WebView2。`.sig`、`latest.json` 供自动更新使用，无需手动下载；`BUILD-INFO-*.json` 用于识别构建，`SHA256SUMS.txt` 用于可选的文件校验。GitHub 自动显示的 `Source code` 压缩包是开发源码，不是安装包。

主程序名为 `RHINE ARCHIVE.exe`（Windows）或 `RHINE ARCHIVE.app`（Mac）。目前不支持 Intel Mac、Linux 或 Windows ARM64。

### Mac 版（M 系列）

面向 Apple Silicon（M 系列）、macOS 26.0 及以上版本；更高系统版本仍需实测确认。使用系统自带 WebKit，无需 WebView2。安装包与 Windows 版一起提供在 [Releases 下载页](https://github.com/Danny731/RHINE-ARCHIVE/releases/latest)。

打开 DMG，将 RHINE ARCHIVE 拖入“应用程序”后再运行。Mac 包使用临时签名（ad hoc）、未经 Apple 公证；若系统阻止打开，在“系统设置 → 隐私与安全性”查看针对该应用的允许选项。不要关闭系统整体安全保护；如没有允许选项，请保留错误信息反馈。

Mac 用 ⌘O/F/B/W/Z 和 ⌘± 操作，Ctrl+Tab 切换标签；支持触控板捏合缩放正文。关闭红色窗口按钮先保存；若处于全屏，会等系统完成退出全屏后再隐藏窗口，点击 Dock 图标可恢复。应用菜单或 ⌘Q 先保存再退出。退出前请确认“阅读资料已保存”。

Mac 使用手动升级：通过 ⌘Q 正常退出后，替换“应用程序”中的 app。书库在 `~/Library/Application Support/com.pagewise.reader/pagewise.sqlite`，替换 app 不删除书库。Windows JSON 备份可以导入，再重新定位相同 PDF；请另行复制 PDF 原文件。

打开 PDF 后使用顶部工具栏选择、高亮、框选或绘制。「绘制」可选笔色和粗细，橡皮擦删除整笔，抬笔后自动保存。点击笔记面板可记录页笔记。标签可以拖到阅读区边缘分屏，最多显示两个阅读区。

| 快捷键                | 操作                                            |
| --------------------- | ----------------------------------------------- |
| Ctrl+O                | 打开 PDF                                        |
| Ctrl+F                | 搜索当前文档                                    |
| Ctrl+B                | 切换当前页书签                                  |
| Ctrl+Tab / Ctrl+W     | 切换 / 关闭标签                                 |
| Ctrl+加号 / Ctrl+减号 | 放大 / 缩小内容                                 |
| Ctrl+鼠标滚轮         | 缩放鼠标所在阅读区                              |
| Ctrl+Z / Ctrl+Y       | 撤销 / 重做当前文档手写，输入框中仍用于文字编辑 |
| Esc                   | 返回选择工具                                    |

原 PDF 不改写、不默认上传。「导出手写 PDF」生成独立副本，只合成手写笔迹；其他高亮、框选和文字笔记保存在书库，可通过 Markdown/JSON 导出。加密 PDF 暂不支持手写副本导出，画笔暂不支持压感或局部擦除。

## 数据与兼容

书库位于 `%APPDATA%\com.pagewise.reader\pagewise.sqlite`，保护备份位于同目录的 `backups`。数据标识沿用旧值以保留既有阅读资料。JSON 备份不包含 PDF 原文件；迁移到另一台电脑时需另行复制 PDF，路径变化可重新定位同一文件。

关闭标签、删除合集或从书架移除书籍不会删除原 PDF。浏览器预览使用独立的 localStorage/IndexedDB，与桌面书库分开。

### 备份与恢复

“设置与备份”提供本地备份列表、立即备份、预览和导出。资料有变化时，每隔 30 分钟保存一个自动恢复点，保留最近 30 份；手动、升级前和恢复前的保护备份不参与自动清理。未完成的备份写入不会出现在恢复列表中。

导入 JSON 或选择本地备份后，先预览，再选择“合并恢复”或“回退到此备份”。合并保留当前资料，同一条笔记以当前内容为准；回退替换书架和阅读状态。恢复前会保护当前已保存的书库，保护失败则停止恢复。单份导入上限为 64 MB。

读取异常时暂停自动保存，导出会保留原始书库内容，不会以空书架覆盖原数据。保存失败时可导出内存中的最新资料，再重试保存。错误提示会持续显示，并提供不包含书名、文件路径和笔记的可复制诊断摘要。数据库本身无法读取时，会保留原文件并显示错误；已有 JSON 备份仍可从列表导出，不会自动删除或重建原数据库。

本地恢复点与书库保存在同一台设备。迁移设备或保留独立副本时，请另行保存导出的 JSON **和 PDF 原文件**。

### 大文档与分屏

打开 PDF 时优先准备首页和已保存阅读位置的页面尺寸，其余尺寸在后台分批补齐；混合纸张尺寸更新时保持当前阅读位置。视野外页面仅保留轻量占位，正文和缩略图共用两个渲染任务，取消已离开视野的待办任务。单页画布上限为 4,194,304 像素，极大缩放时限制位图分辨率，以控制内存；文字选择和批注坐标保持不变。

重复打开仍在阅读的同一 PDF 会复用解析实例，同文档对照分屏共享解析与页面尺寸。分屏拖动按显示帧合并更新，停止连续调整后再重绘页面。当前仍整份读取 PDF，单文件上限为 512 MB；本轮没有引入分段读取，也不代表扫描件的解码内存受画布上限约束。

### 紧凑阅读界面

阅读页取消独立的品牌和文档标题栏，返回书架与莱茵标志合并到工具栏左侧，文档名称保留在各自的 Tab。右侧「⋯ 应用菜单」提供打开 PDF、主题切换和设置与备份；Tab 旁的「+」和原快捷键继续可用。书架界面保持原布局。

深色模式同时应用于 PDF 正文、分屏两侧与缩略图，切回浅色即恢复原色，无需额外开关或逐本设置。采用整页柔和反色，扫描件也可使用，图片和图表会一起转换；高亮、搜索标记和框选使用适合暗底的显示颜色，手写也随页面调整显示。原 PDF、保存的笔色和导出 PDF 保留原色。此效果仅用于屏幕显示，不改变文件内容。

### PDF 封面

书架默认展示 PDF 第一页，完整保留页面比例；列表使用小封面，深色书架中的封面保留原色。阅读时打开右侧「⋯ 应用菜单」，选择“将当前页设为封面”或“恢复默认封面”。这里使用 PDF 实际页码，不受印刷页码校准影响，也不会修改 PDF 第一页、书签、笔记或阅读进度。

阅读时复用已打开的文档生成封面；旧书只在卡片接近视野时逐份补生成。无法读取或需要密码时显示文字占位，可正常打开/解锁 PDF 后重试。封面图片是本机 WebView 的独立 IndexedDB 缓存，最多保留 100 张、合计 32 MB，清理后可重新生成。JSON 备份仅记录封面页选择，不包含图片缓存或原 PDF。首次保存封面页设置前会保留旧书库的保护备份。

## 从源码运行

需要 Node.js 24。桌面开发还需要 Rust stable MSVC、Microsoft C++ Build Tools、Windows SDK 和 WebView2。

```powershell
git clone https://github.com/Danny731/RHINE-ARCHIVE.git
cd RHINE-ARCHIVE
npm ci
npm run desktop
```

仅预览前端：`npm run dev`，地址为 `http://127.0.0.1:1420`。

Mac 开发需 Node.js 24、Rust 和 Xcode Command Line Tools（`xcode-select --install`），然后同样执行 `npm ci`、`npm run desktop`。M 系列测试包执行 `npm run package:macos`，输出位于 `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/`，无须付费 Apple 开发者账号；当前不生成 Mac 自动更新包。

## 测试与构建

```powershell
npm test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Windows 端到端测试使用 Microsoft Edge。先运行 `npm run test:fixtures` 生成合成夹具，再保持开发服务运行，在另一终端执行 `npm run test:e2e`。中文夹具默认使用 Windows 的 `C:/Windows/Fonts/simhei.ttf`；其他平台可通过 `TEST_CJK_FONT` 指定中文 TTF/OTF。`npx playwright install webkit` 后运行 `npm run test:webkit` 可做 WebKit 回归，浏览器检查不替代原生 Mac 验收。

生成独立程序或本地安装包：

```powershell
node scripts/tauri.mjs build --no-bundle -- --locked
node scripts/tauri.mjs build --bundles nsis -- --locked
```

程序输出到 `src-tauri/target/release/RHINE ARCHIVE.exe`，安装包位于 `src-tauri/target/release/bundle/nsis/`。Windows 安装器保留原安装身份，以兼容既有安装与书库。

应用内更新使用 HTTPS 清单和签名安装包。维护者执行 `npm run package` 需提供原更新签名私钥；可通过 `TAURI_SIGNING_PRIVATE_KEY` 指定密钥、`RHINE_RELEASE_NOTES_FILE` 指定对外版本说明。`npm run release:prepare` 仅整理程序、安装器、签名、更新清单和校验值，不打包本地开发文档。仓库不包含密钥、个人书库、开发记录或构建产物。

## 当前边界

单个 PDF 上限为 512 MB，整份读取，两份大型扫描件同时打开可能占用较多内存。没有 OCR 引擎；扫描件可阅读、框选、手写及手动建目录。自动目录依赖可读文字层，复杂排版需人工核对。暂不支持修改 PDF 原有排版文字、云同步或窗口外拖拽。

本项目为非官方工具，与《明日方舟》官方无隶属关系；相关名称和标志权利归各自权利人所有，详情见第三方说明。
