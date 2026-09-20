<div align="center">

<img src="src-tauri/icons/app.svg" alt="莱茵档案图标" width="80" />

# 莱茵档案 · RHINE ARCHIVE

**记录已知，探索未竟之境。**

莱茵生命风格的 Windows 本地 PDF 阅读器。

[下载已发布版本](https://github.com/Danny731/RHINE-ARCHIVE/releases/latest) · [第三方组件与许可](THIRD_PARTY_NOTICES.md)

</div>

## 功能

- **书架整理**：合集、搜索排序、列表/卡片视图、移除与恢复。
- **多文档阅读**：顶部标签、左右/上下分屏、跨文件对照、独立阅读位置。
- **阅读与导航**：连续/单页/双页、缩放旋转、目录、缩略图、搜索、书签和页码校准。
- **目录管理**：从文字层生成目录、手动编辑、草稿保存和上一版恢复。
- **记录与导出**：高亮、框选、笔记、手写画笔、整笔橡皮擦、撤销/重做、Markdown 笔记及手写 PDF 副本。
- **本地保存**：SQLite 书库、JSON 备份与合并恢复，保存标签布局、进度和阅读资料。

源码包含尚未发布的手写功能和完整程序名称更新；下载版的功能与文件名以对应 Release 为准。

## 使用

从 Releases 下载 Windows x64 安装包或独立程序。需要 Windows 10/11 和 Microsoft Edge WebView2 Runtime；从源码构建的主程序名为 `RHINE ARCHIVE.exe`。目前没有提供 macOS、Linux 或 ARM64 版本。

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

## 从源码运行

需要 Node.js 24。桌面开发还需要 Rust stable MSVC、Microsoft C++ Build Tools、Windows SDK 和 WebView2。

```powershell
git clone https://github.com/Danny731/RHINE-ARCHIVE.git
cd RHINE-ARCHIVE
npm ci
npm run desktop
```

仅预览前端：`npm run dev`，地址为 `http://127.0.0.1:1420`。

## 测试与构建

```powershell
npm test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

端到端测试使用 Microsoft Edge。先运行 `npm run test:fixtures` 生成合成夹具，再保持开发服务运行，在另一终端执行 `npm run test:e2e`。中文夹具使用 Windows 的 `C:/Windows/Fonts/simhei.ttf`。

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
