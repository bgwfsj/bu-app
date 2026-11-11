/* ============================================================
   2. 常量
   ============================================================ */
var AKEY = 'quit_app_v1';          // 本 app 自己的存档（不碰旧游戏存档）
var QKEY = 'quitsmoke_save_v2';    // 旧游戏存档：只读，用来迁移戒烟时间
var WKEY = 'water_tracker_data';   // 喝水数据：与旧版同结构，直接复用
var FKEY = 'fitness_app_v1';       // 训练动作、计划、训练记录
var TKEY = 'todo_app_v1';          // 每日待办与提醒设置
var RKEY = 'reminder_app_v1';      // 独立提醒
var LKEY = 'ledger_app_v1';        // 多账本收支记录
var MKEY = 'meals_app_v1';         // 三餐记录
var ALKEY = 'alcohol_app_v1';      // 饮酒记录
var LOLDKEY = 'event-ledger-v2';   // 原独立记账 App 的旧存档，只读迁移
var HOME_LAYOUT_KEY = 'bu_home_layout_v1';

// 身体状况阶段（门槛取区间起点）
var STAGES = [
  { ms: 20 * 60000,          t: '20 分钟',      d: '心率、血压逐步回落至正常水平' },
  { ms: 12 * 3600000,        t: '12 小时',      d: '血液中一氧化碳浓度恢复正常' },
  { ms: 24 * 3600000,        t: '24 小时',      d: '心肌梗死发作风险开始下降' },
  { ms: 48 * 3600000,        t: '48 小时',      d: '味觉、嗅觉敏感度明显提升' },
  { ms: 72 * 3600000,        t: '72 小时',      d: '气道放松，呼吸更顺畅，肺活量提升' },
  { ms: 14 * 86400000,       t: '2 周～3 个月',  d: '肺功能与全身血液循环显著改善' },
  { ms: 30 * 86400000,       t: '1~9 个月',     d: '咳嗽咳痰减轻，肺部自净能力逐步恢复' },
  { ms: 365 * 86400000,      t: '1 年',         d: '冠心病发病风险降至持续吸烟者的一半' },
  { ms: 5 * 365 * 86400000,  t: '5 年',         d: '中风及多种癌症风险趋近不吸烟者水平' },
  { ms: 10 * 365 * 86400000, t: '10 年',        d: '肺癌死亡风险降至持续吸烟者的 30%~50%' },
  { ms: 15 * 365 * 86400000, t: '15 年',        d: '冠心病发病风险与从不吸烟者持平' }
];

var S = { quitDate: 0 };   // 本 app 状态
var wd = null;             // 喝水数据
var fit = null;            // 训练数据
var planDraft = [];        // 当前正在编辑的训练计划
var editingPlanId = null;  // 正在编辑的已保存计划
var calMonthIndex = 0;     // 当前选中的有记录月份位置
var todoData = null;       // 待办数据
var todoDraftDates = [];   // 自定义重复日期
var todoDraftRepeat = 'daily';
var editingTodoId = null;  // 正在编辑的待办
var reminderData = null;
var reminderDraftMode = 'once';
var reminderDraftWeekday = 1;
var editingReminderId = null;
var backfillDraft = [];    // 补记训练时的实际完成量
var ledgerData = null;
var ledgerPickedTag = '';
var editingLedgerRecordId = null;
var editingLedgerBookId = null;
var ledgerNewParentId = null;
var ledgerCollapsed = {};
var ledgerRecordMode = 'preview';
var ledgerTreeOpen = false;
var mealData = null;
var mealCalendarOffset = 0;
var alcoholData = null;
var alcoholCalendarOffset = 0;
var alcoholDraftType = 'beer';
var homeLayoutMode = 'classic';
var homeLayoutResizeBound = false;
var workoutFrameId = 0;
var workoutLastPaint = 0;
var page = 0;
var settingsOpen = false;
var ledgerSettingsOpen = false;
var dragClickSuppressionUntil = 0;
var sheetRequired = false;
var lastStageIdx = -99;
var lastDLen = -1;   // 天数位数，用于触发字号重算

/* ============================================================
   0. 工具层
   ============================================================ */
// 默认快捷水量（新用户的初始值）
var DEFAULT_QUICK = [200, 250, 300, 350, 400, 500];
var DEFAULT_EXERCISES = [
  { id: 'back', name: '背', type: 'sets' },
  { id: 'chest', name: '胸', type: 'sets' },
  { id: 'legs', name: '腿', type: 'sets' },
  { id: 'run', name: '跑步', type: 'duration' },
  { id: 'hill', name: '爬坡', type: 'duration' }
];
var DEFAULT_LEDGER_TAGS = ['早饭', '午饭', '晚饭', '门票', '住宿', '路费', '纪念品'];

function byId(id){ return document.getElementById(id); }
function bySelector(sel, root){ return (root || document).querySelectorAll(sel); }
function each(list, fn){ for (var i = 0; i < list.length; i++) fn(list[i], i); }
function pad2(n){ return n < 10 ? '0' + n : '' + n; }
function escHtml(v){
  return String(v).replace(/[&<>"']/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}

// 统一交互入口：动态内容只声明 action，不直接拼 on* 事件代码。
var APP_ACTION_NAMES = {
  goPage: true,
  closeSheet: true,
  resolveAppConfirm: true,
  exportAppBackup: true,
  requestCleanupOldBackups: true,
  chooseAppBackup: true,
  doBreak: true,
  saveSetDate: true,
  setQuitNow: true,
  setQuitToday: true,
  setQuitDaysAgo: true,
  setQuitFromInput: true,
  saveWaterSettings: true,
  openWorkoutPlan: true,
  startWorkoutFromPlan: true,
  setCalendarMonth: true,
  addExerciseFromPlan: true,
  deleteWorkoutPlan: true,
  saveWorkoutPlan: true,
  togglePlanExercise: true,
  adjustPlanSets: true,
  addExerciseToPlan: true,
  movePlanItem: true,
  duplicatePlanItem: true,
  removePlanItem: true,
  saveBackfillWorkout: true,
  adjustBackfill: true,
  discardWorkout: true,
  finishWorkout: true,
  adjustActiveTarget: true,
  undoActiveRecord: true,
  removeActiveExercise: true,
  addActiveExercise: true,
  addExerciseFromManager: true,
  removeWorkoutExercise: true,
  addCheatMeal: true,
  openSessionDetail: true,
  removeCheatMeal: true,
  openCheatMealSheet: true,
  deleteWorkoutSession: true,
  toggleTodo: true,
  editTodo: true,
  deleteTodo: true,
  openTodoMenu: true,
  openReminderSettings: true,
  restoreTodo: true,
  permanentDeleteTodo: true,
  removeTodoDraftDate: true,
  setTodoRepeat: true,
  addTodoDraftDate: true,
  saveTodoItem: true,
  enableTodoReminder: true,
  disableTodoReminder: true,
  recordMealNow: true,
  openAlcoholRecordForm: true,
  openAlcoholMenu: true,
  openAlcoholBackfillForm: true,
  openAlcoholRecoveryStages: true,
  pickAlcoholType: true,
  saveAlcoholRecord: true,
  saveAlcoholBackfill: true,
  deleteAlcoholRecord: true,
  changeAlcoholCalendarMonth: true,
  openAlcoholDay: true,
  openMealMenu: true,
  openMealBackfill: true,
  saveMealBackfill: true,
  changeMealCalendarMonth: true,
  deleteMealRecord: true,
  openReminderForm: true,
  setReminderMode: true,
  setReminderWeekday: true,
  refreshReminderYearDays: true,
  saveReminder: true,
  editReminder: true,
  deleteReminder: true,
  restoreReminder: true,
  permanentDeleteReminder: true,
  convertReminderToTodo: true,
  convertTodoToReminder: true,
  toggleReminderGroup: true,
  openReminderMenu: true,
  toggleReminderHomeNotice: true,
  completeHomeReminder: true,
  saveSnooze: true,
  openSnoozeDialog: true,
  confirmNotificationAction: true,
  checkAppUpdate: true,
  openSettingsPage: true,
  closeSettingsPage: true,
  setHomeLayout: true,
  openAboutSheet: true,
  openLedgerMonthReport: true,
  toggleLedgerEventTree: true,
  toggleLedgerNode: true,
  selectLedgerBook: true,
  cycleLedgerRecords: true,
  editLedgerRecord: true,
  deleteLedgerRecord: true,
  saveLedgerBook: true,
  pickLedgerTag: true,
  saveLedgerRecord: true,
  openLedgerBookSheet: true,
  openLedgerChildBookSheet: true,
  chooseLedgerCsv: true,
  exportLedgerCsv: true,
  deleteCurrentLedgerEvent: true,
  openLedgerTagManager: true,
  openLedgerSettingsPage: true,
  closeLedgerSettingsPage: true,
  renameCurrentLedgerEvent: true,
  saveLedgerEventName: true,
  archiveCurrentLedgerEvent: true,
  restoreLedgerEvent: true,
  deleteArchivedLedgerEvent: true,
  exportAllLedgerCsv: true,
  editLedgerTag: true,
  deleteLedgerTag: true,
  saveLedgerTagEdit: true,
  addLedgerTag: true
};

function actionAttrs(name, args, eventName){
  var attr = eventName === 'change' ? ' data-change-action="' : ' data-action="';
  var html = attr + escHtml(name) + '"';
  if (args && args.length) html += ' data-args="' + escHtml(JSON.stringify(args)) + '"';
  return html;
}

function invokeAppAction(el, eventName){
  var attr = eventName === 'change' ? 'data-change-action' : 'data-action';
  var name = el.getAttribute(attr);
  if (!name || !APP_ACTION_NAMES[name]) return;
  var args = [];
  try {
    var raw = el.getAttribute('data-args');
    if (raw) args = JSON.parse(raw);
    if (!Array.isArray(args)) args = [];
  } catch (e) {
    args = [];
  }
  var eventValue = el.getAttribute('data-event-value');
  if (eventValue === 'checked') args.push(!!el.checked);
  if (eventValue === 'value') args.push(el.value);
  var fn = window[name];
  if (typeof fn === 'function') fn.apply(null, args);
}

document.addEventListener('click', function(e){
  if (dragClickSuppressionUntil && Date.now() < dragClickSuppressionUntil &&
      e.target.closest && e.target.closest('[data-drag-kind]')) {
    dragClickSuppressionUntil = 0;
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  var el = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
  if (!el || el.disabled) return;
  invokeAppAction(el, 'click');
});

document.addEventListener('change', function(e){
  var el = e.target && e.target.closest ? e.target.closest('[data-change-action]') : null;
  if (!el || el.disabled) return;
  invokeAppAction(el, 'change');
});

// 本地存储：统一读写 + 容错（隐私模式/配额满时不崩）
function storeGet(key, fallback){
  try {
    var raw = localStorage.getItem(key);
    if (!raw) return fallback;
    var v = JSON.parse(raw);
    return (v === null || v === undefined) ? fallback : v;
  } catch(e){ return fallback; }
}
function storeSet(key, val){
  try { localStorage.setItem(key, JSON.stringify(val)); } catch(e){}
}

// 取整数并校验范围，非法返回 null
function intIn(v, min, max){
  var n = parseInt(v, 10);
  if (isNaN(n) || n < min || n > max) return null;
  return n;
}

function saveS(){ S.schemaVersion = 2; storeSet(AKEY, S); }

function fmtGapShort(ms){
  if (ms <= 0) return '0秒';
  var s = Math.floor(ms / 1000);
  var d = Math.floor(s / 86400);
  var h = Math.floor((s % 86400) / 3600);
  var m = Math.floor((s % 3600) / 60);
  var sec = s % 60;
  if (d > 0) return d + '天' + h + '时' + m + '分';
  if (h > 0) return h + '时' + m + '分' + pad2(sec) + '秒';
  if (m > 0) return m + '分' + pad2(sec) + '秒';
  return sec + '秒';
}

function toast(msg){
  var t = byId('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._t);
  t._t = setTimeout(function(){ t.classList.remove('on'); }, 1800);
}

/* ============================================================
   1. 弹层
   ============================================================ */
function openSheet(html, required){
  var sh = byId('sheet');
  sh.innerHTML = html;
  sh.classList.add('on');
  byId('mask').classList.add('on');
  sheetRequired = !!required;
}
function closeSheet(){
  if (sheetRequired) return;
  byId('sheet').classList.remove('on');
  byId('mask').classList.remove('on');
}

var pendingConfirmAction = null;
var pendingConfirmCancel = null;

function appConfirm(message, onConfirm, options){
  options = options || {};
  pendingConfirmAction = onConfirm;
  pendingConfirmCancel = options.onCancel || null;
  openSheet(
    '<h3>' + escHtml(options.title || '请确认') + '</h3>' +
    '<p>' + escHtml(message) + '</p>' +
    '<div class="row"><button class="ghost"' + actionAttrs('resolveAppConfirm', [false]) + '>' +
    escHtml(options.cancelLabel || '取消') + '</button>' +
    '<button class="danger"' + actionAttrs('resolveAppConfirm', [true]) + '>' +
    escHtml(options.confirmLabel || '确认删除') + '</button></div>'
  );
}

function resolveAppConfirm(confirmed){
  var action = pendingConfirmAction;
  var cancel = pendingConfirmCancel;
  pendingConfirmAction = null;
  pendingConfirmCancel = null;
  closeSheet();
  if (confirmed && action) action();
  else if (!confirmed && cancel) cancel();
}

var APP_BACKUP_FORMAT = 'bu-app-backup';
var APP_BACKUP_VERSION = 5;

function appBackupPayload(){
  return JSON.parse(JSON.stringify({
    format: APP_BACKUP_FORMAT,
    schemaVersion: APP_BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    data: {
      quit: S || {},
      water: wd || null,
      fitness: fit || null,
      todo: todoData || null,
      reminders: reminderData || null,
      ledger: ledgerData || null,
      meals: mealData || null,
      alcohol: alcoholData || null,
      settings: { homeLayout: homeLayoutMode }
    }
  }));
}

function saveTextFile(filename, text, mime){
  if (window.AppNative && window.AppNative.saveFile) {
    var bytes = new TextEncoder().encode(text), binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return window.AppNative.saveFile(filename, btoa(binary), mime || 'text/plain') !== false;
  }
  var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(url); }, 5000);
  return true;
}

var APP_BACKUP_KEEP = 2;

function backupTimeSuffix(){
  var now = new Date();
  return pad2(now.getHours()) + pad2(now.getMinutes()) + pad2(now.getSeconds());
}

function cleanupOldBackups(showResult){
  if (!window.AppNative || !window.AppNative.cleanupOldBackups) {
    if (showResult) toast('仅安装版支持自动清理备份');
    return 0;
  }
  var removed = 0;
  try { removed = Number(window.AppNative.cleanupOldBackups(APP_BACKUP_KEEP)); }
  catch (error) { removed = -1; }
  if (showResult) {
    if (removed < 0) toast('清理旧备份失败');
    else if (removed) toast('已清理 ' + removed + ' 份旧备份');
    else toast('没有需要清理的旧备份');
  }
  return removed;
}

function requestCleanupOldBackups(){
  appConfirm(
    '只保留最近 ' + APP_BACKUP_KEEP + ' 份完整备份，更早的备份文件会被删除。',
    function(){ cleanupOldBackups(true); },
    { title: '清理旧备份', confirmLabel: '清理' }
  );
}

function exportAppBackup(){
  closeSheet();
  var text = JSON.stringify(appBackupPayload(), null, 2);
  if (!saveTextFile(
    '补-完整备份-' + wTodayStr() + '-' + backupTimeSuffix() + '.json',
    text,
    'application/json'
  )) {
    toast('完整备份保存失败');
    return false;
  }
  cleanupOldBackups(false);
  toast('完整数据已导出，保留最近 ' + APP_BACKUP_KEEP + ' 份');
  return true;
}

function chooseAppBackup(){
  closeSheet();
  if (window.AppNative && window.AppNative.pickBackupFile) {
    window.AppNative.pickBackupFile();
    return;
  }
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = function(){
    var file = input.files && input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(){ receiveAppBackup(String(reader.result || '')); };
    reader.onerror = function(){ toast('读取备份文件失败'); };
    reader.readAsText(file, 'utf-8');
  };
  input.click();
}

function receiveAppBackup(text){
  var payload;
  try { payload = JSON.parse(String(text || '').replace(/^\uFEFF/, '')); }
  catch (e) { toast('备份文件不是有效的 JSON'); return; }
  if (!payload || payload.format !== APP_BACKUP_FORMAT || !payload.data) {
    toast('这不是「补」的完整备份文件');
    return;
  }
  appConfirm(
    '恢复备份会覆盖这台设备现有的训练、喝水、三餐、酒记、戒烟、待办、提醒、记账和首页样式设置。建议先导出一份当前备份。',
    function(){
      storeSet('bu_pre_restore_v1', appBackupPayload());
      storeSet(AKEY, payload.data.quit || { quitDate: 0 });
      storeSet(WKEY, payload.data.water || null);
      storeSet(FKEY, payload.data.fitness || null);
      storeSet(TKEY, payload.data.todo || null);
      storeSet(RKEY, payload.data.reminders || null);
      storeSet(LKEY, payload.data.ledger || null);
      storeSet(MKEY, payload.data.meals || null);
      storeSet(ALKEY, payload.data.alcohol || null);
      if (payload.data.settings && payload.data.settings.homeLayout) {
        storeSet(HOME_LAYOUT_KEY, payload.data.settings.homeLayout);
      }
      location.reload();
    },
    { title: '恢复全部数据', confirmLabel: '覆盖并恢复' }
  );
}

byId('mask').addEventListener('click', closeSheet);
