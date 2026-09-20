# 第三方组件说明

莱茵档案 / RHINE ARCHIVE 使用以下主要组件。表格用于说明来源，组件仍适用各自许可证；这不是对项目源码另行授予许可证。

| 组件                | 用途                                   | 项目来源                                                                       |
| ------------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| React / React DOM   | 界面与交互                             | https://github.com/facebook/react                                              |
| Tauri               | 桌面窗口、IPC 与打包                   | https://github.com/tauri-apps/tauri                                            |
| Tauri plugins       | 文件对话框、单实例启动                 | https://github.com/tauri-apps/plugins-workspace                                |
| PDF.js              | PDF 解析、渲染和文字层                 | https://github.com/mozilla/pdf.js                                              |
| Lucide              | 界面图标                               | https://github.com/lucide-icons/lucide                                         |
| rusqlite / SQLite   | 本地数据库                             | https://github.com/rusqlite/rusqlite / https://sqlite.org/                     |
| Vite / TypeScript   | 前端开发与构建                         | https://github.com/vitejs/vite / https://github.com/microsoft/TypeScript       |
| Vitest / Playwright | 自动化测试与文档截图                   | https://github.com/vitest-dev/vitest / https://github.com/microsoft/playwright |
| pdf-lib / fontkit   | 手写 PDF 导出、原创示例与测试 PDF 生成 | https://github.com/Hopding/pdf-lib / https://github.com/Hopding/fontkit        |

前端主要运行时组件的许可证副本存放于 [public/licenses/dependencies](public/licenses/dependencies)。完整依赖和精确版本分别记录在 `package-lock.json` 与 `src-tauri/Cargo.lock`，传递依赖以各自软件包附带的许可证为准。

Windows 自定义安装器模板来自 [Tauri CLI 2.11.4](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.4/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi)，按其 MIT 许可使用，[许可副本](src-tauri/windows/TAURI-LICENSE-MIT)随源码保留。修改说明位于模板顶部及兼容注册表定义旁。

`public/sample.pdf` 的教学内容由本项目编写。文档截图使用该原创示例及自制测试夹具，不包含用户的真实教材内容。当前应用图标使用下述莱茵生命标志矢量复刻路径。

中文测试脚本读取开发电脑上的系统字体，只在本地生成测试夹具；操作系统字体文件和这些测试 PDF 不包含在源码仓库或发布附件中。

## 莱茵生命标志与视觉参考

用户指定使用莱茵生命 Logo，并参考 [LBEILC/RhineLabUI](https://github.com/LBEILC/RhineLabUI) 的档案终端风格。界面使用的 [public/brand/rhine-lab-mark.svg](public/brand/rhine-lab-mark.svg) 路径来自其 [src/brand.ts](https://github.com/LBEILC/RhineLabUI/blob/17a16118f31b55b7156b68e89b6fe989408351f0/src/brand.ts)。相关代码版权为 Copyright (c) 2026 LBEILC，MIT 许可副本位于 [public/licenses/RhineLabUI-LICENSE.txt](public/licenses/RhineLabUI-LICENSE.txt)，随应用离线资源打包。

《明日方舟》及莱茵生命名称、标志的权利归各自权利人所有，上游代码许可不替代标志授权。本应用与官方无隶属关系。用户随后要求将应用图标也换为该 Logo，现已用于 `src-tauri/icons/app.svg` 及生成的 ICO/PNG/ICNS、移动端图标文件；浏览器图标源为 `public/brand/app-icon.svg`。底板与适配排版由本项目制作，内置历史示例 PDF 保持原样。

档案盒装饰使用本项目编写的 CSS，无上游 GLB、音效或字体依赖。界面使用本机系统字体，不需要联网加载资源。
