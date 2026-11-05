/* ============================================================
   8.6 每日待办
   ============================================================ */
function todoDefaultState(){
  return {
    items: [],
    reminder: { enabled: false, hour: 20, minute: 0, lastNotified: '' }
  };
}

function loadTodoState(){
  var d = storeGet(TKEY, null);
  if (!d || typeof d !== 'object') d = todoDefaultState();
  if (!Array.isArray(d.items)) d.items = [];
  if (!d.reminder || typeof d.reminder !== 'object') d.reminder = todoDefaultState().reminder;
  if (d.reminder.hour === undefined) d.reminder.hour = 20;
  if (d.reminder.minute === undefined) d.reminder.minute = 0;
  d.reminder.enabled = !!d.reminder.enabled;
  d.items = d.items.filter(function(item){
    return item && typeof item.id === 'string' && typeof item.title === 'string' &&
      ['once','daily','weekdays','weekends','custom'].indexOf(item.repeat) >= 0;
  });
  each(d.items, function(item){
    if (!item.createdDate) item.createdDate = wTodayStr();
    if (!item.doneDates || typeof item.doneDates !== 'object') item.doneDates = {};
    if (item.repeat === 'custom' && !Array.isArray(item.dates)) item.dates = [];
    item.done = !!item.done;
  });
  todoData = d;
  saveTodoState();
}

function saveTodoState(){ todoData.schemaVersion = 1; storeSet(TKEY, todoData); }

function todoDateObject(date){
  var p = String(date).split('-');
  return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
}

function todoMatchesDate(item, date){
  if (item.repeat === 'once') return item.date === date;
  if (item.repeat === 'custom') return (item.dates || []).indexOf(date) >= 0;
  if (date < item.createdDate) return false;
  var day = todoDateObject(date).getDay();
  if (item.repeat === 'daily') return true;
  if (item.repeat === 'weekdays') return day >= 1 && day <= 5;
  if (item.repeat === 'weekends') return day === 0 || day === 6;
  return false;
}

function todoArchiveDate(item){
  if (item.repeat === 'once') return item.date || '';
  if (item.repeat === 'custom' && Array.isArray(item.dates) && item.dates.length) {
    return item.dates.slice().sort().pop();
  }
  return '';
}

function todoIsArchived(item, today){
  today = today || wTodayStr();
  if (item.repeat === 'once') return !!item.date && item.date < today;
  if (item.repeat === 'custom') {
    var dates = Array.isArray(item.dates) ? item.dates : [];
    return dates.length > 0 && dates.every(function(date){ return date < today; });
  }
  return false;
}

function todoArchivedItems(){
  return todoData.items.filter(function(item){ return todoIsArchived(item); })
    .sort(function(a, b){
      return todoArchiveDate(b).localeCompare(todoArchiveDate(a));
    });
}

function todoIsDone(item, date){
  if (item.repeat === 'once') return !!item.done;
  return !!(item.doneDates && item.doneDates[date]);
}

function todosForDate(date){
  return todoData.items.filter(function(item){ return todoMatchesDate(item, date); });
}

function pendingTodoCount(){
  var today = wTodayStr();
  return todosForDate(today).filter(function(item){ return !todoIsDone(item, today); }).length;
}

function todoRepeatText(item){
  if (item.repeat === 'once') {
    return item.date < wTodayStr() && !item.done ? '已逾期 · 原定 ' + workoutDateLabel(item.date) : '仅一次 · ' + workoutDateLabel(item.date);
  }
  if (item.repeat === 'daily') return '每天';
  if (item.repeat === 'weekdays') return '工作日';
  if (item.repeat === 'weekends') return '周末';
  return '自定义 · ' + (item.dates || []).length + ' 个日期';
}

function renderTodoPage(){
  if (!todoData) return;
  var today = wTodayStr();
  var items = todosForDate(today);
  var done = items.filter(function(item){ return todoIsDone(item, today); }).length;
  var pct = items.length ? done / items.length * 100 : 0;
  setTxt('todo-kicker', '今天 ' + workoutDateLabel(today));
  setTxt('todo-title', items.length && done === items.length ? '今天都补上了' : '把事情补上');
  setTxt('todo-sub', items.length ? '今天有 ' + items.length + ' 件事，完成 ' + done + ' 件。' : '今天没有待办，可以添加一件小事。');
  setTxt('todo-summary', done + ' / ' + items.length);
  byId('todo-progress').style.setProperty('--todo-progress', pct.toFixed(2) + '%');

  var list = byId('todo-list');
  list.innerHTML = items.length ? items.map(function(item){
    var isDone = todoIsDone(item, today);
    var overdue = item.repeat === 'once' && !isDone && item.date < today;
    return '<div class="todo-item' + (isDone ? ' done' : '') + (overdue ? ' overdue' : '') + '">' +
      '<button class="todo-check"' + actionAttrs('toggleTodo', [item.id]) + ' aria-label="切换完成">✓</button>' +
      '<span class="todo-copy"><b>' + escHtml(item.title) + '</b><span>' + todoRepeatText(item) + '</span></span>' +
      '<button class="todo-edit"' + actionAttrs('editTodo', [item.id]) + ' aria-label="编辑待办">改</button>' +
      '<button class="todo-del"' + actionAttrs('deleteTodo', [item.id]) + ' aria-label="删除待办">×</button></div>';
  }).join('') : '<div class="todo-empty">今天还没有待办<br>添加一件需要每天完成的小事</div>';

  var upcoming = [];
  each(todoData.items, function(item){
    if (item.repeat === 'once' && !item.done && item.date > today) {
      upcoming.push({ item: item, date: item.date });
    } else if (item.repeat === 'custom') {
      var future = (item.dates || []).filter(function(d){
        return d > today && !(item.doneDates && item.doneDates[d]);
      }).sort();
      if (future.length) upcoming.push({ item: item, date: future[0] });
    }
  });
  upcoming.sort(function(a, b){ return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  byId('todo-upcoming').innerHTML = upcoming.length ? upcoming.slice(0, 8).map(function(u){
    return '<button type="button" class="todo-up-item"' + actionAttrs('editTodo', [u.item.id]) + '>' +
      '<span>' + escHtml(u.item.title) + '</span><span>' + workoutDateLabel(u.date) + ' ›</span></button>';
  }).join('') : '<div class="todo-empty" style="padding:10px 0">未来还没有单独日期的事项</div>';

  var archived = todoArchivedItems();
  byId('todo-archive-count').textContent = archived.length + ' 项';
  byId('todo-archive-list').innerHTML = archived.length ? archived.map(function(item){
    var archiveDate = todoArchiveDate(item);
    var state;
    if (item.repeat === 'once') state = item.done ? '已完成' : '未完成';
    else state = '已结束';
    return '<div class="todo-archive-item">' +
      '<span class="todo-archive-copy"><b>' + escHtml(item.title) + '</b>' +
      '<span>原定 ' + workoutDateLabel(archiveDate) + (item.repeat === 'custom' ? ' · 自定义日期' : '') + '</span></span>' +
      '<span class="todo-archive-state">' + state + '</span></div>';
  }).join('') : '<div class="todo-archive-empty">还没有失效的待办</div>';

  var r = todoData.reminder;
  var time = pad2(r.hour) + ':' + pad2(r.minute);
  setTxt('todo-reminder-title', r.enabled ? '每天晚上 ' + time + ' 提醒' : '每天晚上提醒');
  setTxt('todo-reminder-desc', r.enabled ?
    '已开启 · 当前 ' + pendingTodoCount() + ' 项未完成' :
    '设置提醒时间，装成 App 后可在后台收到通知');
  byId('btn-todo-reminder').textContent = r.enabled ? '修改' : '设置';
  renderDashboard();
}

function setTodoRepeat(repeat){
  todoDraftRepeat = repeat;
  renderTodoEditorState();
}

function renderTodoEditorState(){
  each(byId('todo-repeat-buttons').querySelectorAll('button'), function(btn){
    btn.classList.toggle('on', btn.getAttribute('data-repeat') === todoDraftRepeat);
  });
  byId('todo-once-wrap').style.display = todoDraftRepeat === 'once' ? '' : 'none';
  byId('todo-custom-wrap').style.display = todoDraftRepeat === 'custom' ? '' : 'none';
  byId('todo-custom-dates').innerHTML = todoDraftDates.map(function(date){
    return '<span>' + workoutDateLabel(date) + '<button' + actionAttrs('removeTodoDraftDate', [date]) + '>×</button></span>';
  }).join('');
}

function editTodo(id){
  openTodoEditor(id);
}

function openTodoEditor(id){
  editingTodoId = typeof id === 'string' && id ? id : null;
  var existing = null;
  if (editingTodoId) {
    each(todoData.items, function(item){
      if (item.id === editingTodoId) existing = item;
    });
  }
  if (!existing) editingTodoId = null;
  todoDraftRepeat = existing ? existing.repeat : 'daily';
  todoDraftDates = existing && existing.repeat === 'custom' ? (existing.dates || []).slice() : [];
  var onceDate = existing && existing.repeat === 'once' && existing.date ? existing.date : wTodayStr();
  openSheet(
    '<h3>' + (existing ? '编辑待办' : '添加待办') + '</h3>' +
    '<p>' + (existing ? '修改内容或重复方式，原完成记录会尽量保留。' : '设置一次或重复出现的提醒事项。') + '</p>' +
    '<label class="todo-form-label">待办内容</label>' +
    '<input class="todo-form-input" id="todo-name" maxlength="30" placeholder="例如：吃维生素、拉伸、记账" value="' +
      escHtml(existing ? existing.title : '') + '">' +
    '<label class="todo-form-label">重复方式</label>' +
    '<div class="todo-repeat" id="todo-repeat-buttons">' +
      '<button type="button" data-repeat="once"' + actionAttrs('setTodoRepeat', ['once']) + '>仅一次</button>' +
      '<button type="button" data-repeat="daily"' + actionAttrs('setTodoRepeat', ['daily']) + '>每天</button>' +
      '<button type="button" data-repeat="weekdays"' + actionAttrs('setTodoRepeat', ['weekdays']) + '>工作日</button>' +
      '<button type="button" data-repeat="weekends"' + actionAttrs('setTodoRepeat', ['weekends']) + '>周末</button>' +
      '<button type="button" data-repeat="custom"' + actionAttrs('setTodoRepeat', ['custom']) + '>自定义日期</button>' +
    '</div>' +
    '<div id="todo-once-wrap" style="display:none"><label class="todo-form-label">日期</label><input class="todo-form-input" type="date" id="todo-once-date" value="' + onceDate + '"></div>' +
    '<div id="todo-custom-wrap" style="display:none"><label class="todo-form-label">选择一个日期后添加</label>' +
      '<div class="new-exercise"><input id="todo-custom-date" type="date" value="' + wTodayStr() + '"><button type="button"' + actionAttrs('addTodoDraftDate') + '>添加日期</button></div>' +
      '<div class="todo-custom-dates" id="todo-custom-dates"></div></div>' +
    '<div class="row"><button class="ghost"' + actionAttrs('closeSheet') + '>取消</button>' +
    '<button class="primary"' + actionAttrs('saveTodoItem') + '>' + (existing ? '保存修改' : '保存待办') + '</button></div>'
  );
  renderTodoEditorState();
  byId('todo-name').addEventListener('keydown', function(e){
    if (e.key === 'Enter') { e.preventDefault(); saveTodoItem(); }
  });
}

function addTodoDraftDate(){
  var input = byId('todo-custom-date');
  var date = input ? input.value : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('请选择日期'); return; }
  if (todoDraftDates.indexOf(date) < 0) todoDraftDates.push(date);
  todoDraftDates.sort();
  renderTodoEditorState();
}

function removeTodoDraftDate(date){
  todoDraftDates = todoDraftDates.filter(function(d){ return d !== date; });
  renderTodoEditorState();
}

function saveTodoItem(){
  var input = byId('todo-name');
  var title = input ? input.value.trim() : '';
  if (!title) { toast('请输入待办内容'); return; }
  var nextDate = todoDraftRepeat === 'once' ? byId('todo-once-date').value : '';
  if (todoDraftRepeat === 'once' && !nextDate) { toast('请选择日期'); return; }
  if (todoDraftRepeat === 'custom' && !todoDraftDates.length) { toast('请至少添加一个日期'); return; }
  var existing = null;
  if (editingTodoId) {
    each(todoData.items, function(saved){
      if (saved.id === editingTodoId) existing = saved;
    });
  }
  var item = existing || {
    id: 'todo_' + Date.now().toString(36),
    title: title,
    repeat: todoDraftRepeat,
    createdDate: wTodayStr(),
    done: false,
    doneDates: {}
  };
  var previousRepeat = item.repeat;
  var previousDate = item.date || '';
  item.title = title;
  item.repeat = todoDraftRepeat;
  if (todoDraftRepeat === 'once') {
    item.date = nextDate;
  } else {
    delete item.date;
  }
  if (todoDraftRepeat === 'custom') {
    item.dates = todoDraftDates.slice();
  } else {
    delete item.dates;
  }
  if (existing && (previousRepeat !== item.repeat || (item.repeat === 'once' && previousDate !== item.date))) {
    item.done = false;
    item.doneDates = {};
  }
  if (!existing) todoData.items.push(item);
  saveTodoState();
  closeSheet();
  renderTodoPage();
  syncTodoReminder();
  toast(existing ? '待办已更新' : '待办已添加');
  editingTodoId = null;
}

function toggleTodo(id){
  var item = null, today = wTodayStr();
  each(todoData.items, function(t){ if (t.id === id) item = t; });
  if (!item) return;
  if (item.repeat === 'once') item.done = !item.done;
  else {
    item.doneDates = item.doneDates || {};
    if (item.doneDates[today]) delete item.doneDates[today];
    else item.doneDates[today] = Date.now();
  }
  saveTodoState();
  renderTodoPage();
  syncTodoReminder();
}

function deleteTodo(id){
  appConfirm('删除这条待办？', function(){
    todoData.items = todoData.items.filter(function(item){ return item.id !== id; });
    saveTodoState();
    renderTodoPage();
    syncTodoReminder();
    toast('待办已删除');
  }, { title: '删除待办' });
}

function openReminderSettings(){
  var r = todoData.reminder;
  openSheet(
    '<h3>每天晚上提醒</h3>' +
    '<p>提醒每天重复。打包为 App 后使用系统本地通知，不需要 App 一直开着。</p>' +
    '<label class="todo-form-label">提醒时间</label>' +
    '<input class="todo-form-input" type="time" id="todo-reminder-time" value="' + pad2(r.hour) + ':' + pad2(r.minute) + '">' +
    '<div class="row"><button class="ghost"' + actionAttrs('closeSheet') + '>取消</button>' +
    '<button class="primary"' + actionAttrs('enableTodoReminder') + '>开启提醒</button></div>' +
    (r.enabled ? '<button class="danger" style="width:100%;margin-top:8px"' + actionAttrs('disableTodoReminder') + '>关闭提醒</button>' : '')
  );
}

function enableTodoReminder(){
  var value = byId('todo-reminder-time').value || '20:00';
  var hm = value.split(':');
  todoData.reminder.hour = intIn(hm[0], 0, 23);
  todoData.reminder.minute = intIn(hm[1], 0, 59);
  if (todoData.reminder.hour === null || todoData.reminder.minute === null) { toast('请选择提醒时间'); return; }

  if (window.AppNative && window.AppNative.configureDailyReminder) {
    todoData.reminder.enabled = true;
    saveTodoState();
    window.AppNative.configureDailyReminder(todoData.reminder.hour, todoData.reminder.minute, pendingTodoCount(), wTodayStr());
    closeSheet();
    renderTodoPage();
    toast('每日提醒已开启');
    return;
  }

  if (!('Notification' in window)) {
    toast('当前预览没有系统通知，打包后可用');
    return;
  }
  Notification.requestPermission().then(function(permission){
    if (permission === 'granted') {
      todoData.reminder.enabled = true;
      saveTodoState();
      closeSheet();
      renderTodoPage();
      toast('浏览器提醒已开启');
    } else {
      toast('通知权限未开启');
    }
  });
}

function disableTodoReminder(){
  todoData.reminder.enabled = false;
  saveTodoState();
  if (window.AppNative && window.AppNative.cancelDailyReminder) window.AppNative.cancelDailyReminder();
  closeSheet();
  renderTodoPage();
  toast('每日提醒已关闭');
}

function syncTodoReminder(){
  if (!todoData || !todoData.reminder.enabled) return;
  if (window.AppNative && window.AppNative.configureDailyReminder) {
    window.AppNative.configureDailyReminder(
      todoData.reminder.hour,
      todoData.reminder.minute,
      pendingTodoCount(),
      wTodayStr()
    );
  }
}

function checkTodoReminder(){
  if (!todoData || !todoData.reminder.enabled) return;
  var r = todoData.reminder, now = new Date(), today = wTodayStr();
  if (r.lastNotified === today) return;
  if (now.getHours() !== r.hour || now.getMinutes() !== r.minute) return;
  r.lastNotified = today;
  saveTodoState();
  if ('Notification' in window && Notification.permission === 'granted') {
    var count = pendingTodoCount();
    new Notification('补 · 今晚的待办', {
      body: count ? '还有 ' + count + ' 项没有完成' : '今天的待办都完成了',
      tag: 'todo-daily'
    });
  }
}

function renderDashboard(){
  if (!byId('home-date')) return;
  var now = new Date();
  var week = ['日','一','二','三','四','五','六'][now.getDay()];
  setTxt('home-date', (now.getMonth() + 1) + '月' + now.getDate() + '日 · 周' + week);

  if (fit) {
    var active = activeWorkout();
    var todayCount = fit.sessions.filter(function(s){ return s.date === wTodayStr(); }).length;
    setTxt('home-fitness-copy', active ? '训练进行中 · ' + formatWorkoutDuration(Date.now() - active.startAt) : (todayCount ? '今天已训练 ' + todayCount + ' 次' : '记录今天的训练'));
  }
  if (wd) setTxt('home-water-copy', '今天 ' + wTotal() + ' / ' + (wd.dailyGoal || 2000) + ' ml');
  if (S && S.quitDate) setTxt('home-quit-copy', '已经坚持 ' + Math.floor((Date.now() - S.quitDate) / 86400000) + ' 天');
  if (todoData) {
    var pending = pendingTodoCount();
    setTxt('home-todo-copy', pending ? pending + ' 项待完成' : '今天已经完成');
  }
  if (reminderData) {
    var reminderRows = reminderSortedItems().filter(function(row){ return row.next && row.ts !== Infinity; });
    setTxt('home-reminder-copy', reminderRows.length ?
      '下一条 · ' + reminderShortDate(reminderRows[0].next) :
      (reminderData.items.length ? '没有即将到来的提醒' : '没有独立提醒'));
    renderHomeNotice();
  }
  if (ledgerData) {
    var lbook = currentLedgerBook();
    var month = new Date().getFullYear() + '-' + pad2(new Date().getMonth() + 1);
    var total = 0;
    each(lbook.records, function(r){ if (String(r.date).indexOf(month) === 0) total += r.amount; });
    setTxt('home-ledger-copy', total ? '本月 ' + ledgerMoney(total) : '本月还没有记录');
  }
}

function initTodo(){
  loadTodoState();
  byId('btn-todo-add').addEventListener('click', openTodoEditor);
  byId('btn-todo-add-top').addEventListener('click', openTodoEditor);
  byId('btn-todo-reminder').addEventListener('click', openReminderSettings);
  renderTodoPage();
  syncTodoReminder();
}
