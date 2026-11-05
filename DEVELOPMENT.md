# 「补」开发与 AI 交接说明

本文面向接手项目的开发者或 AI。产品使用方式见 [README.md](README.md)，历史交接背景见 [HANDOFF.md](HANDOFF.md)。

## 项目概览

- 应用名：补
- 包名：`com.quitsmoke.app`
- 当前版本：5.6
- 最低 Android：API 24
- Target SDK：34
- 仓库：`bgwfsj/bu-app`（公开）
- 架构：单 Activity WebView + 本地 HTML/CSS/JS + Android 原生通知桥接
- 数据：仅 `localStorage`，无账号、无后端、无云同步

## 开始开发

首先阅读：

1. `src/index.template.html`
2. `src/js/00-core.js`
3. `src/js/40-navigation.js`
4. `src/js/70-todo.js`
5. `src/js/75-reminder.js`
6. `src/js/80-ledger.js`
7. `QuitSmokeApp/app/src/main/java/com/quitsmoke/app/`

不要直接编辑生成的 `quit-app.html` 或 `QuitSmokeApp/app/src/main/assets/index.html`。

## 目录

```text
src/
  index.template.html       页面结构和模块占位符
  styles/                   CSS，按页面拆分
  js/                       JS，按业务拆分
_tools/
  build.mjs                 src → quit-app.html
  check.js                  语法、占位符和内联事件检查
  test.mjs                  Chrome 无头自动回归
  verify.ps1                构建 + 检查 + 测试
QuitSmokeApp/               Android 工程
quit-app.html               生成的单文件，仍然提交到 Git
README.md                   用户说明
DEVELOPMENT.md              本文件
HANDOFF.md                  历史交接与排障补充
assets/source-art/          图标源图
_local-data/                本地测试数据，已忽略，不进入 Git
```

## 构建与验证

运行：

```powershell
.\_tools\verify.ps1
```

该命令会：

1. 合并 `src/` 到 `quit-app.html`
2. 检查 JS 语法、构建占位符和内联 `on*` 事件
3. 使用本机 Chrome 无头模式运行回归测试

构建安卓前同步 HTML：

```powershell
Copy-Item .\quit-app.html .\QuitSmokeApp\app\src\main\assets\index.html -Force
```

安卓构建：

```powershell
$env:JAVA_HOME='C:\Users\公鸡舞翩迁\Android\jdk17\jdk-17.0.13+11'
$env:GRADLE_USER_HOME='C:\Users\公鸡舞翩迁\.gradle'
$env:TEMP=$env:TMP='C:\Users\公鸡舞翩迁\AppData\Local\Temp'
& 'C:\Users\公鸡舞翩迁\Android\gradle\gradle-8.5\bin\gradle.bat' -p .\QuitSmokeApp clean assembleDebug
```

产物：

```text
QuitSmokeApp/app/build/outputs/apk/debug/app-debug.apk
```

复制为根目录 `补.apk` 后，必须用 `apksigner verify` 和包内 `assets/index.html` SHA-256 做一致性检查。

## 页面与导航

页面索引：

```text
0 首页
1 训练
2 喝水
3 戒烟
4 待办
5 记账
6 提醒
```

首页不参与滑动。1–6 首尾循环。设置页是独立覆盖页，不参与循环，系统返回先回首页。

底部单字入口和滑动顺序必须保持一致：练、水、戒、记、账、醒。

## 状态和持久化

Storage keys：

```text
quit_app_v1          戒烟状态
water_tracker_data   喝水
fitness_app_v1       训练
todo_app_v1          待办与归档
reminder_app_v1      提醒与归档
ledger_app_v1        记账
event-ledger-v2      旧记账只读迁移
bu_pre_restore_v1    完整恢复前的安全副本
```

完整备份格式：`bu-app-backup` v3。备份数据库必须包含：

- quit
- water
- fitness
- todo（含 archived）
- reminders（含 archived）
- ledger

备份生成使用深拷贝，不得直接引用当前内存对象。

## 待办规则

- 今日列表只展示今天有效的待办。
- 当天已勾选项目继续留在今日列表。
- 过期一次性待办和日期已结束的自定义待办自动进入 `archived`。
- 删除操作先进入归档。
- 归档可移回或彻底删除。
- 移回过期项目时，会赋予今天或未来日期，避免立刻重新归档。
- 每日、工作日、周末任务不会整体过期。
- 支持手势：普通项左拖归档；归档项右拖移回、左拖彻底删除；长按后进入增强拖拽反馈，原按钮保留。

## 提醒规则

- 模式：once、daily、weekly、monthly、yearly。
- 一次性提醒到期后自动进入归档。
- 重复提醒不会因一次触发而停止。
- 手动删除先进入归档。
- 归档可移回或彻底删除。
- 移回已过期的一次性提醒时，会安排最近的未来同名时间。
- 支持与待办一致的横向拖拽和长按拖拽手势。

## Android 通知架构

- `ReminderScheduler`：每天待办汇总提醒，使用单次 AlarmClock。
- `DailyReminderReceiver`：显示待办通知，然后安排下一天。
- `StandaloneReminderScheduler`：独立提醒的 AlarmClock 调度。
- `StandaloneReminderReceiver`：显示独立提醒。
- `SnoozeScheduler` / `SnoozeReceiver`：一次性稍后提醒。
- `NotificationActionReceiver`：通知“确认”动作，收起通知。

通知点击：

- 通知主体：打开对应页面，不弹输入框。
- 点“稍后”：打开 `openSnoozeDialog`，输入 1–1440 分钟。

系统权限：

- `POST_NOTIFICATIONS`
- `RECEIVE_BOOT_COMPLETED`
- `SCHEDULE_EXACT_ALARM`
- `INTERNET`（仅更新）
- `REQUEST_INSTALL_PACKAGES`

不要重新引入前台服务、持久 Job 或轮询；当前设计依赖 Android AlarmManager 和用户为 Xiaomi 开启自启动。

## 应用内更新

`AppUpdater.java`：

1. 请求 `api.github.com/repos/bgwfsj/bu-app/releases/latest`
2. 比较远程 tag 和当前 `versionName`
3. 使用 Release Asset API URL 下载，不用 `github.com` 的直接附件地址
4. 跟随 GitHub CDN 302
5. 校验 GitHub `digest` 中的 SHA-256
6. 通过 FileProvider 打开系统安装器

下载时必须在通知栏显示进度百分比和已下载/总大小。下载完成后同一条通知更新状态。

## 发版流程

1. 修改 `QuitSmokeApp/app/build.gradle` 的 `versionCode` 和 `versionName`
2. 在 `src/js/05-app-info.js` 增加当前版本更新记录
3. 更新 `HANDOFF.md`
4. 运行 `verify.ps1`
5. 构建 APK 并复制为 `补.apk`
6. 校验签名、版本号和包内 HTML hash
7. 提交并推送 `main`
8. 创建 `v<version>` 标签
9. 在 GitHub Release 上传 `bu-<version>.apk`
10. 确认 `/releases/latest` 返回新版本

## 已知约束

- 小米/Redmi 必须开启自启动和省电无限制。
- Android“强行停止”会清除闹钟，只能重新打开 App 恢复。
- 安装更新需要用户允许安装未知应用。
- APK 使用 debug 签名，适合个人覆盖安装，不适合商店发布。
- 用户 CSV 和本地资料不得提交到 Git。

## 提交前检查

- `verify.ps1` 全部通过
- 设置页更新和关于正常
- APK 内 HTML 与根目录 HTML hash 一致
- Release 的 digest 与本地 SHA-256 一致
- 没有提交 APK、CSV、`local.properties` 或历史签名文件
