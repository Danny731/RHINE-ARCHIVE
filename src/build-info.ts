import type { BuildInfo } from "../scripts/build-info";

export const buildInfo: BuildInfo = __RHINE_BUILD_INFO__;
export const buildSummary = [
  "RHINE ARCHIVE",
  `版本：${buildInfo.version}`,
  `构建：${buildInfo.number}`,
  `渠道：${buildInfo.channel === "release" ? "正式版" : buildInfo.channel === "test" ? "测试版" : "开发预览"}`,
  `平台：${buildInfo.platform} / ${buildInfo.architecture}`,
  `源码：${buildInfo.revision}${buildInfo.modified ? "（包含本地修改）" : ""}`,
  `时间：${buildInfo.builtAt}`,
].join("\n");
