/* ============================================================
   应用版本记录
   ============================================================ */
var APP_CHANGELOG = [
  { version: '5.5.1', date: '2026-11-05', changes: ['待办和提醒归档列表改为单行，仅保留标题、状态和操作。'] },
  { version: '5.5', date: '2026-11-05', changes: ['待办和提醒新增归档、移回与彻底删除。', '一次性提醒完成后自动归档。', '喝水今日记录与快捷水量字号统一。', '记账事件和月度总览文字统一为 13px。', '整理项目目录并补充使用说明与 AI 开发说明。'] },
  { version: '5.4.1', date: '2026-11-05', changes: ['设置页新增“关于”和完整更新记录。'] },
  { version: '5.4', date: '2026-11-05', changes: ['功能页顺序统一为待办、记账、提醒。', '快捷导航与左右滑动顺序保持一致。', '喝水快捷水量调整为 13px 常规字重。'] },
  { version: '5.3.3', date: '2026-11-05', changes: ['喝水快捷水量和输入数字调整为 14px。'] },
  { version: '5.3.2', date: '2026-11-05', changes: ['应用内下载 APK 时在通知栏显示百分比和大小。', '下载完成或失败会更新同一条通知。'] },
  { version: '5.3.1', date: '2026-11-05', changes: ['修复 GitHub 下载连接失败。', '改用 GitHub API 资产接口并通过 CDN 下载。'] },
  { version: '5.3', date: '2026-11-05', changes: ['设置页集中管理备份、恢复和更新。', '记账事件树默认全部折叠。', '首页右上角统一为设置入口。'] },
  { version: '5.2', date: '2026-11-05', changes: ['源码仓库设为公开。', '应用更新只使用 bgwfsj/bu-app 一个仓库。'] },
  { version: '5.1', date: '2026-11-05', changes: ['新增应用内 GitHub 更新检查与安装。'] },
  { version: '5.0', date: '2026-11-05', changes: ['过期一次性待办和已结束自定义待办进入默认折叠的归档。', '当天完成的待办继续保留在今日列表。'] },
  { version: '4.9.1', date: '2026-11-05', changes: ['通知栏新增“确认”和“稍后”按钮。', '点击“稍后”可输入 1–1440 分钟。'] },
  { version: '4.9', date: '2026-11-05', changes: ['提醒新增每天模式。', '待办和提醒支持稍后提醒。'] },
  { version: '4.8', date: '2026-11-04', changes: ['统一页面标题、正文、卡片和辅助文字字号。', '统一普通文字字体，数字继续使用等宽字体。'] },
  { version: '4.7', date: '2026-11-04', changes: ['底部六个快捷单字统一为半透明淡蓝色。'] },
  { version: '4.6', date: '2026-11-04', changes: ['底部导航改为练、水、戒、记、账、醒六个单字。', '戒烟破戒按钮移到顶部。'] },
  { version: '4.5', date: '2026-11-04', changes: ['底部导航改为文字快捷入口。'] },
  { version: '4.4', date: '2026-11-04', changes: ['待办通知改用单次 AlarmClock，修复小米划掉应用后失效。'] },
  { version: '4.3', date: '2026-11-04', changes: ['移除前台守护服务、持久 Job 和轮询，降低后台耗电。'] },
  { version: '4.2', date: '2026-11-04', changes: ['增加持久 Job 作为提醒备用通道。'] },
  { version: '4.1', date: '2026-11-04', changes: ['增加后台守护服务和首页按天关闭提示。'] },
  { version: '4.0', date: '2026-11-04', changes: ['增强提醒调度并增加定时测试。'] },
  { version: '3.9', date: '2026-11-04', changes: ['新增首页提醒通知、系统状态检查与测试通知。'] },
  { version: '3.8', date: '2026-11-04', changes: ['新增独立提醒页面。', '支持一次、每周、每月、每年提醒。'] },
  { version: '3.7', date: '2026-11-04', changes: ['待办支持编辑内容和重复规则。'] },
  { version: '3.6', date: '2026-11-04', changes: ['源码模块化并加入自动测试。', '新增完整备份与恢复。', '收紧 Android 权限并修复事件绑定隐患。'] }
];

function appVersionText(){
  if (window.AppNative && window.AppNative.getAppVersion) {
    try {
      var version = window.AppNative.getAppVersion();
      if (version) return version;
    } catch (e) {}
  }
  return APP_CHANGELOG.length ? APP_CHANGELOG[0].version : '';
}

function openAboutSheet(){
  var current = appVersionText();
  var entries = APP_CHANGELOG.map(function(entry, index){
    return '<details class="changelog-entry"' + (index === 0 ? ' open' : '') + '>' +
      '<summary><b>版本 ' + escHtml(entry.version) + '</b><span>' + escHtml(entry.date) + '</span></summary>' +
      '<ul>' + entry.changes.map(function(change){
        return '<li>' + escHtml(change) + '</li>';
      }).join('') + '</ul></details>';
  }).join('');
  openSheet(
    '<h3>关于补</h3>' +
    '<p>对人生不圆满的补充。</p>' +
    '<div class="about-current"><span>当前版本</span><b>' + escHtml(current) + '</b></div>' +
    '<div class="changelog-list">' + entries + '</div>' +
    '<div class="row"><button class="primary" style="flex:1;margin-top:13px"' + actionAttrs('closeSheet') + '>关闭</button></div>'
  );
}
