# 「补」开发与 AI 交接说明

本文面向接手项目的开发者或 AI。产品使用方式见 [README.md](../README.md)，历史交接背景见 [HANDOFF.md](HANDOFF.md)。

## 项目概览

- 应用名：补
- 包名：`com.quitsmoke.app`
- 当前版本：6.0.3
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
../README.md                用户说明
docs/DEVELOPMENT.md         本文件
docs/HANDOFF.md             历史交接与排障补充
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
& 'C:\Users\公鸡舞翩迁\Android\gradle\gradle-8.5\bin\gradle.bat' -p .\QuitSmokeApp clean assembleRelease
```

产物：

```text
QuitSmokeApp/app/build/outputs/apk/release/app-release.apk
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
记账设置页 `p-ledger-settings` 也是独立覆盖页，返回时回到记账页。

底部单字入口和滑动顺序必须保持一致：练、水、饭、戒、记、账、醒。

## 状态和持久化

Storage keys：

```text
quit_app_v1          戒烟状态
water_tracker_data   喝水
fitness_app_v1       训练
todo_app_v1          待办与归档
reminder_app_v1      提醒与归档
ledger_app_v1        记账
meals_app_v1         三餐
bu_home_layout_v1    首页布局（classic / honeycomb / facet）
event-ledger-v2      旧记账只读迁移
bu_pre_restore_v1    完整恢复前的安全副本
```

访问统计不属于 localStorage，使用 Android SharedPreferences 文件 `app_visit_stats`，字段为 `total_count`、`today_date`、`today_count`。不计入完整备份。

访问计数规则由 `MainActivity` 管理：首次前台和离开 App 后重新前台各计一次；`onStop` 时如果屏幕关闭或处于锁屏则设置 `ignoreNextResume`，避免息屏恢复计数。App 内页面切换不触发 Activity 生命周期，因此不会增加；BootReceiver 不启动 Activity，因此自启动也不会增加。

首页数字文案位于 `src/js/07-visit-copy.js`：`VISIT_X_SPECIAL` 优先匹配特殊累计次数并使用 `.special` 暖金色；否则从 `VISIT_Y_COPY[1..20]` 各 5 条中按“日期 + x + y”的稳定哈希选择。今日次数大于 20 或没有匹配时使用通用备用文案。相同数字与日期下不得随机跳句。

三餐记录位于 `src/js/52-meals.js`，数据只存 `meals_app_v1`。自动分餐窗口为：05:00–10:30 早餐、10:30–14:30 午餐、14:30–17:30 下午茶、17:30–21:00 晚餐、21:00 至次日 05:00 夜宵。正餐规律窗口为早餐 06:30–09:00、午餐 11:30–13:00、晚餐 17:30–19:30；日历按当天规律正餐数显示 3 绿、2 黄、1 红、0 为叉，夜宵额外显示小点。下一顿倒计时目标为理想窗口起点：早餐 06:30、午餐 11:30、晚餐 17:30；今天已经记录过的正餐会跳过，晚餐后指向次日早餐 06:30。倒计时区域不显示“今天/明天几点”，只显示当前正餐的理想时间段；进度条按上一正餐窗口起点到本次目标窗口起点计算。时间评价同时参考理想窗口和与上一顿的间隔，仅作一般作息提示，不应写成诊断或医疗建议。

训练计划和训练会话中的每个动作条目都必须带独立 `itemId`；`exerciseId` 只表示动作类型，不能再用它区分同一计划中重复添加的相同动作。完成组、时长计时、撤销、补记和训练详情都按 `itemId` 关联。旧数据缺少 `itemId` 时，加载时按 `exerciseId + 序号` 迁移，并尽量按原目标数量把旧记录分配给对应条目。

完整备份格式：`bu-app-backup` v4。备份数据库必须包含：

- quit
- water
- fitness
- todo（含 archived）
- reminders（含 archived）
- ledger
- meals
- settings（含 homeLayout）

备份生成使用深拷贝，不得直接引用当前内存对象。

## 待办规则

- 今日列表只展示今天有效的待办。
- 当天已勾选项目继续留在今日列表。
- 过期一次性待办和日期已结束的自定义待办自动进入 `archived`。
- 删除操作先进入归档。
- 归档可移回或彻底删除。
- 移回过期项目时，会赋予今天或未来日期，避免立刻重新归档。
- 每日、工作日、周末任务不会整体过期。
- 转换提醒时可无损使用 weekly、monthly、yearly 三类规则。
- 支持手势：普通项左拖归档；归档项右拖移回、左拖彻底删除；长按后进入增强拖拽反馈，原按钮保留。
- 待办页不再显示底部提醒设置卡；右上角 `⋯` 打开 `openTodoMenu`，其中入口进入原有 `openReminderSettings`。
- 待办和提醒条目自身拥有横向手势，因此从条目开始横向滑动时禁止切换大页面；拖拽结束后会短时抑制生成的点击事件，避免误开编辑页。
- 正常状态的待办和提醒条目点击整行进入编辑；归档条目没有编辑 action，保持只读。

## 首页与日历

- 提醒页的首页通知开关由右上角 `⋯` 菜单管理，不再占用页面底部。
- 训练日历不再给训练日和放纵餐加背景框；训练日显示蓝点 `#5f9ec7`，放纵餐显示黄点 `#e2b34b`，同日并列两颗点。仅 `.fit-day.today` 保留日期边框。
- 戒烟状态 `S.quitHistory` 保存历次破戒记录 `{startedAt, endedAt, durationMs}`，最多 100 条。顶部 `quit-record` 在历史某次更长时显示“最久 X 天”和那次破戒日期；当前时长达到或超过历史最长（包括没有历史记录）时只显示“你第一次走这么远”。

## 提醒规则

- 模式：once、daily、weekly、monthly、yearly。
- 一次性提醒到期后自动进入归档。
- 重复提醒不会因一次触发而停止。
- 重复提醒的完成状态记录在 `completedOccurrences`，与仅用于隐藏首页通知/稍后的 `handledOccurrences` 分开。当前 occurrence key 存在时提醒行显示 `.done-today` 划线；次日 key 不同，自动恢复。
- 手动删除先进入归档。
- 归档可移回或彻底删除。
- 移回已过期的一次性提醒时，会安排最近的未来同名时间。
- 从归档移回过期的仅一次提醒时保留原日期，并用 `restoredPastOnce` 阻止它被立即再次归档。
- 提醒仅支持短距离横向滑动，不启用长按拖拽。
- 普通状态和归档均按 once、daily、weekly、monthly、yearly 分组；折叠状态保存在 `reminderData.groupCollapsed`。
- 首页提醒会列出所有当天已经到点、且 `handledOccurrences` 中没有对应事件键的提醒，不使用“只显示第一条 + 另有 N 条”的摘要。每条右侧 `×` 调用 `completeHomeReminder()`，同时写入 `handledOccurrences` 和 `completedOccurrences`，所以首页移除并让提醒列表划线。事件键格式为 `id|yyyy-MM-dd|HH:mm`，通知后台确认或稍后时写入原生 SharedPreferences，App 恢复时由 `applyConfirmedReminders()` 同步。
- 通知“确认”对一次性提醒记录完成 ID并归档；对重复提醒写入 `completed_keys`，由 `MainActivity.consumeCompletedReminderKeys()` 同步到 `completedOccurrences`。通知“稍后”只写 `handled_keys`，不得触发划线。
- 待办与提醒可以一对一互相转换。转换后源项目进入归档并标记 `archiveReason = converted`。可一一对应的重复规则会直接保留；工作日、周末、自定义多日期待办转换为一条 `once` 提醒，日期取最近一次。

## 备份清理

- 每次手动导出或应用更新前自动备份后，调用 `AppNative.cleanupOldBackups(2)` 自动保留最近 2 份。
- 设置页“清理旧备份”可手动执行同一规则。
- Android 10 及以上查询 `Downloads` 中名称匹配 `补-%备份-%.json` 的文件；更早系统清理应用下载目录。

## 记账分析

- 每个事件有 `archived` 标记；归档根事件及其子树不进入主事件树，但保留在设置页归档列表和数据文件中。
- 归档可以作用于根事件或任意子事件；恢复与彻底删除以归档边界为准。全局月度总览和分类占比继续包含归档记录。
- 当前事件的记录搜索覆盖日期、精确创建时间、分类、备注和两位小数金额。
- 当前事件账目不再显示独立“编辑”按钮，`.ledger-record` 整行绑定 `editLedgerRecord`；删除按钮保留并依靠事件委托优先命中自身 action。
- 当前事件按整棵子树汇总：累计花费、本月花费、每月历史、分类金额和分类饼图。
- 月度总览同时展示当月根事件汇总和分类占比。
- 分类数据为 `ledgerData.tags`，记录上的 `tag` 为实际引用。
- 编辑分类会修改 `tags` 并同步全部历史记录的 `tag`。
- 删除分类只从 `tags` 移除，历史记录仍保留原分类字符串。
- 记账设置页 `p-ledger-settings` 负责事件改名、归档、恢复、彻底删除、分类管理、CSV 导入和两种导出。导出全部事件时包含普通事件与归档事件。

## Android 通知架构

- `ReminderScheduler`：每天待办汇总提醒，使用单次 AlarmClock。
- `DailyReminderReceiver`：显示待办通知，然后安排下一天。
- `StandaloneReminderScheduler`：独立提醒的 AlarmClock 调度。
- `StandaloneReminderReceiver`：显示独立提醒。
- `SnoozeScheduler` / `SnoozeReceiver`：一次性稍后提醒。
- `NotificationActionReceiver`：通知“确认”动作直接收起并记录完成；仍兼容旧通知里的后台“稍后”广播，但新通知不再使用该入口。

提醒通知固定使用 5.7 的原生实现：`StandaloneReminderReceiver`、`DailyReminderReceiver` 和 `SnoozeReceiver` 直接构造标准 `NotificationCompat`，使用 `ic_launcher_foreground`、标准 `addAction` 和原始通道 `standalone_reminders` / `todo_daily_reminder`。不要再引入自定义 content view、big content 或 heads-up view；小米会因此丢失悬浮通知。

待办、提醒及归档标题使用自动换行，不再使用 `nowrap + ellipsis`。

通知点击：

- 通知主体：打开对应页面并调用 `openNotificationActionDialog`，弹框提供“确认”和“稍后”。
- 点通知“稍后”：打开 `MainActivity` 并直接调用 `openSnoozeDialog`，由用户输入 1–1440 分钟。
- 点通知“确认”：直接收起通知；一次性提醒记录完成标记，App 下次恢复时归档。
- 在弹框内使用稍后入口时，仍通过 `openSnoozeDialog` 输入 1–1440 分钟。

`MainActivity` 使用 `launchMode="singleTop"`，已有任务从通知正文进入时走 `onNewIntent`。执行待处理通知脚本前会检查 `goPage`、`openNotificationActionDialog` / `openSnoozeDialog` 是否定义；页面脚本尚未就绪时最多重试 20 次、每次 100ms，避免参数被提前消费后弹框丢失。
- 仅一次的独立提醒保存稍后时间后，从活动列表移入归档并标记 `archiveReason = snoozed`；补发通知由 `SnoozeScheduler` 独立调度，不依赖活动列表中的原提醒。

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

`MainActivity.onPageFinished()` 每个 Activity 生命周期只安排一次启动更新检查，约延迟 2 秒后调用 `AppUpdater.checkOnStartup()`。启动模式必须静默：无更新、网络失败或已有检查/下载任务时不弹 Toast 或对话框；只有发现更高版本才显示更新弹窗。设置页手动检查继续使用 `AppUpdater.check()`，保留“正在检查”和“已是最新”反馈。

下载时必须在通知栏显示进度百分比和已下载/总大小。下载完成后同一条通知更新状态。

独立提醒的 PendingIntent requestCode 必须分离：`StandaloneReminderScheduler` 的 AlarmClock show intent 使用 `requestCode(id) ^ 0x5348`，通知内容 intent 使用 `requestCode(id)`，确认和稍后动作另有独立 XOR 值。`PendingIntent` 的身份判断忽略 extras；如果内容点击与闹钟点击复用同一个 requestCode，重复提醒排下一次时会用不含弹框参数的 extras 覆盖通知内容 intent。待办提醒正常的原因就是它的 AlarmClock show request（4101）与通知内容 request（0）本来就不同。

用户确认更新后，`AppUpdater` 先调用 `MainActivity.backupBeforeUpdate()`，由 WebView 执行 `window.exportUpdateBackup()` 并保存完整 JSON。只有备份返回成功才进入下载；备份失败时停止更新。

## 发版流程

用户已确认：以后每次执行“打包”都默认包含完整发版，即构建正式签名 APK、提交并推送源码、创建标签、上传 GitHub Release，无需再次询问是否上传。

1. 修改 `QuitSmokeApp/app/build.gradle` 的 `versionCode` 和 `versionName`
2. 在 `src/js/05-app-info.js` 增加当前版本更新记录
3. 更新 `HANDOFF.md`
4. 运行 `verify.ps1`
5. 构建 release APK 并复制为 `补.apk`
6. 校验签名、版本号和包内 HTML hash
7. 提交并推送 `main`
8. 创建 `v<version>` 标签
9. 在 GitHub Release 上传 `bu-<version>.apk`
10. 确认 `/releases/latest` 返回新版本

## 已知约束

- 小米/Redmi 必须开启自启动和省电无限制。
- Android“强行停止”会清除闹钟，只能重新打开 App 恢复。
- 安装更新需要用户允许安装未知应用。
- APK 使用本机专用 release 证书。私钥位于 `_local-data/signing/bu-release-v1.jks`，密码配置位于已忽略的 `QuitSmokeApp/signing.properties`。两者不得提交或公开。
- 发布签名一经使用必须长期保持不变；更换证书会导致 Android 拒绝覆盖安装，只能卸载后重装并恢复数据。
- 用户 CSV 和本地资料不得提交到 Git。

## 提交前检查

- `verify.ps1` 全部通过
- 设置页更新和关于正常
- APK 内 HTML 与根目录 HTML hash 一致
- Release 的 digest 与本地 SHA-256 一致
- 没有提交 APK、CSV、`local.properties`、`signing.properties` 或签名密钥
