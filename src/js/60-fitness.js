/* ============================================================
   8.5 训练
   ============================================================ */

function workoutDefaultState(){
  return {
    exercises: DEFAULT_EXERCISES.map(function(e){ return { id: e.id, name: e.name, type: e.type }; }),
    plans: [{
      id: 'plan_default',
      name: '默认训练',
      items: DEFAULT_EXERCISES.map(function(e){
        return { itemId: 'default_item_' + e.id, exerciseId: e.id, type: e.type, sets: e.type === 'sets' ? 4 : 0, minutes: e.type === 'duration' ? 20 : 0 };
      })
    }],
    sessions: [],
    cheatMeals: [],
    archiveMonths: {},
    activeSessionId: null
  };
}

var workoutItemSeq = 0;

function newWorkoutItemId(){
  workoutItemSeq++;
  return 'item_' + Date.now().toString(36) + '_' + workoutItemSeq.toString(36);
}

function exerciseById(id){
  for (var i = 0; i < fit.exercises.length; i++) if (fit.exercises[i].id === id) return fit.exercises[i];
  return null;
}

function normalizedPlanItem(item, index){
  if (!item || typeof item.exerciseId !== 'string') return null;
  var ex = exerciseById(item.exerciseId);
  var type = item.type || (ex && ex.type);
  if (type !== 'duration' && type !== 'sets') {
    for (var i = 0; i < DEFAULT_EXERCISES.length; i++) {
      if (DEFAULT_EXERCISES[i].id === item.exerciseId) type = DEFAULT_EXERCISES[i].type;
    }
  }
  if (type !== 'duration') type = 'sets';
  var itemId = typeof item.itemId === 'string' && item.itemId ?
    item.itemId : 'item_' + item.exerciseId + '_' + (Number(index) || 0);
  if (type === 'duration') {
    return {
      itemId: itemId, exerciseId: item.exerciseId, name: item.name || '', type: type, sets: 0,
      minutes: Math.min(180, Math.max(1, parseInt(item.minutes, 10) || 20))
    };
  }
  return {
    itemId: itemId, exerciseId: item.exerciseId, name: item.name || '', type: type,
    sets: Math.min(20, Math.max(1, parseInt(item.sets, 10) || 4)), minutes: 0
  };
}

function normalizedPlanItems(items){
  var out = [];
  each(items || [], function(item, index){
    var p = normalizedPlanItem(item, index);
    if (p) out.push(p);
  });
  return out;
}

function loadWorkoutState(){
  var d = storeGet(FKEY, null);
  if (!d || typeof d !== 'object') d = workoutDefaultState();
  if (!Array.isArray(d.exercises)) d.exercises = [];
  if (!Array.isArray(d.plans)) d.plans = [];
  if (!Array.isArray(d.sessions)) d.sessions = [];
  if (!Array.isArray(d.cheatMeals)) d.cheatMeals = [];
  if (!d.archiveMonths || typeof d.archiveMonths !== 'object' || Array.isArray(d.archiveMonths)) d.archiveMonths = {};

  // 保证五个默认动作始终存在。
  each(DEFAULT_EXERCISES, function(base){
    var exists = d.exercises.some(function(e){ return e && e.id === base.id; });
    if (!exists) d.exercises.push({ id: base.id, name: base.name, type: base.type });
  });
  d.exercises = d.exercises.filter(function(e){
    return e && typeof e.id === 'string' && typeof e.name === 'string' && e.name.trim();
  });
  each(d.exercises, function(e){
    if (e.type !== 'duration' && e.type !== 'sets') e.type = 'sets';
  });
  each(DEFAULT_EXERCISES, function(base){
    each(d.exercises, function(e){ if (e.id === base.id) e.type = base.type; });
  });
  fit = d;

  if (!d.plans.length && Array.isArray(d.lastPlan) && d.lastPlan.length) {
    d.plans.push({ id: 'plan_migrated', name: '上次训练', items: normalizedPlanItems(d.lastPlan) });
  }
  if (!d.plans.length) d.plans = workoutDefaultState().plans;
  d.plans = d.plans.filter(function(p){
    return p && typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.items);
  });
  each(d.plans, function(p){
    p.items = normalizedPlanItems(p.items);
  });
  d.plans = d.plans.filter(function(p){ return p.items.length; });
  if (!d.plans.length) d.plans = workoutDefaultState().plans;

  d.sessions = d.sessions.filter(function(s){
    return s && typeof s.id === 'string' && typeof s.date === 'string' &&
      typeof s.startAt === 'number' && Array.isArray(s.plan) && Array.isArray(s.sets);
  });
  each(d.sessions, function(s){
    s.plan = normalizedPlanItems(s.plan).map(function(p){
      var ex = exerciseById(p.exerciseId);
      p.name = (ex && ex.name) || p.name || p.exerciseId;
      return p;
    });
    var planByExercise = {};
    each(s.plan, function(item){
      planByExercise[item.exerciseId] = planByExercise[item.exerciseId] || [];
      planByExercise[item.exerciseId].push(item);
    });
    var usedByItem = {};
    each(s.sets, function(record){
      if (record.itemId) return;
      var candidates = planByExercise[record.exerciseId] || [];
      var chosen = candidates[0];
      for (var i = 0; i < candidates.length; i++) {
        var count = usedByItem[candidates[i].itemId] || 0;
        var target = planItemType(candidates[i]) === 'duration' ? 1 : candidates[i].sets;
        if (count < target) { chosen = candidates[i]; break; }
      }
      if (chosen) {
        record.itemId = chosen.itemId;
        usedByItem[chosen.itemId] = (usedByItem[chosen.itemId] || 0) + 1;
      }
    });
    if (!s.timedStarts || typeof s.timedStarts !== 'object') s.timedStarts = {};
    var normalizedTimedStarts = {};
    each(Object.keys(s.timedStarts), function(key){
      var direct = s.plan.some(function(item){ return item.itemId === key; });
      if (direct) {
        normalizedTimedStarts[key] = s.timedStarts[key];
        return;
      }
      var match = (planByExercise[key] || [])[0];
      if (match) normalizedTimedStarts[match.itemId] = s.timedStarts[key];
    });
    s.timedStarts = normalizedTimedStarts;
  });
  d.cheatMeals = d.cheatMeals.filter(function(m){
    return m && typeof m.id === 'string' && typeof m.date === 'string' && typeof m.at === 'number';
  });
  var active = d.sessions.some(function(s){ return s.id === d.activeSessionId && !s.endAt; });
  if (!active) d.activeSessionId = null;
  archiveOldWorkouts();
  saveWorkout();
  return d;
}

function saveWorkout(){ fit.schemaVersion = 3; storeSet(FKEY, fit); }

function archiveOldWorkouts(){
  if (!fit) return false;
  var now = new Date();
  var previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var cutoff = previous.getFullYear() + '-' + pad2(previous.getMonth() + 1);
  var keep = [], keepMeals = [], changed = false;
  each(Object.keys(fit.archiveMonths), function(key){
    var value = fit.archiveMonths[key];
    if (typeof value === 'number') {
      fit.archiveMonths[key] = { trainings: value, cheats: 0 };
      changed = true;
    } else if (!value || typeof value !== 'object') {
      fit.archiveMonths[key] = { trainings: 0, cheats: 0 };
      changed = true;
    }
  });
  each(fit.sessions, function(s){
    var key = s.date.slice(0, 7);
    if (key < cutoff) {
      var old = fit.archiveMonths[key] || { trainings: 0, cheats: 0 };
      old.trainings = (old.trainings || 0) + 1;
      fit.archiveMonths[key] = old;
      changed = true;
    } else {
      keep.push(s);
    }
  });
  each(fit.cheatMeals || [], function(m){
    var key = m.date.slice(0, 7);
    if (key < cutoff) {
      var old = fit.archiveMonths[key] || { trainings: 0, cheats: 0 };
      old.cheats = (old.cheats || 0) + 1;
      fit.archiveMonths[key] = old;
      changed = true;
    } else {
      keepMeals.push(m);
    }
  });
  if (changed) fit.sessions = keep;
  if (changed) fit.cheatMeals = keepMeals;
  return changed;
}

function activeWorkout(){
  if (!fit || !fit.activeSessionId) return null;
  for (var i = 0; i < fit.sessions.length; i++) {
    if (fit.sessions[i].id === fit.activeSessionId && !fit.sessions[i].endAt) return fit.sessions[i];
  }
  return null;
}

function workoutExerciseName(id){
  for (var i = 0; i < fit.exercises.length; i++) if (fit.exercises[i].id === id) return fit.exercises[i].name;
  return '';
}

function workoutPlanTotals(plan){
  var sets = 0, minutes = 0, timed = 0;
  each(plan || [], function(p){
    var type = p.type || (exerciseById(p.exerciseId) || {}).type || 'sets';
    if (type === 'duration') {
      minutes += Math.max(1, parseInt(p.minutes, 10) || 20);
      timed++;
    } else {
      sets += Math.max(1, parseInt(p.sets, 10) || 1);
    }
  });
  return { exercises: (plan || []).length, sets: sets, minutes: minutes, timed: timed, tasks: sets + timed };
}

function workoutPlanSummary(plan){
  var t = workoutPlanTotals(plan), parts = [t.exercises + ' 个动作'];
  if (t.sets) parts.push(t.sets + ' 组');
  if (t.minutes) parts.push(t.minutes + ' 分钟');
  return parts.join(' · ');
}

function planItemType(item){
  if (item && (item.type === 'duration' || item.type === 'sets')) return item.type;
  var ex = item && exerciseById(item.exerciseId);
  return ex && ex.type === 'duration' ? 'duration' : 'sets';
}

function recordsForPlanItem(session, item){
  if (!item) return [];
  return session.sets.filter(function(record){
    if (record.itemId) return record.itemId === item.itemId;
    return record.exerciseId === item.exerciseId;
  });
}

function completedTasks(session){
  var done = 0;
  each(session.plan, function(item){
    var records = recordsForPlanItem(session, item);
    if (planItemType(item) === 'duration') {
      done += records.some(function(r){ return r.kind === 'duration' || r.durationMs > 0; }) ? 1 : 0;
    } else {
      done += records.filter(function(r){ return r.kind !== 'duration'; }).length;
    }
  });
  return done;
}

function workoutIsComplete(session){
  return completedTasks(session) >= workoutPlanTotals(session.plan).tasks;
}

function formatWorkoutDuration(ms){
  var total = Math.max(0, Math.floor(ms / 1000));
  var h = Math.floor(total / 3600);
  var m = Math.floor((total % 3600) / 60);
  var s = total % 60;
  return pad2(h) + ':' + pad2(m) + ':' + pad2(s);
}

function workoutTimeText(ms){
  var d = new Date(ms);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

function workoutDateLabel(date){
  var p = String(date || '').split('-');
  if (p.length !== 3) return date || '';
  return parseInt(p[1], 10) + '月' + parseInt(p[2], 10) + '日';
}

function workoutMonthData(year, month){
  var prefix = year + '-' + pad2(month + 1);
  var sessions = fit.sessions.filter(function(s){ return s.date.indexOf(prefix + '-') === 0; });
  var meals = (fit.cheatMeals || []).filter(function(m){ return m.date.indexOf(prefix + '-') === 0; });
  var days = {}, cheatDays = {};
  each(sessions, function(s){ days[s.date] = (days[s.date] || 0) + 1; });
  each(meals, function(m){ cheatDays[m.date] = (cheatDays[m.date] || 0) + 1; });
  return {
    prefix: prefix,
    sessions: sessions,
    meals: meals,
    days: Object.keys(days),
    countByDay: days,
    cheatByDay: cheatDays
  };
}

function renderWorkoutHome(){
  if (!fit) return;
  var active = activeWorkout();
  var today = wTodayStr();
  var todaySessions = fit.sessions.filter(function(s){ return s.date === today; });
  var now = new Date();
  var current = workoutMonthData(now.getFullYear(), now.getMonth());
  setTxt('fit-month-days', '' + current.days.length);
  setTxt('fit-month-count', '' + current.sessions.length);
  setTxt('fit-month-cheats', '' + current.meals.length);

  byId('workout-start-view').style.display = active ? 'none' : '';
  byId('workout-active-view').style.display = active ? '' : 'none';
  if (active) {
    setTxt('fit-kicker', '训练进行中');
    setTxt('fit-title', '一组一组来');
    setTxt('fit-desc', '按下每一组完成时，时间点会自动记在训练里。');
  } else if (todaySessions.length) {
    setTxt('fit-kicker', '今天');
    setTxt('fit-title', '今天已经练过');
    setTxt('fit-desc', todaySessions.length + ' 次训练已经记进日历，想练就再来一组。');
  } else {
    setTxt('fit-kicker', '今天');
    setTxt('fit-title', '准备好就练');
    setTxt('fit-desc', '记录每次训练、每个动作和每一组完成的时间。');
  }

  var preview = byId('fit-plan-preview');
  setTxt('fit-plan-label', fit.plans.length + ' 个已保存');
  preview.innerHTML = fit.plans.map(function(plan){
    return '<div class="fit-plan-option">' +
      '<button class="fit-plan-copy"' + actionAttrs('openWorkoutPlan', [plan.id]) + '>' +
      '<b>' + escHtml(plan.name) + '</b><span>' + workoutPlanSummary(plan.items) + '</span></button>' +
      '<button class="fit-plan-start"' + actionAttrs('startWorkoutFromPlan', [plan.id]) + '>开始</button>' +
      '</div>';
  }).join('');

  renderActiveWorkout();
  renderWorkoutCalendar();
  renderRecentWorkouts();
}

function renderActiveWorkout(){
  var active = activeWorkout();
  if (!active) return;
  var total = workoutPlanTotals(active.plan);
  var done = completedTasks(active);
  var pct = total.tasks ? Math.min(100, done / total.tasks * 100) : 0;
  var setDone = 0, timedDone = 0;
  each(active.plan, function(item){
    var records = recordsForPlanItem(active, item);
    if (planItemType(item) === 'duration') {
      timedDone += records.some(function(r){ return r.kind === 'duration' || r.durationMs > 0; }) ? 1 : 0;
    } else {
      setDone += records.filter(function(r){ return r.kind !== 'duration'; }).length;
    }
  });
  var countText = [];
  if (total.sets) countText.push(setDone + ' / ' + total.sets + ' 组');
  if (total.timed) countText.push(timedDone + ' / ' + total.timed + ' 时长');
  setTxt('workout-timer', formatWorkoutDuration(Date.now() - active.startAt));
  setTxt('workout-count', countText.join(' · '));
  byId('workout-progress').style.setProperty('--fit-progress', pct.toFixed(2) + '%');

  var html = '';
  each(active.plan, function(item){
    var records = recordsForPlanItem(active, item);
    var type = planItemType(item);
    var isDone, detail, times = '', action;
    if (type === 'duration') {
      var timedRecord = records.filter(function(r){ return r.kind === 'duration' || r.durationMs > 0; })[0];
      isDone = !!timedRecord;
      detail = '<span class="fit-duration-target">目标 ' + item.minutes + ' 分钟</span>';
      if (timedRecord) {
        action = '<span class="fit-setdone">已记录</span>';
        times = '<div class="fit-set-times"><span>实际 ' + formatWorkoutDuration(timedRecord.durationMs || 0) +
          ' · 本次 ' + formatWorkoutDuration(timedRecord.elapsed || 0) + '</span></div>';
      } else {
        var hasStarted = active.timedStarts && Object.prototype.hasOwnProperty.call(active.timedStarts, item.itemId);
        if (hasStarted) {
          var started = timedStartElapsed(active, item.itemId);
          action = '<span class="fit-duration-live" data-timed-live="' + escHtml(item.itemId) + '">' +
            formatWorkoutDuration(Math.max(0, Date.now() - active.startAt - started)) + '</span>' +
            '<button class="fit-setbtn" data-time-finish="' + escHtml(item.itemId) + '">完成</button>';
        } else {
          action = '<button class="fit-setbtn" data-time-start="' + escHtml(item.itemId) + '">开始计时</button>';
        }
      }
    } else {
      var setRecords = records.filter(function(r){ return r.kind !== 'duration'; });
      isDone = setRecords.length >= item.sets;
      detail = '<span class="fit-ex-count">' + setRecords.length + ' / ' + item.sets + ' 组</span>';
      action = isDone ? '<span class="fit-setdone">已完成</span>' :
        '<button class="fit-setbtn" data-ex="' + escHtml(item.itemId) + '">完成第 ' + (setRecords.length + 1) + ' 组</button>';
      if (setRecords.length) {
        times = '<div class="fit-set-times">' + setRecords.map(function(r){
          return '<span>' + formatWorkoutDuration(r.elapsed || 0) + '</span>';
        }).join('') + '</div>';
      }
    }
    html += '<div class="fit-ex' + (isDone ? ' done' : '') + '">' +
      '<div class="fit-ex-head"><b>' + escHtml(item.name) + '</b>' + detail + action + '</div>' + times + '</div>';
  });
  byId('active-ex-list').innerHTML = html;
  ensureWorkoutTicker();
}

function renderWorkoutTiming(){
  var active = activeWorkout();
  if (!active || !active.timedStarts) return;
  var live = bySelector('[data-timed-live]', byId('active-ex-list'));
  each(live, function(el){
    var id = el.getAttribute('data-timed-live');
    if (Object.prototype.hasOwnProperty.call(active.timedStarts, id)) {
      el.textContent = formatWorkoutDuration(Math.max(0, Date.now() - active.startAt - timedStartElapsed(active, id)));
    }
  });
}

function paintLiveWorkout(){
  var active = activeWorkout();
  if (!active) return false;
  setTxt('workout-timer', formatWorkoutDuration(Date.now() - active.startAt));
  renderWorkoutTiming();
  return true;
}

function paintLiveTimers(){
  paintLiveWorkout();
  if (page === 4) renderQuit();
}

function workoutAnimationFrame(timestamp){
  workoutFrameId = 0;
  if (!activeWorkout()) return;
  if (timestamp - workoutLastPaint >= 200) {
    workoutLastPaint = timestamp;
    paintLiveWorkout();
  }
  workoutFrameId = requestAnimationFrame(workoutAnimationFrame);
}

function ensureWorkoutTicker(){
  if (workoutFrameId || !activeWorkout()) return;
  workoutLastPaint = 0;
  workoutFrameId = requestAnimationFrame(workoutAnimationFrame);
}

function timedStartElapsed(active, exerciseId){
  var value = active.timedStarts ? active.timedStarts[exerciseId] : 0;
  // 兼容旧记录：旧版本保存的是绝对时间。
  return value > active.startAt ? value - active.startAt : Math.max(0, Number(value) || 0);
}

function availableWorkoutMonths(){
  var now = new Date();
  var keys = {};
  keys[now.getFullYear() + '-' + pad2(now.getMonth() + 1)] = true;
  each(fit.sessions, function(s){ keys[s.date.slice(0, 7)] = true; });
  each(fit.cheatMeals || [], function(m){ keys[m.date.slice(0, 7)] = true; });
  each(Object.keys(fit.archiveMonths || {}), function(key){ keys[key] = true; });
  return Object.keys(keys).sort().reverse();
}

function setCalendarMonth(key){
  var keys = availableWorkoutMonths();
  var next = keys.indexOf(key);
  calMonthIndex = next < 0 ? 0 : next;
  renderWorkoutCalendar();
}

function renderWorkoutCalendar(){
  if (!fit) return;
  var months = availableWorkoutMonths();
  if (calMonthIndex < 0 || calMonthIndex >= months.length) calMonthIndex = 0;
  var key = months[calMonthIndex];
  var p = key.split('-');
  var year = parseInt(p[0], 10), month = parseInt(p[1], 10) - 1;
  var data = workoutMonthData(year, month);
  var archived = fit.archiveMonths && fit.archiveMonths[key];
  setTxt('cal-title', year + ' 年 ' + (month + 1) + ' 月');
  byId('cal-prev').disabled = calMonthIndex >= months.length - 1;
  byId('cal-next').disabled = calMonthIndex <= 0;
  byId('fit-month-jumps').innerHTML = months.map(function(mk){
    var mp = mk.split('-');
    return '<button class="' + (mk === key ? 'on' : '') + '"' + actionAttrs('setCalendarMonth', [mk]) + '>' +
      parseInt(mp[1], 10) + ' 月</button>';
  }).join('');

  byId('cal-current-view').style.display = archived ? 'none' : '';
  byId('cal-archive-detail').style.display = archived ? '' : 'none';
  if (archived) {
    var old = typeof archived === 'number' ? { trainings: archived, cheats: 0 } : archived;
    byId('cal-archive-detail').innerHTML = '<b>' + year + ' 年 ' + (month + 1) + ' 月已归档</b>' +
      '<span>训练 ' + (old.trainings || 0) + ' 次 · 放纵餐 ' + (old.cheats || 0) + ' 顿<br>归档月份不保留具体日期</span>';
  } else {
    var counts = data.countByDay;
    var cheats = data.cheatByDay;
    var first = new Date(year, month, 1);
    var lead = (first.getDay() + 6) % 7;
    var days = new Date(year, month + 1, 0).getDate();
    var today = wTodayStr();
    var html = '';
    for (var b = 0; b < lead; b++) html += '<button class="fit-day blank"></button>';
    for (var day = 1; day <= days; day++) {
      var ds = year + '-' + pad2(month + 1) + '-' + pad2(day);
      var trained = !!counts[ds];
      var cheat = !!cheats[ds];
      var hasRecord = trained || cheat;
      var cls = 'fit-day' + (trained ? ' trained' : '') + (cheat ? ' cheat' : '') + (ds === today ? ' today' : '');
      html += '<button class="' + cls + '"' + (hasRecord ? ' data-date="' + ds + '"' : '') + '>' + day + '</button>';
    }
    byId('cal-grid').innerHTML = html;
    setTxt('cal-summary', data.days.length + ' 天训练 · ' + data.sessions.length + ' 次 · ' + data.meals.length + ' 顿放纵餐');
    setTxt('fit-cheat-month', (data.meals.length ? (month + 1) + ' 月 ' + data.meals.length + ' 顿放纵餐' : (month + 1) + ' 月还没记录放纵餐'));
  }

  var archiveMonths = fit.archiveMonths || {};
  var archiveKeys = Object.keys(archiveMonths).sort().reverse();
  byId('fit-archive').innerHTML = archiveKeys.length ? archiveKeys.map(function(ak){
    var ap = ak.split('-');
    var item = typeof archiveMonths[ak] === 'number' ? { trainings: archiveMonths[ak], cheats: 0 } : archiveMonths[ak];
    return '<div class="fit-archive-row"' + actionAttrs('setCalendarMonth', [ak]) + '><b>' +
      ap[0] + ' 年 ' + parseInt(ap[1], 10) + ' 月</b>' +
      '<span>训练 ' + (item.trainings || 0) + ' 次 · 放纵餐 ' + (item.cheats || 0) + ' 顿</span></div>';
  }).join('') : '<div class="fit-empty" style="padding:7px 0">还没有更早的归档月份</div>';
}

function renderRecentWorkouts(){
  if (!fit) return;
  var sessions = fit.sessions.slice().sort(function(a, b){ return b.startAt - a.startAt; }).slice(0, 4);
  var box = byId('fit-recent');
  if (!sessions.length) {
    box.innerHTML = '<div class="fit-empty">还没有训练记录<br>开始第一次训练后会出现在这里</div>';
    return;
  }
  box.innerHTML = sessions.map(function(s){
    var total = workoutPlanTotals(s.plan);
    var date = new Date(s.startAt);
    var state = s.endAt ? (completedTasks(s) + '/' + total.tasks + ' 项') : '进行中';
    return '<div class="fit-session" data-session="' + escHtml(s.id) + '">' +
      '<span class="fit-session-date">' + pad2(date.getMonth() + 1) + '/' + pad2(date.getDate()) + '</span>' +
      '<span class="fit-session-main"><b>' + workoutPlanSummary(s.plan) + '</b>' +
      '<span>' + (s.backfilled ? '补记记录' : pad2(date.getHours()) + ':' + pad2(date.getMinutes()) + ' 开始') + '</span></span>' +
      '<span class="fit-session-state ' + (s.endAt ? '' : 'open') + '">' + state + '</span></div>';
  }).join('');
}

function findWorkoutPlan(id){
  for (var i = 0; i < fit.plans.length; i++) if (fit.plans[i].id === id) return fit.plans[i];
  return null;
}

function openWorkoutPlan(planId){
  if (activeWorkout()) { toast('当前训练还没结束'); return; }
  editingPlanId = planId || null;
  var existing = editingPlanId ? findWorkoutPlan(editingPlanId) : null;
  planDraft = existing ? normalizedPlanItems(existing.items) :
    normalizedPlanItems(DEFAULT_EXERCISES.map(function(e){
      return { exerciseId: e.id, type: e.type, sets: e.type === 'sets' ? 4 : 0, minutes: e.type === 'duration' ? 20 : 0 };
    }));
  openSheet(
    '<h3>' + (existing ? '编辑训练计划' : '新建训练计划') + '</h3>' +
    '<p>保存后，在首页点计划旁的“开始”即可直接训练。</p>' +
    '<input class="plan-name-input" id="plan-name" maxlength="16" placeholder="计划名称" value="' +
    escHtml(existing ? existing.name : '训练计划 ' + (fit.plans.length + 1)) + '">' +
    '<div class="plan-summary"><span id="plan-actions">0 个动作</span><b id="plan-sets">0 组</b></div>' +
    '<div class="plan-list" id="plan-list"></div>' +
    '<div class="plan-picker" id="plan-picker"></div>' +
    '<div class="new-exercise"><input id="plan-new-name" maxlength="12" placeholder="新动作名称">' +
    '<select id="plan-new-type"><option value="sets">按组</option><option value="duration">按时长</option></select>' +
    '<button' + actionAttrs('addExerciseFromPlan') + '>添加</button></div>' +
    (existing && fit.plans.length > 1 ? '<button class="danger" style="width:100%;margin-bottom:8px"' + actionAttrs('deleteWorkoutPlan') + '>删除这个计划</button>' : '') +
    '<div class="row"><button class="ghost"' + actionAttrs('closeSheet') + '>取消</button>' +
    '<button class="primary"' + actionAttrs('saveWorkoutPlan') + '>保存计划</button></div>'
  );
  renderPlanRows();
  byId('plan-new-name').addEventListener('keydown', function(e){
    if (e.key === 'Enter') { e.preventDefault(); addExerciseFromPlan(); }
  });
}

function renderPlanRows(){
  var list = byId('plan-list');
  if (!list) return;
  list.innerHTML = planDraft.length ? planDraft.map(function(p, index){
    var ex = exerciseById(p.exerciseId) || { name: p.name || p.exerciseId, type: p.type };
    var type = planItemType(p);
    var target = type === 'duration' ? p.minutes : p.sets;
    var unit = type === 'duration' ? '分钟' : '组';
    return '<div class="plan-row active" data-item-id="' + escHtml(p.itemId) + '">' +
      '<span class="plan-order-index">' + (index + 1) + '</span>' +
      '<span class="plan-name">' + escHtml(ex.name) +
      '<small style="color:#9aa9a7;margin-left:5px">' + (type === 'duration' ? '时长' : '按组') + '</small></span>' +
      '<span class="plan-row-controls"><span class="plan-stepper">' +
      '<button type="button"' + actionAttrs('adjustPlanSets', [p.itemId, -1]) + '>−</button>' +
      '<b>' + target + '</b><small>' + unit + '</small>' +
      '<button type="button"' + actionAttrs('adjustPlanSets', [p.itemId, 1]) + '>＋</button></span>' +
      '<span class="plan-row-actions">' +
      '<button type="button" data-action="movePlanItem" data-args="[&quot;' + escHtml(p.itemId) + '&quot;,-1]"' + (index === 0 ? ' disabled' : '') + ' aria-label="上移">↑</button>' +
      '<button type="button" data-action="movePlanItem" data-args="[&quot;' + escHtml(p.itemId) + '&quot;,1]"' + (index === planDraft.length - 1 ? ' disabled' : '') + ' aria-label="下移">↓</button>' +
      '<button type="button" data-action="duplicatePlanItem" data-args="[&quot;' + escHtml(p.itemId) + '&quot;]" aria-label="复制动作">复制</button>' +
      '<button class="plan-row-remove" type="button" data-action="removePlanItem" data-args="[&quot;' + escHtml(p.itemId) + '&quot;]" aria-label="移除动作">×</button>' +
      '</span></span></div>';
  }).join('') : '<div class="plan-empty">还没有动作，从下面添加。</div>';
  var picker = byId('plan-picker');
  if (picker) {
    picker.innerHTML = '<div class="plan-picker-title">添加动作</div><div class="plan-picker-grid">' +
      fit.exercises.map(function(ex){
        return '<button type="button"' + actionAttrs('addExerciseToPlan', [ex.id]) + '>' +
          '<b>' + escHtml(ex.name) + '</b><small>' + (ex.type === 'duration' ? '按时长' : '按组') + '</small><em>＋</em></button>';
      }).join('') + '</div>';
  }
  var totals = workoutPlanTotals(planDraft);
  setTxt('plan-actions', totals.exercises + ' 个动作');
  var bits = [];
  if (totals.sets) bits.push(totals.sets + ' 组');
  if (totals.minutes) bits.push(totals.minutes + ' 分钟');
  setTxt('plan-sets', bits.join(' · ') || '未设置');
}

function planDraftIndex(identifier){
  var index = -1;
  for (var i = 0; i < planDraft.length; i++) {
    if (planDraft[i].itemId === identifier) return i;
  }
  for (var j = 0; j < planDraft.length; j++) {
    if (planDraft[j].exerciseId === identifier) { index = j; break; }
  }
  return index;
}

function newPlanDraftItem(ex){
  return ex.type === 'duration' ?
    { itemId: newWorkoutItemId(), exerciseId: ex.id, name: ex.name, type: 'duration', sets: 0, minutes: 20 } :
    { itemId: newWorkoutItemId(), exerciseId: ex.id, name: ex.name, type: 'sets', sets: 4, minutes: 0 };
}

function addExerciseToPlan(exerciseId){
  var ex = exerciseById(exerciseId);
  if (!ex) return;
  planDraft.push(newPlanDraftItem(ex));
  renderPlanRows();
}

function togglePlanExercise(id, selected){
  var ex = exerciseById(id);
  if (!ex) return;
  if (selected) addExerciseToPlan(id);
  else {
    planDraft = planDraft.filter(function(item){ return item.exerciseId !== id; });
    renderPlanRows();
  }
}

function adjustPlanSets(identifier, delta){
  var index = planDraftIndex(identifier);
  if (index < 0) return;
  var item = planDraft[index];
  if (planItemType(item) === 'duration') item.minutes = Math.min(180, Math.max(5, (parseInt(item.minutes, 10) || 20) + delta * 5));
  else item.sets = Math.min(20, Math.max(1, (parseInt(item.sets, 10) || 1) + delta));
  renderPlanRows();
}

function movePlanItem(identifier, delta){
  var index = planDraftIndex(identifier);
  var next = index + (Number(delta) || 0);
  if (index < 0 || next < 0 || next >= planDraft.length) return;
  var item = planDraft[index];
  planDraft[index] = planDraft[next];
  planDraft[next] = item;
  renderPlanRows();
}

function duplicatePlanItem(identifier){
  var index = planDraftIndex(identifier);
  if (index < 0) return;
  var copy = JSON.parse(JSON.stringify(planDraft[index]));
  copy.itemId = newWorkoutItemId();
  planDraft.splice(index + 1, 0, copy);
  renderPlanRows();
}

function removePlanItem(identifier){
  var index = planDraftIndex(identifier);
  if (index < 0) return;
  planDraft.splice(index, 1);
  renderPlanRows();
}

function addWorkoutExercise(name, type){
  name = String(name || '').trim();
  if (!name) { toast('请输入动作名称'); return null; }
  if (name.length > 12) { toast('动作名称最多 12 个字'); return null; }
  for (var i = 0; i < fit.exercises.length; i++) {
    if (fit.exercises[i].name.toLocaleLowerCase() === name.toLocaleLowerCase()) {
      toast('这个动作已经有了'); return null;
    }
  }
  var ex = { id: 'custom_' + Date.now().toString(36), name: name, type: type === 'duration' ? 'duration' : 'sets' };
  fit.exercises.push(ex);
  saveWorkout();
  return ex;
}

function addExerciseFromPlan(){
  var input = byId('plan-new-name');
  var type = byId('plan-new-type') ? byId('plan-new-type').value : 'sets';
  var ex = addWorkoutExercise(input.value, type);
  if (!ex) return;
  planDraft.push(newPlanDraftItem(ex));
  input.value = '';
  renderPlanRows();
  input.focus();
  toast('已添加 ' + ex.name);
}

function saveWorkoutPlan(){
  var nameInput = byId('plan-name');
  var name = nameInput ? nameInput.value.trim() : '';
  if (!name) { toast('请填写计划名称'); return; }
  if (!planDraft.length) { toast('至少选择一个动作'); return; }
  var items = normalizedPlanItems(planDraft);
  if (editingPlanId) {
    var plan = findWorkoutPlan(editingPlanId);
    if (plan) { plan.name = name; plan.items = items; }
  } else {
    fit.plans.push({ id: 'plan_' + Date.now().toString(36), name: name, items: items });
  }
  saveWorkout();
  closeSheet();
  renderWorkoutHome();
  toast('训练计划已保存');
}

function deleteWorkoutPlan(){
  if (!editingPlanId || fit.plans.length <= 1) return;
  var planId = editingPlanId;
  appConfirm('删除这个训练计划？历史训练记录不会受影响。', function(){
    fit.plans = fit.plans.filter(function(p){ return p.id !== planId; });
    saveWorkout();
    renderWorkoutHome();
    toast('计划已删除');
  });
}

function startWorkoutFromPlan(planId){
  if (activeWorkout()) { toast('当前训练还没结束'); return; }
  var source = findWorkoutPlan(planId);
  if (!source || !source.items.length) { toast('训练计划为空'); return; }
  var plan = [];
  each(source.items, function(p){
    var ex = exerciseById(p.exerciseId);
    if (ex) {
      plan.push({
        itemId: p.itemId || newWorkoutItemId(),
        exerciseId: p.exerciseId, name: ex.name,
        type: ex.type, sets: ex.type === 'sets' ? p.sets : 0,
        minutes: ex.type === 'duration' ? p.minutes : 0
      });
    }
  });
  if (!plan.length) { toast('至少选择一个动作'); return; }
  var now = Date.now();
  var session = {
    id: 'workout_' + now.toString(36),
    date: wTodayStr(),
    startAt: now,
    endAt: null,
    plan: plan,
    sets: [],
    timedStarts: {}
  };
  fit.sessions.push(session);
  fit.activeSessionId = session.id;
  saveWorkout();
  closeSheet();
  renderWorkoutHome();
  byId('p-fitness').scrollTop = 0;
  toast('训练开始');
}

function openBackfillSheet(){
  if (activeWorkout()) { toast('当前训练还没结束'); return; }
  if (!fit.plans.length) { toast('请先创建训练计划'); return; }
  var now = new Date();
  var time = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
  openSheet(
    '<h3>补记训练</h3>' +
    '<p>选择日期和训练计划，再调整实际完成的组数或时长。</p>' +
    '<label class="todo-form-label">训练日期</label><input class="todo-form-input" type="date" id="backfill-date" max="' + wTodayStr() + '" value="' + wTodayStr() + '">' +
    '<label class="todo-form-label">开始时间</label><input class="todo-form-input" type="time" id="backfill-time" value="' + time + '">' +
    '<label class="todo-form-label">训练计划</label>' +
    '<select class="todo-form-input" id="backfill-plan">' + fit.plans.map(function(plan){
      return '<option value="' + escHtml(plan.id) + '">' + escHtml(plan.name) + '</option>';
    }).join('') + '</select>' +
    '<div class="plan-summary"><span>实际完成</span><b id="backfill-summary">0 组</b></div>' +
    '<div class="plan-list" id="backfill-list"></div>' +
    '<div class="row"><button class="ghost"' + actionAttrs('closeSheet') + '>取消</button>' +
    '<button class="primary"' + actionAttrs('saveBackfillWorkout') + '>保存补记</button></div>'
  );
  byId('backfill-plan').addEventListener('change', loadBackfillDraft);
  loadBackfillDraft();
}

function loadBackfillDraft(){
  var plan = findWorkoutPlan(byId('backfill-plan').value);
  backfillDraft = [];
  if (plan) {
    each(plan.items, function(item){
      var type = planItemType(item);
      backfillDraft.push({
        itemId: item.itemId,
        exerciseId: item.exerciseId,
        name: item.name || workoutExerciseName(item.exerciseId),
        type: type,
        targetSets: item.sets || 0,
        targetMinutes: item.minutes || 0,
        actualSets: type === 'sets' ? item.sets : 0,
        actualMinutes: type === 'duration' ? item.minutes : 0
      });
    });
  }
  renderBackfillDraft();
}

function renderBackfillDraft(){
  var list = byId('backfill-list');
  if (!list) return;
  list.innerHTML = backfillDraft.map(function(item){
    var actual = item.type === 'duration' ? item.actualMinutes : item.actualSets;
    var unit = item.type === 'duration' ? '分钟' : '组';
    var target = item.type === 'duration' ? item.targetMinutes + ' 分钟' : item.targetSets + ' 组';
    return '<div class="plan-row active"><span></span><span class="plan-name">' + escHtml(item.name) +
      '<span class="active-edit-note">计划 ' + target + '</span></span>' +
      '<span class="plan-stepper"><button type="button"' + actionAttrs('adjustBackfill', [item.itemId, -1]) + '>−</button>' +
      '<b>' + actual + '</b><small>' + unit + '</small>' +
      '<button type="button"' + actionAttrs('adjustBackfill', [item.itemId, 1]) + '>＋</button></span></div>';
  }).join('');
  var sets = 0, minutes = 0;
  each(backfillDraft, function(item){
    if (item.type === 'duration') minutes += item.actualMinutes;
    else sets += item.actualSets;
  });
  setTxt('backfill-summary', (sets ? sets + ' 组' : '') + (sets && minutes ? ' · ' : '') + (minutes ? minutes + ' 分钟' : '') || '0');
}

function adjustBackfill(itemId, delta){
  each(backfillDraft, function(item){
    if (item.itemId !== itemId) return;
    if (item.type === 'duration') item.actualMinutes = Math.min(180, Math.max(0, item.actualMinutes + delta * 5));
    else item.actualSets = Math.min(20, Math.max(0, item.actualSets + delta));
  });
  renderBackfillDraft();
}

function saveBackfillWorkout(){
  var date = byId('backfill-date').value;
  var time = byId('backfill-time').value || '19:00';
  var plan = findWorkoutPlan(byId('backfill-plan').value);
  if (!plan) { toast('请选择训练计划'); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('请选择训练日期'); return; }
  var dt = new Date(date + 'T' + time + ':00');
  if (isNaN(dt.getTime())) { toast('请选择开始时间'); return; }
  if (dt.getTime() > Date.now()) { toast('补记时间不能晚于现在'); return; }
  var records = [];
  var snapshot = [];
  each(backfillDraft, function(item){
    var planItem = normalizedPlanItem({
      itemId: item.itemId, exerciseId: item.exerciseId, name: item.name, type: item.type,
      sets: item.targetSets, minutes: item.targetMinutes
    });
    snapshot.push(planItem);
    if (item.type === 'duration' && item.actualMinutes > 0) {
      records.push({
        itemId: item.itemId, exerciseId: item.exerciseId, kind: 'duration', manual: true,
        startedElapsed: 0, durationMs: item.actualMinutes * 60000, elapsed: 0
      });
    } else if (item.type === 'sets') {
      for (var i = 0; i < item.actualSets; i++) {
        records.push({
          itemId: item.itemId, exerciseId: item.exerciseId, kind: 'set', setNo: i + 1,
          elapsed: 0, manual: true
        });
      }
    }
  });
  if (!records.length) { toast('请至少记录一组或一个时长'); return; }
  var now = Date.now();
  var session = {
    id: 'workout_' + now.toString(36),
    date: date,
    startAt: dt.getTime(),
    endAt: dt.getTime(),
    plan: snapshot,
    sets: records,
    timedStarts: {},
    backfilled: true
  };
  fit.sessions.push(session);
  archiveOldWorkouts();
  saveWorkout();
  closeSheet();
  var monthList = availableWorkoutMonths();
  calMonthIndex = Math.max(0, monthList.indexOf(date.slice(0, 7)));
  renderWorkoutHome();
  toast('训练已补记');
}

function activePlanItem(active, identifier){
  if (!active) return null;
  for (var i = 0; i < active.plan.length; i++) {
    if (active.plan[i].itemId === identifier) return active.plan[i];
  }
  for (var j = 0; j < active.plan.length; j++) {
    if (active.plan[j].exerciseId === identifier) return active.plan[j];
  }
  return null;
}

function completeWorkoutSet(identifier){
  var active = activeWorkout();
  if (!active) { toast('没有进行中的训练'); return; }
  var planItem = activePlanItem(active, identifier);
  if (!planItem) return;
  if (planItemType(planItem) !== 'sets') { toast('这个动作按时长记录'); return; }
  var done = recordsForPlanItem(active, planItem).filter(function(s){ return s.kind !== 'duration'; }).length;
  if (done >= planItem.sets) { toast('这个动作已经完成'); return; }
  var now = Date.now();
  active.sets.push({
    itemId: planItem.itemId,
    exerciseId: planItem.exerciseId,
    kind: 'set',
    setNo: done + 1,
    elapsed: now - active.startAt
  });
  saveWorkout();
  if (workoutIsComplete(active)) { finishWorkout('auto'); return; }
  renderWorkoutHome();
  toast('第 ' + (done + 1) + ' 组完成');
}

function startTimedExercise(identifier){
  var active = activeWorkout();
  if (!active) return;
  var planItem = activePlanItem(active, identifier);
  if (!planItem) return;
  if (!active.timedStarts) active.timedStarts = {};
  if (active.timedStarts[planItem.itemId]) return;
  active.timedStarts[planItem.itemId] = Math.max(0, Date.now() - active.startAt);
  saveWorkout();
  renderActiveWorkout();
}

function completeTimedExercise(identifier){
  var active = activeWorkout();
  var planItem = activePlanItem(active, identifier);
  if (!active || !planItem || !active.timedStarts || !Object.prototype.hasOwnProperty.call(active.timedStarts, planItem.itemId)) return;
  var now = Date.now();
  var startedElapsed = timedStartElapsed(active, planItem.itemId);
  var currentElapsed = now - active.startAt;
  active.sets.push({
    itemId: planItem.itemId,
    exerciseId: planItem.exerciseId,
    kind: 'duration',
    startedElapsed: startedElapsed,
    durationMs: Math.max(0, currentElapsed - startedElapsed),
    elapsed: currentElapsed
  });
  delete active.timedStarts[planItem.itemId];
  saveWorkout();
  if (workoutIsComplete(active)) { finishWorkout('auto'); return; }
  renderWorkoutHome();
  toast('时长已记录');
}

function requestFinishWorkout(){
  var active = activeWorkout();
  if (!active) return;
  if (workoutIsComplete(active)) { finishWorkout('manual'); return; }
  var total = workoutPlanTotals(active.plan);
  var left = Math.max(0, total.tasks - completedTasks(active));
  openSheet(
    '<h3>训练还没完成</h3>' +
    '<p>还有 ' + left + ' 项没有完成。要把现在已经记录的组数和时长保存下来吗？</p>' +
    '<button class="danger" style="width:100%;margin-bottom:8px"' + actionAttrs('discardWorkout') + '>不保存并结束</button>' +
    '<div class="row"><button class="ghost"' + actionAttrs('closeSheet') + '>继续训练</button>' +
    '<button class="primary"' + actionAttrs('finishWorkout', ['manual']) + '>保存并结束</button></div>'
  );
}

function discardWorkout(){
  var active = activeWorkout();
  if (!active) return;
  fit.sessions = fit.sessions.filter(function(s){ return s.id !== active.id; });
  fit.activeSessionId = null;
  saveWorkout();
  closeSheet();
  renderWorkoutHome();
  toast('本次训练未保存');
}

function finishWorkout(mode){
  var active = activeWorkout();
  if (!active) return;
  active.endAt = Date.now();
  fit.activeSessionId = null;
  archiveOldWorkouts();
  saveWorkout();
  closeSheet();
  renderWorkoutHome();
  toast(mode === 'auto' ? '训练完成，已自动结束' : '训练已保存并结束');
}

function deleteWorkoutSession(id){
  var session = null;
  each(fit.sessions, function(s){ if (s.id === id) session = s; });
  if (!session) return;
  var date = session.date;
  appConfirm('删除这次训练记录？删除后不能恢复。', function(){
    fit.sessions = fit.sessions.filter(function(s){ return s.id !== id; });
    if (fit.activeSessionId === id) fit.activeSessionId = null;
    saveWorkout();
    renderWorkoutHome();
    var stillHas = fit.sessions.some(function(s){ return s.date === date; }) ||
      (fit.cheatMeals || []).some(function(m){ return m.date === date; });
    if (stillHas) openDaySessions(date);
    toast('训练记录已删除');
  });
}

function activeItemDoneCount(active, item){
  var records = recordsForPlanItem(active, item);
  if (planItemType(item) === 'duration') {
    return records.some(function(r){ return r.kind === 'duration' || r.durationMs > 0; }) ? 1 : 0;
  }
  return records.filter(function(r){ return r.kind !== 'duration'; }).length;
}

function openActiveWorkoutEditor(){
  var active = activeWorkout();
  if (!active) return;
  var available = fit.exercises;
  var html = '<h3>调整本次训练</h3><p>可以临时增加或删除动作，也可以增减组数和目标时长。</p><div class="plan-list">';
  each(active.plan, function(item){
    var type = planItemType(item);
    var done = activeItemDoneCount(active, item);
    var records = recordsForPlanItem(active, item);
    var target = type === 'duration' ? item.minutes : item.sets;
    var unit = type === 'duration' ? '分钟' : '组';
    html += '<div class="plan-row active">' +
      '<span></span><span class="plan-name">' + escHtml(item.name) +
      '<span class="active-edit-note">' + (type === 'duration' ? (done ? '已完成时长' : '尚未记录') : ('已完成 ' + done + ' 组')) + '</span></span>' +
      '<span class="plan-stepper"><button type="button"' + actionAttrs('adjustActiveTarget', [item.itemId, -1]) + '>−</button>' +
      '<b>' + target + '</b><small>' + unit + '</small>' +
      '<button type="button"' + actionAttrs('adjustActiveTarget', [item.itemId, 1]) + '>＋</button>' +
      (records.length ? '<button type="button"' + actionAttrs('undoActiveRecord', [item.itemId]) + ' title="撤销最近记录">↶</button>' : '') +
      '<button class="plan-row-remove" type="button"' + actionAttrs('removeActiveExercise', [item.itemId]) + '>×</button></span></div>';
  });
  html += '</div>';
  if (available.length) {
    html += '<div class="active-add"><select id="active-add-ex">' + available.map(function(e){
      return '<option value="' + escHtml(e.id) + '">' + escHtml(e.name) + ' · ' + (e.type === 'duration' ? '时长' : '按组') + '</option>';
    }).join('') + '</select><button' + actionAttrs('addActiveExercise') + '>添加到本次</button></div>';
  }
  html += '<div class="row"><button class="ghost" style="flex:1"' + actionAttrs('closeSheet') + '>完成调整</button></div>';
  openSheet(html);
}

function adjustActiveTarget(identifier, delta){
  var active = activeWorkout();
  if (!active) return;
  var item = activePlanItem(active, identifier);
  if (!item) return;
  if (planItemType(item) === 'duration') {
    item.minutes = Math.min(180, Math.max(5, (parseInt(item.minutes, 10) || 20) + delta * 5));
  } else {
    var done = activeItemDoneCount(active, item);
    item.sets = Math.min(20, Math.max(Math.max(1, done), (parseInt(item.sets, 10) || 1) + delta));
  }
  saveWorkout();
  renderWorkoutHome();
  if (workoutIsComplete(active)) finishWorkout('auto');
  else openActiveWorkoutEditor();
}

function undoActiveRecord(identifier){
  var active = activeWorkout();
  if (!active) return;
  var item = activePlanItem(active, identifier);
  if (!item) return;
  var last = -1;
  for (var i = 0; i < active.sets.length; i++) {
    if (active.sets[i].itemId === item.itemId) last = i;
  }
  if (last < 0) return;
  active.sets.splice(last, 1);
  saveWorkout();
  renderWorkoutHome();
  openActiveWorkoutEditor();
}

function removeActiveExercise(identifier){
  var active = activeWorkout();
  if (!active || active.plan.length <= 1) { toast('至少保留一个动作'); return; }
  var item = activePlanItem(active, identifier);
  if (!item) return;
  var hasRecords = recordsForPlanItem(active, item).length ||
    (active.timedStarts && active.timedStarts[item.itemId]);
  if (hasRecords) {
    appConfirm('删除这个动作？它在本次训练中已有记录，也会一起移除。', function(){
      active.plan = active.plan.filter(function(p){ return p.itemId !== item.itemId; });
      active.sets = active.sets.filter(function(r){ return r.itemId !== item.itemId; });
      if (active.timedStarts) delete active.timedStarts[item.itemId];
      saveWorkout();
      renderWorkoutHome();
      if (workoutIsComplete(active)) finishWorkout('auto');
      else openActiveWorkoutEditor();
    }, { title: '删除动作', onCancel: openActiveWorkoutEditor });
    return;
  }
  active.plan = active.plan.filter(function(p){ return p.itemId !== item.itemId; });
  active.sets = active.sets.filter(function(r){ return r.itemId !== item.itemId; });
  if (active.timedStarts) delete active.timedStarts[item.itemId];
  saveWorkout();
  renderWorkoutHome();
  if (workoutIsComplete(active)) finishWorkout('auto');
  else openActiveWorkoutEditor();
}

function addActiveExercise(){
  var active = activeWorkout();
  var select = byId('active-add-ex');
  if (!active || !select || !select.value) return;
  var ex = exerciseById(select.value);
  if (!ex) return;
  var item = newPlanDraftItem(ex);
  active.plan.push(item);
  saveWorkout();
  renderWorkoutHome();
  openActiveWorkoutEditor();
}

function openExerciseManager(){
  openSheet(
    '<h3>训练动作</h3>' +
    '<p>动作可以按组记录，也可以按时长记录。默认动作固定保留。</p>' +
    '<div class="manage-list" id="manage-list"></div>' +
    '<div class="new-exercise"><input id="manage-new-name" maxlength="12" placeholder="例如：肩、核心、跳绳">' +
    '<select id="manage-new-type"><option value="sets">按组</option><option value="duration">按时长</option></select>' +
    '<button' + actionAttrs('addExerciseFromManager') + '>添加</button></div>' +
    '<div class="row"><button class="ghost" style="flex:1"' + actionAttrs('closeSheet') + '>关闭</button></div>'
  );
  renderExerciseManager();
  byId('manage-new-name').addEventListener('keydown', function(e){
    if (e.key === 'Enter') { e.preventDefault(); addExerciseFromManager(); }
  });
}

function renderExerciseManager(){
  var box = byId('manage-list');
  if (!box) return;
  box.innerHTML = fit.exercises.map(function(e){
    var fixed = DEFAULT_EXERCISES.some(function(b){ return b.id === e.id; });
    return '<span class="manage-item">' + escHtml(e.name) +
      '<small>' + (fixed ? '默认 · ' : '') + (e.type === 'duration' ? '时长' : '按组') + '</small>' +
      (fixed ? '' : '<button' + actionAttrs('removeWorkoutExercise', [e.id]) + ' aria-label="删除">×</button>') +
      '</span>';
  }).join('');
}

function addExerciseFromManager(){
  var input = byId('manage-new-name');
  var type = byId('manage-new-type') ? byId('manage-new-type').value : 'sets';
  var ex = addWorkoutExercise(input.value, type);
  if (!ex) return;
  input.value = '';
  renderExerciseManager();
  renderWorkoutHome();
  toast('已添加 ' + ex.name);
}

function removeWorkoutExercise(id){
  if (DEFAULT_EXERCISES.some(function(b){ return b.id === id; })) return;
  if (activeWorkout() && activeWorkout().plan.some(function(p){ return p.exerciseId === id; })) {
    toast('请先在“调整本次”中移除这个动作'); return;
  }
  fit.exercises = fit.exercises.filter(function(e){ return e.id !== id; });
  each(fit.plans, function(plan){
    plan.items = plan.items.filter(function(p){ return p.exerciseId !== id; });
  });
  fit.plans = fit.plans.filter(function(plan){ return plan.items.length; });
  if (!fit.plans.length) fit.plans = workoutDefaultState().plans;
  planDraft = planDraft.filter(function(p){ return p.exerciseId !== id; });
  saveWorkout();
  renderExerciseManager();
  renderWorkoutHome();
  toast('动作已删除');
}

function openCheatMealSheet(date){
  var selected = date || wTodayStr();
  openSheet(
    '<h3>记录放纵餐</h3>' +
    '<p>记录在这一天的日历里。同一天仍然可以正常记录训练。</p>' +
    '<label class="fld">日期<input type="date" id="cheat-date" max="' + wTodayStr() + '" value="' + selected + '"></label>' +
    '<div class="row"><button class="ghost"' + actionAttrs('closeSheet') + '>取消</button>' +
    '<button class="primary"' + actionAttrs('addCheatMeal') + '>记录一顿</button></div>'
  );
}

function addCheatMeal(){
  var input = byId('cheat-date');
  var date = input ? input.value : wTodayStr();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('请选择日期'); return; }
  if (date > wTodayStr()) { toast('日期不能晚于今天'); return; }
  var now = Date.now();
  fit.cheatMeals.push({
    id: 'meal_' + now.toString(36),
    date: date,
    at: now
  });
  archiveOldWorkouts();
  saveWorkout();
  var monthKey = date.slice(0, 7);
  var monthList = availableWorkoutMonths();
  calMonthIndex = Math.max(0, monthList.indexOf(monthKey));
  closeSheet();
  renderWorkoutHome();
  toast('放纵餐已记录');
}

function removeCheatMeal(id){
  var date = '';
  each(fit.cheatMeals, function(m){ if (m.id === id) date = m.date; });
  appConfirm('删除这条放纵餐记录？', function(){
    fit.cheatMeals = fit.cheatMeals.filter(function(m){ return m.id !== id; });
    saveWorkout();
    renderWorkoutHome();
    if (date) openDaySessions(date);
    toast('记录已删除');
  }, { title: '删除放纵餐', onCancel: function(){ if (date) openDaySessions(date); } });
}

function openDaySessions(date){
  var sessions = fit.sessions.filter(function(s){ return s.date === date; });
  var meals = fit.cheatMeals.filter(function(m){ return m.date === date; });
  if (!sessions.length && !meals.length) return;
  var html = '<h3>' + workoutDateLabel(date) + '</h3><p>训练 ' + sessions.length + ' 次 · 放纵餐 ' + meals.length + ' 顿。</p>';
  each(sessions, function(s){
    var total = workoutPlanTotals(s.plan);
    html += '<div class="fit-session" style="margin-bottom:7px"' + actionAttrs('openSessionDetail', [s.id]) + '>' +
      '<span class="fit-session-date">' + (s.backfilled ? '补记' : workoutTimeText(s.startAt).slice(0, 5)) + '</span>' +
      '<span class="fit-session-main"><b>' + workoutPlanSummary(s.plan) + '</b>' +
      '<span>完成 ' + completedTasks(s) + ' / ' + total.tasks + ' 项</span></span><span class="fit-session-state">查看</span></div>';
  });
  each(meals, function(m){
    html += '<div class="ritem" style="margin-top:7px"><span class="rtime">' + workoutTimeText(m.at).slice(0, 5) +
      '</span><span class="ramt">放纵餐</span><button class="rdel"' +
      actionAttrs('removeCheatMeal', [m.id]) + '>×</button></div>';
  });
  html += '<button class="fit-cheat-add" style="margin-top:9px"' + actionAttrs('openCheatMealSheet', [date]) + '>＋ 给这一天记录放纵餐</button>';
  html += '<div class="row"><button class="ghost" style="flex:1"' + actionAttrs('closeSheet') + '>关闭</button></div>';
  openSheet(html);
}

function openSessionDetail(id){
  var session = null;
  each(fit.sessions, function(s){ if (s.id === id) session = s; });
  if (!session) return;
  var total = workoutPlanTotals(session.plan);
  var end = session.endAt || Date.now();
  var html = '<h3>' + workoutDateLabel(session.date) + ' 的训练</h3>' +
    '<div class="session-detail-meta"><span>' + workoutTimeText(session.startAt).slice(0, 5) + ' 开始</span>' +
    '<span>' + (session.backfilled ? '补记' : formatWorkoutDuration(end - session.startAt)) + '</span>' +
    '<span>' + completedTasks(session) + ' / ' + total.tasks + ' 项</span></div>';
  each(session.plan, function(item){
    var records = recordsForPlanItem(session, item);
    var type = planItemType(item);
    var done = type === 'duration' ?
      records.filter(function(r){ return r.kind === 'duration' || r.durationMs > 0; }).length :
      records.filter(function(r){ return r.kind !== 'duration'; }).length;
    var target = type === 'duration' ? item.minutes + ' 分钟' : item.sets + ' 组';
    html += '<div class="session-detail-ex"><div class="session-detail-head"><b>' + escHtml(item.name) + '</b>' +
      '<span>' + done + ' / ' + target + '</span></div>';
    if (records.length) {
      html += '<div class="session-detail-times">' + records.map(function(r){
        return '<span>' + (r.kind === 'duration' || r.durationMs > 0 ?
          '实际 ' + formatWorkoutDuration(r.durationMs || 0) + ' · 本次 ' + formatWorkoutDuration(r.elapsed || 0) :
          (r.manual ? '补记' : '本次 ' + formatWorkoutDuration(r.elapsed || 0))) + '</span>';
      }).join('') + '</div>';
    }
    html += '</div>';
  });
  html += '<button class="danger" style="width:100%;margin-top:12px"' +
    actionAttrs('deleteWorkoutSession', [session.id]) + '>删除这次训练</button>';
  html += '<div class="row"><button class="ghost" style="flex:1"' + actionAttrs('closeSheet') + '>关闭</button></div>';
  openSheet(html);
}

function initFitness(){
  loadWorkoutState();
  byId('btn-workout-start').addEventListener('click', function(){ openWorkoutPlan(); });
  byId('btn-workout-backfill').addEventListener('click', openBackfillSheet);
  byId('btn-fit-manage').addEventListener('click', openExerciseManager);
  byId('btn-workout-adjust').addEventListener('click', openActiveWorkoutEditor);
  byId('btn-workout-end').addEventListener('click', requestFinishWorkout);
  byId('cal-prev').addEventListener('click', function(){
    var months = availableWorkoutMonths();
    if (calMonthIndex < months.length - 1) { calMonthIndex++; renderWorkoutCalendar(); }
  });
  byId('cal-next').addEventListener('click', function(){
    if (calMonthIndex > 0) { calMonthIndex--; renderWorkoutCalendar(); }
  });
  byId('btn-cheat-add').addEventListener('click', function(){ openCheatMealSheet(); });
  byId('active-ex-list').addEventListener('click', function(e){
    var btn = e.target.closest('.fit-setbtn');
    if (!btn) return;
    if (btn.hasAttribute('data-ex')) completeWorkoutSet(btn.getAttribute('data-ex'));
    else if (btn.hasAttribute('data-time-start')) startTimedExercise(btn.getAttribute('data-time-start'));
    else if (btn.hasAttribute('data-time-finish')) completeTimedExercise(btn.getAttribute('data-time-finish'));
  });
  byId('cal-grid').addEventListener('click', function(e){
    var day = e.target.closest('.fit-day[data-date]');
    if (day) openDaySessions(day.getAttribute('data-date'));
  });
  byId('fit-recent').addEventListener('click', function(e){
    var row = e.target.closest('[data-session]');
    if (row) openSessionDetail(row.getAttribute('data-session'));
  });
  renderWorkoutHome();
}
