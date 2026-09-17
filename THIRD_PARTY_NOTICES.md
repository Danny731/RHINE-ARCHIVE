# 第三方组件说明

页间使用以下主要组件。表格用于说明来源，组件仍适用各自许可证；这不是对项目源码另行授予许可证。

| 组件                | 用途                    | 项目来源                                                                       |
| ------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| React / React DOM   | 界面与交互              | https://github.com/facebook/react                                              |
| Tauri               | 桌面窗口、IPC 与打包    | https://github.com/tauri-apps/tauri                                            |
| Tauri plugins       | 文件对话框、单实例启动  | https://github.com/tauri-apps/plugins-workspace                                |
| PDF.js              | PDF 解析、渲染和文字层  | https://github.com/mozilla/pdf.js                                              |
| Lucide              | 界面图标                | https://github.com/lucide-icons/lucide                                         |
| rusqlite / SQLite   | 本地数据库              | https://github.com/rusqlite/rusqlite / https://sqlite.org/                     |
| Vite / TypeScript   | 前端开发与构建          | https://github.com/vitejs/vite / https://github.com/microsoft/TypeScript       |
| Vitest / Playwright | 自动化测试与文档截图    | https://github.com/vitest-dev/vitest / https://github.com/microsoft/playwright |
| pdf-lib / fontkit   | 原创示例与测试 PDF 生成 | https://github.com/Hopding/pdf-lib / https://github.com/Hopding/fontkit        |

前端主要运行时组件的许可证副本存放于 [docs/licenses](docs/licenses)。完整依赖和精确版本分别记录在 `package-lock.json` 与 `src-tauri/Cargo.lock`，传递依赖以各自软件包附带的许可证为准。

`public/sample.pdf` 的教学内容和项目图标由本项目编写、绘制。文档截图使用该原创示例及自制测试夹具，不包含用户的真实教材内容。

中文测试脚本读取开发电脑上的系统字体，只在本地生成测试夹具；操作系统字体文件和这些测试 PDF 不包含在源码仓库或发布附件中。
