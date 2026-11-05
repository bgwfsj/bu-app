/* ============================================================
   8.65 独立提醒
   ============================================================ */
var REMINDER_MODES = ['once', 'daily', 'weekly', 'monthly', 'yearly'];
var REMINDER_WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
var REMINDER_MODE_NAMES = {
  once: '仅一次', daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年'
};

function reminderDefaultState(){
  return {
    schemaVersion: 1,
    items: [],
    archived: [],
    homeNoticeEnabled: true,
    homeNoticeDismissedDate: '',
    groupCollapsed: { active: {}, archived: {} }
  };
}

function reminderValidTime(value){
  if (!/^\d{2}:\d{2}$/.test(String(value || ''))) return false;
  var p = value.split(':');
  var h = parseInt(p[0], 10), m = parseInt(p[1], 10);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function reminderDaysInMonth(year, month){
  return new Date(year, month, 0).getDate();
}

function normalizeReminderItem(item){
  if (!item || typeof item.id !== 'string' || typeof item.title !== 'string') return null;
  var title = item.title.trim();
  if (!title || REMINDER_MODES.indexOf(item.mode) < 0 || !reminderValidTime(item.time)) return null;
  var out = {
    id: item.id,
    title: title,
    mode: item.mode,
    time: item.time,
    createdAt: item.createdAt || new Date().toISOString()
  };
  if (out.mode === 'once') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(item.date || ''))) return null;
    out.date = item.date;
  }
  if (out.mode === 'weekly') {
    var weekday = parseInt(item.weekday, 10);
    if (isNaN(weekday) || weekday < 0 || weekday > 6) return null;
    out.weekday = weekday;
  }
  if (out.mode === 'monthly' || out.mode === 'yearly') {
    var day = parseInt(item.day, 10);
    if (isNaN(day) || day < 1 || day > 31) return null;
    out.day = day;
  }
  if (out.mode === 'yearly') {
    var month = parseInt(item.month, 10);
    if (isNaN(month) || month < 1 || month > 12) return null;
    out.month = month;
  }
  return out;
}

function loadReminderState(){
  var d = storeGet(RKEY, null);
  if (!d || typeof d !== 'object') d = reminderDefaultState();
  if (!Array.isArray(d.items)) d.items = [];
  if (!Array.isArray(d.archived)) d.archived = [];
  if (typeof d.homeNoticeEnabled !== 'boolean') d.homeNoticeEnabled = true;
  if (typeof d.homeNoticeDismissedDate !== 'string') d.homeNoticeDismissedDate = '';
  if (!d.groupCollapsed || typeof d.groupCollapsed !== 'object') {
    d.groupCollapsed = { active: {}, archived: {} };
  }
  if (!d.groupCollapsed.active || typeof d.groupCollapsed.active !== 'object') d.groupCollapsed.active = {};
  if (!d.groupCollapsed.archived || typeof d.groupCollapsed.archived !== 'object') d.groupCollapsed.archived = {};
  delete d.backgroundGuardEnabled;
  d.items = d.items.map(normalizeReminderItem).filter(Boolean);
  d.archived = d.archived.map(function(item){
    var normalized = normalizeReminderItem(item);
    if (!normalized) return null;
    normalized.archivedAt = item.archivedAt || Date.now();
    normalized.archiveReason = item.archiveReason || 'deleted';
    return normalized;
  }).filter(Boolean);
  reminderData = d;
  archiveCompletedReminders();
  saveReminderState(false);
}

function saveReminderState(requestPermission){
  reminderData.schemaVersion = 1;
  storeSet(RKEY, reminderData);
  syncStandaloneReminders(!!requestPermission);
}

function reminderAtTime(date, time){
  var p = time.split(':');
  date.setHours(parseInt(p[0], 10), parseInt(p[1], 10), 0, 0);
  return date;
}

function reminderNextDate(item, from){
  var now = from || new Date();
  if (item.mode === 'once') {
    var once = new Date(item.date + 'T' + item.time + ':00');
    return isNaN(once.getTime()) ? null : once;
  }
  if (item.mode === 'daily') {
    var daily = reminderAtTime(new Date(now), item.time);
    if (daily.getTime() <= now.getTime()) daily.setDate(daily.getDate() + 1);
    return daily;
  }
  if (item.mode === 'weekly') {
    var weekly = reminderAtTime(new Date(now), item.time);
    var delta = (item.weekday - weekly.getDay() + 7) % 7;
    if (delta === 0 && weekly.getTime() <= now.getTime()) delta = 7;
    weekly.setDate(weekly.getDate() + delta);
    return weekly;
  }
  if (item.mode === 'monthly') {
    for (var i = 0; i < 24; i++) {
      var ym = new Date(now.getFullYear(), now.getMonth() + i, 1);
      var last = reminderDaysInMonth(ym.getFullYear(), ym.getMonth() + 1);
      var candidate = new Date(ym.getFullYear(), ym.getMonth(), Math.min(item.day, last));
      reminderAtTime(candidate, item.time);
      if (candidate.getTime() > now.getTime()) return candidate;
    }
  }
  if (item.mode === 'yearly') {
    for (var y = now.getFullYear(); y <= now.getFullYear() + 8; y++) {
      var lastDay = reminderDaysInMonth(y, item.month);
      var yearly = new Date(y, item.month - 1, Math.min(item.day, lastDay));
      reminderAtTime(yearly, item.time);
      if (yearly.getTime() > now.getTime()) return yearly;
    }
  }
  return null;
}

function reminderShortDate(date){
  if (!date) return '时间无效';
  return (date.getMonth() + 1) + '月' + date.getDate() + '日 ' +
    REMINDER_WEEKDAYS[date.getDay()] + ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes());
}

function reminderRuleText(item){
  if (item.mode === 'once') return '仅一次 · ' + item.date;
  if (item.mode === 'daily') return '每天';
  if (item.mode === 'weekly') return '每周' + REMINDER_WEEKDAYS[item.weekday].slice(1);
  if (item.mode === 'monthly') return '每月 ' + item.day + ' 日';
  return '每年 ' + item.month + ' 月 ' + item.day + ' 日';
}

function reminderNextText(item){
  var next = reminderNextDate(item);
  if (!next) return '等待重新设置';
  if (item.mode === 'once' && next.getTime() <= Date.now()) return '已提醒 · ' + reminderShortDate(next);
  return '下次 ' + reminderShortDate(next);
}

function reminderOccursOnDate(item, date){
  var year = date.getFullYear();
  var month = date.getMonth() + 1;
  var day = date.getDate();
  if (item.mode === 'once') return item.date === year + '-' + pad2(month) + '-' + pad2(day);
  if (item.mode === 'daily') return true;
  if (item.mode === 'weekly') return item.weekday === date.getDay();
  if (item.mode === 'monthly') {
    return day === Math.min(item.day, reminderDaysInMonth(year, month));
  }
  if (item.mode === 'yearly') {
    return month === item.month && day === Math.min(item.day, reminderDaysInMonth(year, month));
  }
  return false;
}

function renderHomeNotice(){
  var box = byId('home-notice');
  if (!box || !reminderData) return;
  if (reminderData.homeNoticeEnabled === false ||
      reminderData.homeNoticeDismissedDate === wTodayStr() ||
      !reminderData.items.length) {
    box.hidden = true;
    return;
  }
  var now = new Date();
  var currentTime = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
  var todayItems = reminderData.items.filter(function(item){
    return reminderOccursOnDate(item, now);
  }).sort(function(a, b){ return a.time.localeCompare(b.time); });
  var dueItems = todayItems.filter(function(item){ return item.time <= currentTime; });
  var title = '';
  var copy = '';
  if (todayItems.length) {
    var first = (dueItems.length ? dueItems[0] : todayItems[0]);
    title = dueItems.length ? '今天有提醒到时间了' : '今天安排了提醒';
    copy = first.title + ' · ' + first.time + (todayItems.length > 1 ? '，另有 ' + (todayItems.length - 1) + ' 条' : '');
  } else {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  setTxt('home-notice-title', title);
  setTxt('home-notice-copy', copy);
}

function updateReminderSettings(){
  if (!reminderData) return;
  var toggle = byId('btn-reminder-home-toggle');
  if (toggle) {
    var enabled = reminderData.homeNoticeEnabled !== false;
    toggle.textContent = enabled ? '已开启' : '已关闭';
    toggle.classList.toggle('off', !enabled);
  }
}

function reminderSortedItems(){
  var now = Date.now();
  return reminderData.items.map(function(item){
    var next = reminderNextDate(item);
    var ts = next ? next.getTime() : Infinity;
    if (item.mode === 'once' && ts <= now) ts = Infinity;
    return { item: item, next: next, ts: ts };
  }).sort(function(a, b){
    if (a.ts !== b.ts) return a.ts - b.ts;
    return a.item.createdAt < b.item.createdAt ? -1 : 1;
  });
}

function renderReminderPage(){
  if (!reminderData) return;
  if (archiveCompletedReminders()) saveReminderState(false);
  var ordered = reminderSortedItems();
  setTxt('reminder-count', String(reminderData.items.length));
  var active = ordered.filter(function(row){ return row.next && row.ts !== Infinity; });
  setTxt('reminder-next-summary', active.length ? '下一条 · ' + reminderShortDate(active[0].next) : '还没有安排');
  byId('reminder-list').innerHTML = ordered.length ? REMINDER_MODES.map(function(mode){
    var rows = ordered.filter(function(row){ return row.item.mode === mode; });
    if (!rows.length) return '';
    var collapsed = !!reminderData.groupCollapsed.active[mode];
    return '<section class="reminder-group' + (collapsed ? ' collapsed' : '') + '">' +
      '<button type="button" class="reminder-group-head"' + actionAttrs('toggleReminderGroup', ['active', mode]) +
      ' aria-expanded="' + (!collapsed) + '"><span><i>' + (collapsed ? '▸' : '▾') + '</i>' +
      REMINDER_MODE_NAMES[mode] + '</span><small>' + rows.length + ' 条</small></button>' +
      '<div class="reminder-group-list">' + rows.map(function(row){
        var item = row.item;
        return '<div class="reminder-item" data-drag-kind="reminder" data-drag-state="active" data-drag-id="' +
          escHtml(item.id) + '"' + actionAttrs('editReminder', [item.id]) + '>' +
          '<span class="reminder-time-chip">' + escHtml(item.time) + '</span>' +
          '<span class="reminder-copy"><b>' + escHtml(item.title) + '</b>' +
          '<span>' + escHtml(reminderRuleText(item)) + '</span>' +
          '<small>' + escHtml(reminderNextText(item)) + '</small></span>' +
          '<button class="reminder-convert"' + actionAttrs('convertReminderToTodo', [item.id]) + ' aria-label="转为待办">转</button>' +
          '<button class="reminder-del"' + actionAttrs('deleteReminder', [item.id]) + ' aria-label="删除提醒">×</button>' +
          '</div>';
      }).join('') + '</div></section>';
  }).join('') : '<div class="reminder-empty">还没有独立提醒<br>设置一次时间，让手机替你记住</div>';

  var archived = reminderArchivedItems();
  byId('reminder-archive-count').textContent = archived.length + ' 条';
  byId('reminder-archive-list').innerHTML = archived.length ? REMINDER_MODES.map(function(mode){
    var rows = archived.filter(function(item){ return item.mode === mode; });
    if (!rows.length) return '';
    var collapsed = !!reminderData.groupCollapsed.archived[mode];
    return '<div class="reminder-archive-group' + (collapsed ? ' collapsed' : '') + '">' +
      '<button type="button" class="reminder-group-head"' + actionAttrs('toggleReminderGroup', ['archived', mode]) +
      ' aria-expanded="' + (!collapsed) + '"><span><i>' + (collapsed ? '▸' : '▾') + '</i>' +
      REMINDER_MODE_NAMES[mode] + '</span><small>' + rows.length + ' 条</small></button>' +
      rows.map(function(item){
        var state = item.archiveReason === 'completed' ? '已提醒' :
          (item.archiveReason === 'converted' ? '已转待办' : '已删除');
        return '<div class="reminder-archive-item" data-drag-kind="reminder" data-drag-state="archive" data-drag-id="' +
          escHtml(item.id) + '">' +
          '<span class="reminder-archive-copy"><b>' + escHtml(item.title) + '</b></span>' +
          '<span class="reminder-archive-actions"><span class="reminder-archive-state">' + state + '</span>' +
          '<button' + actionAttrs('restoreReminder', [item.id]) + '>移回</button>' +
          '<button class="danger"' + actionAttrs('permanentDeleteReminder', [item.id]) + ' aria-label="彻底删除">×</button></span></div>';
      }).join('') + '</div>';
  }).join('') : '<div class="reminder-archive-empty">还没有归档提醒</div>';
  updateReminderSettings();
  renderHomeNotice();
  renderDashboard();
}

function toggleReminderGroup(scope, mode){
  if (!reminderData.groupCollapsed || !reminderData.groupCollapsed[scope]) return;
  reminderData.groupCollapsed[scope][mode] = !reminderData.groupCollapsed[scope][mode];
  storeSet(RKEY, reminderData);
  renderReminderPage();
}

function applyConfirmedReminders(){
  if (!reminderData || !window.AppNative || !window.AppNative.consumeConfirmedReminderIds) return;
  var ids = [];
  try { ids = JSON.parse(window.AppNative.consumeConfirmedReminderIds() || '[]'); }
  catch (error) { return; }
  if (!Array.isArray(ids) || !ids.length) return;
  var keep = [], changed = false;
  each(reminderData.items, function(item){
    if (item.mode === 'once' && ids.indexOf(item.id) >= 0) {
      item.archivedAt = Date.now();
      item.archiveReason = 'completed';
      reminderData.archived.push(item);
      changed = true;
    } else {
      keep.push(item);
    }
  });
  if (!changed) return;
  reminderData.items = keep;
  saveReminderState(false);
  renderReminderPage();
  toast('提醒已确认完成并归档');
}

function reminderOptions(start, end, selected){
  var out = '';
  for (var i = start; i <= end; i++) {
    out += '<option value="' + i + '"' + (i === selected ? ' selected' : '') + '>' + i + '</option>';
  }
  return out;
}

function reminderDefaultTime(){
  var d = new Date(Date.now() + 5 * 60000);
  d.setSeconds(0, 0);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function reminderDefaultDate(){
  var d = new Date(Date.now() + 5 * 60000);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function reminderItemById(id){
  for (var i = 0; i < reminderData.items.length; i++) {
    if (reminderData.items[i].id === id) return reminderData.items[i];
  }
  return null;
}

function reminderArchivedItems(){
  return reminderData.archived.slice().sort(function(a, b){
    return (b.archivedAt || 0) - (a.archivedAt || 0);
  });
}

function archiveCompletedReminders(){
  if (!reminderData) return false;
  var now = Date.now(), keep = [], moved = false;
  each(reminderData.items, function(item){
    if (item.mode !== 'once') {
      keep.push(item);
      return;
    }
    var deadline = new Date(item.date + 'T' + item.time + ':00').getTime();
    if (isNaN(deadline) || deadline > now) {
      keep.push(item);
      return;
    }
    item.archivedAt = now;
    item.archiveReason = 'completed';
    reminderData.archived.push(item);
    moved = true;
  });
  if (moved) reminderData.items = keep;
  return moved;
}

function openReminderForm(id){
  editingReminderId = typeof id === 'string' && id ? id : null;
  var existing = editingReminderId ? reminderItemById(editingReminderId) : null;
  if (!existing) editingReminderId = null;
  reminderDraftMode = existing ? existing.mode : 'once';
  reminderDraftWeekday = existing && existing.mode === 'weekly' ? existing.weekday : new Date().getDay();
  var today = new Date();
  var onceDate = existing && existing.mode === 'once' ? existing.date : reminderDefaultDate();
  var monthlyDay = existing && (existing.mode === 'monthly' || existing.mode === 'yearly') ? existing.day : today.getDate();
  var yearlyMonth = existing && existing.mode === 'yearly' ? existing.month : today.getMonth() + 1;
  openSheet(
    '<h3>' + (existing ? '编辑提醒' : '添加提醒') + '</h3>' +
    '<p>这是独立提醒，不会出现在待办清单里。</p>' +
    '<label class="todo-form-label">提醒内容</label>' +
    '<input class="todo-form-input" id="reminder-title" maxlength="60" placeholder="例如：交电费、给家里打电话" value="' +
      escHtml(existing ? existing.title : '') + '">' +
    '<label class="todo-form-label">提醒模式</label>' +
    '<div class="reminder-mode-grid" id="reminder-mode-buttons">' +
      '<button type="button" data-reminder-mode="once"' + actionAttrs('setReminderMode', ['once']) + '>仅一次</button>' +
      '<button type="button" data-reminder-mode="daily"' + actionAttrs('setReminderMode', ['daily']) + '>每天</button>' +
      '<button type="button" data-reminder-mode="weekly"' + actionAttrs('setReminderMode', ['weekly']) + '>每周</button>' +
      '<button type="button" data-reminder-mode="monthly"' + actionAttrs('setReminderMode', ['monthly']) + '>每月</button>' +
      '<button type="button" data-reminder-mode="yearly"' + actionAttrs('setReminderMode', ['yearly']) + '>每年</button>' +
    '</div>' +
    '<label class="todo-form-label">提醒时间</label>' +
    '<input class="todo-form-input" type="time" id="reminder-time" value="' +
      escHtml(existing ? existing.time : reminderDefaultTime()) + '">' +
    '<div id="reminder-once-wrap"><label class="todo-form-label">日期</label>' +
      '<input class="todo-form-input" type="date" id="reminder-date" value="' + onceDate + '"></div>' +
    '<div id="reminder-weekly-wrap"><label class="todo-form-label">星期</label>' +
      '<div class="reminder-weekdays" id="reminder-weekday-buttons">' +
        REMINDER_WEEKDAYS.map(function(label, day){
          return '<button type="button" data-reminder-weekday="' + day + '"' +
            actionAttrs('setReminderWeekday', [day]) + '>' + label.slice(1) + '</button>';
        }).join('') +
      '</div></div>' +
    '<div id="reminder-monthly-wrap"><label class="todo-form-label">每月第几天</label>' +
      '<select class="reminder-single-select" id="reminder-month-day">' +
        reminderOptions(1, 31, monthlyDay) + '</select>' +
      '<p class="reminder-field-note">遇到没有这一天的月份时，会在当月最后一天提醒。</p></div>' +
    '<div id="reminder-yearly-wrap"><label class="todo-form-label">每年的日期</label>' +
      '<div class="reminder-select-row"><select id="reminder-year-month" data-change-action="refreshReminderYearDays">' +
        reminderOptions(1, 12, yearlyMonth) + '</select>' +
        '<select id="reminder-year-day">' +
          reminderOptions(1, reminderDaysInMonth(2024, yearlyMonth), Math.min(monthlyDay, reminderDaysInMonth(2024, yearlyMonth))) + '</select></div>' +
      '<p class="reminder-field-note">2 月 29 日在非闰年会按 2 月最后一天提醒。</p></div>' +
    '<div class="row"><button class="ghost"' + actionAttrs('closeSheet') + '>取消</button>' +
    '<button class="primary"' + actionAttrs('saveReminder') + '>' + (existing ? '保存修改' : '保存提醒') + '</button></div>'
  );
  renderReminderEditorState();
  byId('reminder-title').addEventListener('keydown', function(e){
    if (e.key === 'Enter') { e.preventDefault(); saveReminder(); }
  });
}

function renderReminderEditorState(){
  each(byId('reminder-mode-buttons').querySelectorAll('button'), function(btn){
    btn.classList.toggle('on', btn.getAttribute('data-reminder-mode') === reminderDraftMode);
  });
  each(byId('reminder-weekday-buttons').querySelectorAll('button'), function(btn){
    btn.classList.toggle('on', parseInt(btn.getAttribute('data-reminder-weekday'), 10) === reminderDraftWeekday);
  });
  byId('reminder-once-wrap').style.display = reminderDraftMode === 'once' ? '' : 'none';
  byId('reminder-weekly-wrap').style.display = reminderDraftMode === 'weekly' ? '' : 'none';
  byId('reminder-monthly-wrap').style.display = reminderDraftMode === 'monthly' ? '' : 'none';
  byId('reminder-yearly-wrap').style.display = reminderDraftMode === 'yearly' ? '' : 'none';
}

function setReminderMode(mode){
  if (REMINDER_MODES.indexOf(mode) < 0) return;
  reminderDraftMode = mode;
  renderReminderEditorState();
}

function setReminderWeekday(day){
  day = parseInt(day, 10);
  if (day < 0 || day > 6) return;
  reminderDraftWeekday = day;
  renderReminderEditorState();
}

function refreshReminderYearDays(){
  var monthSelect = byId('reminder-year-month');
  var daySelect = byId('reminder-year-day');
  if (!monthSelect || !daySelect) return;
  var month = parseInt(monthSelect.value, 10) || 1;
  var selected = parseInt(daySelect.value, 10) || 1;
  var max = reminderDaysInMonth(2024, month);
  daySelect.innerHTML = reminderOptions(1, max, Math.min(selected, max));
}

function saveReminder(){
  var title = String(byId('reminder-title').value || '').trim();
  var time = byId('reminder-time').value;
  if (!title) { toast('请输入提醒内容'); return; }
  if (!reminderValidTime(time)) { toast('请选择提醒时间'); return; }
  var item = {
    id: editingReminderId || 'reminder_' + Date.now().toString(36),
    title: title,
    mode: reminderDraftMode,
    time: time,
    createdAt: new Date().toISOString()
  };
  if (item.mode === 'once') {
    item.date = byId('reminder-date').value;
    var once = new Date(item.date + 'T' + item.time + ':00');
    if (!item.date || isNaN(once.getTime())) { toast('请选择有效日期'); return; }
    if (once.getTime() <= Date.now()) { toast('这一次的提醒时间已经过去'); return; }
  } else if (item.mode === 'weekly') {
    item.weekday = reminderDraftWeekday;
  } else if (item.mode === 'monthly') {
    item.day = parseInt(byId('reminder-month-day').value, 10);
  } else if (item.mode === 'yearly') {
    item.month = parseInt(byId('reminder-year-month').value, 10);
    item.day = parseInt(byId('reminder-year-day').value, 10);
  }
  var existing = editingReminderId ? reminderItemById(editingReminderId) : null;
  if (existing) {
    item.createdAt = existing.createdAt || item.createdAt;
    var index = reminderData.items.indexOf(existing);
    reminderData.items[index] = item;
  } else {
    reminderData.items.push(item);
  }
  saveReminderState(true);
  closeSheet();
  renderReminderPage();
  toast(existing ? '提醒已更新' : '提醒已添加');
  editingReminderId = null;
}

function editReminder(id){
  openReminderForm(id);
}

function deleteReminder(id){
  var item = reminderItemById(id);
  if (!item) return;
  appConfirm('将“' + item.title + '”移入归档？', function(){
    archiveReminderNow(id);
  }, { title: '移入归档', confirmLabel: '移入归档' });
}

function archiveReminderNow(id){
  var item = reminderItemById(id);
  if (!item) return;
  reminderData.items = reminderData.items.filter(function(saved){ return saved.id !== id; });
  item.archivedAt = Date.now();
  item.archiveReason = 'deleted';
  reminderData.archived.push(item);
  saveReminderState(false);
  renderReminderPage();
  toast('提醒已移入归档');
}

function restoreReminder(id){
  var item = null;
  each(reminderData.archived, function(saved){ if (saved.id === id) item = saved; });
  if (!item) return;
  reminderData.archived = reminderData.archived.filter(function(saved){ return saved.id !== id; });
  delete item.archivedAt;
  delete item.archiveReason;
  if (item.mode === 'once') {
    var candidate = new Date(item.date + 'T' + item.time + ':00');
    if (isNaN(candidate.getTime()) || candidate.getTime() <= Date.now()) {
      candidate = reminderAtTime(new Date(), item.time);
      if (candidate.getTime() <= Date.now()) candidate.setDate(candidate.getDate() + 1);
      item.date = candidate.getFullYear() + '-' + pad2(candidate.getMonth() + 1) + '-' + pad2(candidate.getDate());
    }
  }
  reminderData.items.push(item);
  saveReminderState(true);
  renderReminderPage();
  toast('提醒已移回');
}

function permanentDeleteReminder(id){
  var item = null;
  each(reminderData.archived, function(saved){ if (saved.id === id) item = saved; });
  if (!item) return;
  appConfirm('彻底删除“' + item.title + '”？删除后不能恢复。', function(){
    reminderData.archived = reminderData.archived.filter(function(saved){ return saved.id !== id; });
    saveReminderState(false);
    renderReminderPage();
    toast('提醒已彻底删除');
  }, { title: '彻底删除提醒' });
}

function convertReminderToTodo(id){
  var item = reminderItemById(id);
  if (!item) return;
  var todo = {
    id: 'todo_' + Date.now().toString(36),
    title: item.title,
    repeat: item.mode,
    createdDate: wTodayStr(),
    done: false,
    doneDates: {}
  };
  if (item.mode === 'once') todo.date = item.date;
  if (item.mode === 'weekly') todo.weekday = item.weekday;
  if (item.mode === 'monthly' || item.mode === 'yearly') todo.day = item.day;
  if (item.mode === 'yearly') todo.month = item.month;
  reminderData.items = reminderData.items.filter(function(saved){ return saved.id !== id; });
  item.archivedAt = Date.now();
  item.archiveReason = 'converted';
  reminderData.archived.push(item);
  todoData.items.push(todo);
  saveReminderState(false);
  saveTodoState();
  renderReminderPage();
  renderTodoPage();
  syncTodoReminder();
  toast('已转为待办，原提醒时间未保留');
}

function toggleReminderHomeNotice(){
  reminderData.homeNoticeEnabled = reminderData.homeNoticeEnabled === false;
  if (reminderData.homeNoticeEnabled) reminderData.homeNoticeDismissedDate = '';
  saveReminderState(false);
  renderReminderPage();
}

function dismissHomeNoticeToday(){
  reminderData.homeNoticeDismissedDate = wTodayStr();
  saveReminderState(false);
  renderHomeNotice();
}

function reminderNativeItem(item){
  var out = {
    id: item.id, title: item.title, mode: item.mode, time: item.time
  };
  if (item.mode === 'once') out.date = item.date;
  if (item.mode === 'weekly') out.weekday = item.weekday;
  if (item.mode === 'monthly' || item.mode === 'yearly') out.day = item.day;
  if (item.mode === 'yearly') out.month = item.month;
  return out;
}

function syncStandaloneReminders(requestPermission){
  if (!reminderData) return;
  var items = reminderData.items.map(reminderNativeItem);
  if (window.AppNative && window.AppNative.configureStandaloneReminders) {
    var ok = window.AppNative.configureStandaloneReminders(
      JSON.stringify(items),
      !!requestPermission
    );
    setTxt('reminder-hint', '系统会在设定时间通知；修改后会立即同步。');
    return ok;
  } else {
    setTxt('reminder-hint', '当前为网页预览；安装 App 后可在后台按时提醒。');
    updateReminderSettings();
    renderHomeNotice();
  }
}

function initReminder(){
  loadReminderState();
  applyConfirmedReminders();
  byId('btn-reminder-add').addEventListener('click', function(){ openReminderForm(); });
  byId('btn-reminder-add-top').addEventListener('click', function(){ openReminderForm(); });
  renderReminderPage();
}
