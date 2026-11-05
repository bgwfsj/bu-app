# 「补」App —— 交接说明

一句话：源码按页面拆成小模块，构建时重新合成单文件 `quit-app.html`，再由 Android WebView 壳打包。日常功能无后端、CDN 或框架依赖，只有用户主动检查更新时访问公开的 GitHub Releases。

## 目录

    src/                           ★ 模块化源码
      index.template.html          页面结构与模块占位符
      styles/                      CSS 模块
      js/                          按业务拆分的 JS 模块
    _tools/
      build.mjs                    合并 src → quit-app.html
      check.js                     JS 语法、占位符、内联事件检查
      test.mjs                     Chrome 无头回归测试
      verify.ps1                   构建 + 检查 + 全部回归的一键入口
    quit-app.html                 ★ 生成的离线单文件，不直接编辑
    HANDOFF.md                     本文件
    补.apk                         当前版本安装包（versionName 5.4 / versionCode 37）
    历史版本/                      旧 APK、记账原版参考文件和一次性拆分工具
    水墨晕染风格图片生成.png        图标原图（生成 mipmap 用，别删）
    _tools/check.js                抽出 <script> 做 JS 语法体检
    _tools/preview.html            390x844 手机壳预览页（iframe 加载 ../quit-app.html）
    QuitSmokeApp/                  Android 工程（包名 com.quitsmoke.app，应用名「补」）
      app/src/main/assets/index.html   ← quit-app.html 的副本，壳实际加载的是这份
      app/src/main/java/.../MainActivity.java   WebView 壳
      app/src/main/res/               图标、主题、字符串
      app/build.gradle                versionCode / versionName / SDK 版本
      local.properties                sdk.dir（换机器要改）
      _tools/make_icon_from_image.py  从原图重新生成全部图标资源

## 排障（实测踩过的坑）

- **gradle 报 `Gradle could not start your build` / `java.io.tmpdir is set to a directory that doesn't exist`**
  → 不是工程问题，是当前 shell 的 `tmp`/`TMP` 环境变量指向了已删除的目录。先
  `export tmp=$TMP=$TEMP="C:/Users/公鸡舞翩迁/AppData/Local/Temp"` 再跑即可（若 daemon 已被污染就先 `gradle --stop`）。
- **工程目录改名报 `Device or resource busy` / `Permission denied`**
  → 有进程把这个目录当成工作目录（通常是你自己的 agent 会话 cwd）。目录里的文件可以先搬走，
  但目录本身要等那个进程退出后才能删/改名。
- 构建产物 `app-debug.apk` 约 3,341,596 字节，与根目录 `补.apk` 一致；若大小变了说明源码或版本号动过。

## 改代码的标准流程

1. 只编辑 `src/` 下的模块。一次性拆分工具已移入 `历史版本/_tools/`，日常构建不要使用。
2. 运行 `.\_tools\verify.ps1`。它会重新构建、检查语法与内联事件、执行完整回归。
3. 视觉预览：浏览器打开 `_tools/preview.html`（按手机尺寸检查）。
4. 同步给壳：`Copy-Item .\quit-app.html .\QuitSmokeApp\app\src\main\assets\index.html -Force`
5. 构建（PowerShell）：

       $env:JAVA_HOME='C:\Users\公鸡舞翩迁\Android\jdk17\jdk-17.0.13+11'
       $env:GRADLE_USER_HOME='C:\Users\公鸡舞翩迁\.gradle'
       $env:TEMP=$env:TMP='C:\Users\公鸡舞翩迁\AppData\Local\Temp'
       & 'C:\Users\公鸡舞翩迁\Android\gradle\gradle-8.5\bin\gradle.bat' -p .\QuitSmokeApp clean assembleDebug

6. 产物：`QuitSmokeApp/app/build/outputs/apk/debug/app-debug.apk`（debug 签名）。检查后覆盖根目录的 `补.apk`，并保留一份 `补-v版本号.apk`。
7. 核对包内 `assets/index.html` 的 SHA-256 与根目录 `quit-app.html` 一致，再装真机跑一遍。

JDK 17 / Gradle 8.5 / SDK API34 已在用户机器上就绪；`local.properties` 指向
`C:\Users\公鸡舞翩迁\Android\Sdk`。工程实测 clean build 18 秒通过。

## 技术约束（改之前必读）

- **外部依赖约束**：不引 CDN、不引框架，样式与脚本全部内联，日常功能离线可用。网络仅用于用户主动点击首页“更新”时读取公开的 `bgwfsj/bu-app` Releases 并下载 APK；源码与安装包统一使用同一个仓库。
- **数据只存 localStorage**：训练存 `fitness_app_v1`，喝水存 `water_tracker_data`，戒烟存 `quit_app_v1`，待办存 `todo_app_v1`，记账存 `ledger_app_v1`；无账号、无云同步，卸载即清空。系统 Android 自动备份已关闭，迁移由应用自己的完整备份负责。
- **完整备份**：首页右上角 `⋯` 进入设置页，可导出/恢复训练、喝水、戒烟、待办、提醒和记账数据，格式为 `bu-app-backup` v3。恢复前会自动把当前数据存到 `bu_pre_restore_v1`，且备份对象是独立快照，不受之后内存修改影响。
- **旧数据迁移**：戒烟只读迁移 `quitsmoke_save_v2`，记账只读迁移 `event-ledger-v2`，旧存档迁移后仍保留。
- **代码约束**：交互统一走 `data-action` / `data-change-action` 委托，不写内联 `on*`；DOM 查询使用 `byId/bySelector`，避免 WebView 或调试环境注入同名 `$` 导致整页按钮失效。
- 竖屏锁定（`screenOrientation="portrait"`），minSdk 24 / targetSdk 34。
- Android Manifest 不含 `INTERNET`，并显式关闭明文流量；仅保留通知权限与开机恢复提醒。
- 设计基调：**白色极简 + 单一强调色**。用户明确否决过深色方案；嫌某元素"太有存在感"时，正解是去掉容器/缩小/下移，只调透明度不算解决。
- 改版本号只动 `QuitSmokeApp/app/build.gradle` 的 `versionCode` / `versionName`。
- 图标要重做时跑 `QuitSmokeApp/_tools/make_icon_from_image.py`（需 numpy + Pillow），
  它会从原图重算纸底 + 墨层，输出 5 档 mipmap 和自适应图标前后景。

## 现有功能

- **训练**：动作分按组/按时长两类（默认背、胸、腿按组，跑步、爬坡按时长），可保存多套训练计划并直接开始；训练中可调整动作、组数或目标时长，完成记录只保存本次训练累计用时，不记录具体钟点；完成全部计划后自动结束，未完成时可选择保存或不保存。训练记录可删除、可补记；最近训练默认折叠。训练日历同时标记训练日和放纵餐，同一天可叠加标记；更早月份只归档训练次数和放纵餐顿数，月份导航可跨过无记录月份。
- **戒烟计时（主界面）**：设置戒烟起始时间；五种表盘视图（竖版翻页 / 竖版灯管 / 涟漪 / 风迹 / 流光）；阶段进度与阶段列表；「我破戒了」重置。
- **喝水**：每日目标设置、环形进度、快捷水量、近 7 天自绘 SVG 折线、历史记录列表。
- **待办**：支持单次、每天、工作日、周末和自定义日期重复；今天列表可点“改”编辑文字和规则，未来事项可点整行编辑；只改文字会保留完成状态。过期的一次性待办和日期已全部结束的自定义待办会自动进入默认折叠的归档；仍在重复的任务及当天点掉的任务继续留在今日列表。每天按设定时间通过 Android 单次 AlarmClock 提醒，触发后再安排下一天，避免小米清理重复闹钟。
- **独立提醒**：与待办完全分开存储；支持一次性日期、每天、每周指定星期、每月指定日期、每年指定月日五种模式；可新增、编辑、删除。当天有提醒时首页持续显示红色通知提示，右侧 `×` 只关闭当天，下一周期会重新出现；也可以从提醒页永久关闭首页提示。通知只使用 Android 系统 AlarmManager：允许精确闹钟时使用系统级 AlarmClock，否则使用省电兼容调度；重启或系统时间变化后自动恢复。App 不常驻前台服务、不保留常驻通知，也不运行轮询计时期；系统闹钟触发时才短暂启动接收器并显示通知。
- **稍后提醒**：待办、独立提醒及其补发通知都直接显示内容和“确认”“稍后”两个按钮。“确认”收起通知；“稍后”进入应用内分钟输入弹窗，可输入 1～1440 分钟。到时会补发一次通知，不影响原待办总结或提醒周期，并可在补发通知上继续稍后提醒。
- **应用内更新**：设置页“检查更新”会读取公开源码仓库 `bgwfsj/bu-app` 的最新 Release。下载优先使用 `api.github.com` 的 Release Asset 接口并跟随 GitHub CDN 跳转，避免部分网络环境下 `github.com` 直连超时；同时保留浏览器下载地址作为兜底。下载期间在通知栏显示百分比和已下载/总大小，完成或失败会更新同一条通知。APK 必须通过 GitHub 提供的 SHA-256 校验后才会打开系统安装器。
- **设置页**：首页右上角 `⋯` 进入独立设置页；完整备份、恢复和检查更新集中在设置页。设置页不参与功能页循环，系统返回或左上角返回按钮回到首页。
- **记账**：支持多级事件树，可在任意事件下继续新增子事件；父事件汇总整棵子树的金额和明细，选中子事件时只看该分支。事件树每次打开默认全部折叠。可从右上角菜单删除当前事件及其全部子事件和账目，删除前显示数量并二次确认。月度总览按全部事件汇总额，可查看所有历史月份并打开当月事件占比和逐笔明细。另支持常用/自定义分类、金额、日期、备注、编辑和删除；每条新记录自动保存精确到秒的创建时间，并兼容读取旧版 `event-ledger-v2` 数据。支持导入旧版六列表格 CSV（事件路径自动还原为事件树）和导出当前事件子树 CSV；重复导入自动去重。
- **页面顺序**：首页 → 训练 → 喝水 → 戒烟 → 待办 → 记账 → 提醒。首页独立且不响应左右滑动，只通过入口跳转；训练、喝水、戒烟、待办、记账、提醒六个功能页首尾循环。底部淡蓝色单字入口和左右滑动使用同一顺序：练、水、戒、记、账、醒；戒烟页的破戒按钮位于顶部设置按钮旁。可从任一功能页使用 Android 系统返回手势回首页。
- **计时刷新**：DOM 使用累计时间重新计算，并由 Android 主线程每 500ms 主动刷新训练和戒烟计时，避免 WebView 定时器节流导致数字不动。
- **确认弹层**：删除等操作统一使用应用内确认弹层，不再调用 WebView 自带的 `confirm()`，避免显示 `file://` 前缀。
- **通知**：Android 13+ 首次开启提醒时申请通知权限；AlarmManager 每日本地触发，重启后由 BootReceiver 恢复计划。
- **通用件**：首运行引导 sheet、通用底部弹层（openSheet/closeSheet）、状态统一走 `storeGet/storeSet` 持久化、toast。
- **字体层级**：页面标题统一 27px、首页卡片标题 16px、正文 13px、卡片主文字与喝水快捷数字 14px、次级信息 10.5~11px；普通界面文字继承同一系统字体，仅时钟、时间和表格数据使用等宽字体。
- **自动测试**：覆盖首页禁止滑动、六个功能页首尾循环、系统返回首页、训练累计计时与自动结束、待办编辑与逾期规则、四种独立提醒及排序、真实 CSV 导入及判重、完整备份恢复、旧版数据迁移、单文件离线约束。

## 交接背景（会影响产品决策）

用户本人正在真实戒烟，同时开始把每天的训练也记录在同一个 App 里。首页现为训练，第二页喝水，第三页戒烟；
戒烟进入稳定期后原本缺少可交互内容，因此后续仍优先考虑**轻量的日常可点小系统**，而不是继续堆静态展示。
改动节奏上：用户定方向，执行放手做。
