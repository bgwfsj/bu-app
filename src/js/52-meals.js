/* ============================================================
   5.2 三餐
   ============================================================ */
var MEAL_TYPES = [
  { id: 'breakfast', name: '早餐', short: '早', primary: true, idealStart: 390, idealEnd: 540, idealLabel: '06:30–09:00' },
  { id: 'lunch', name: '午餐', short: '午', primary: true, idealStart: 690, idealEnd: 780, idealLabel: '11:30–13:00' },
  { id: 'tea', name: '下午茶', short: '茶', primary: false },
  { id: 'dinner', name: '晚餐', short: '晚', primary: true, idealStart: 1050, idealEnd: 1170, idealLabel: '17:30–19:30' },
  { id: 'late', name: '夜宵', short: '夜', primary: false }
];

var MEAL_SLOTS = [
  { id: 'breakfast', name: '早餐', hour: 6, minute: 30 },
  { id: 'lunch', name: '午餐', hour: 11, minute: 30 },
  { id: 'dinner', name: '晚餐', hour: 17, minute: 30 }
];

var MEAL_TIPS = {
  breakfast: [
    '早餐同时安排主食和蛋白质，通常比只吃甜食更耐饿。',
    '刚起床先喝几口水，再慢慢吃早餐，不必急着把胃填满。',
    '早餐加一份水果或蔬菜，会比只有精细主食更有层次。',
    '如果早上胃口小，可以少量吃一点，中午再认真补上。'
  ],
  lunch: [
    '吃饭可以先吃几口蔬菜，再吃蛋白质和主食，更容易放慢速度。',
    '午餐不用追求完全清淡，关键是别在一顿饭里装得太满。',
    '细嚼慢咽会给饱腹感一点时间，也能让吃完后的状态更舒服。',
    '午后容易困，午餐里搭配一些蛋白质和蔬菜通常更稳妥。'
  ],
  tea: [
    '下午茶更适合补充一小份，不必把它吃成第二顿午餐。',
    '水果、无糖酸奶或一小把坚果，通常比甜饮料更适合当下午的停顿。',
    '如果只是嘴巴馋，先喝几口水，等几分钟再决定要不要吃。',
    '下午加餐后，晚餐可以相应清淡一点，给一天留出平衡。'
  ],
  dinner: [
    '晚餐吃到七八分饱即可，不必把一天欠下的都留到晚上。',
    '晚上活动量通常更少，主食适量、蔬菜充足会更轻松。',
    '睡前大约三小时尽量不再大量进食，让身体有消化的时间。',
    '晚饭后慢慢走一会儿，比立刻躺下更舒服。'
  ],
  late: [
    '夜里如果确实饿，选择少量、清淡、容易消化的食物更合适。',
    '夜宵吃完不要马上躺下，给身体留一点消化的时间。',
    '有时渴也会被误认成饿，先喝几口水再判断要不要吃。',
    '偶尔一顿夜宵不用自责，第二天照常吃饭就能慢慢回到节奏。'
  ]
};

function mealDefaultState(){
  return { schemaVersion: 1, records: [] };
}

function mealTypeMeta(type){
  for (var i = 0; i < MEAL_TYPES.length; i++) {
    if (MEAL_TYPES[i].id === type) return MEAL_TYPES[i];
  }
  return MEAL_TYPES[0];
}

function mealTypeForDate(date){
  var minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes >= 300 && minutes < 630) return 'breakfast';
  if (minutes >= 630 && minutes < 870) return 'lunch';
  if (minutes >= 870 && minutes < 1050) return 'tea';
  if (minutes >= 1050 && minutes < 1260) return 'dinner';
  return 'late';
}

function mealDateKey(date){
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

function mealClock(date){
  return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
}

function mealRecordDate(record){
  var created = record && record.createdAt ? new Date(record.createdAt) : null;
  if (created && !isNaN(created.getTime())) return created;
  var parts = String(record && record.date || '').split('-');
  var clock = String(record && record.time || '').split(':');
  if (parts.length === 3) {
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]),
      Number(clock[0]) || 0, Number(clock[1]) || 0, 0);
  }
  return new Date();
}

function mealIsRegular(type, date){
  var meta = mealTypeMeta(type);
  if (!meta.primary) return false;
  var minutes = date.getHours() * 60 + date.getMinutes();
  return minutes >= meta.idealStart && minutes <= meta.idealEnd;
}

function mealDurationLabel(minutes){
  minutes = Math.max(0, Math.round(minutes));
  if (minutes < 60) return minutes + ' 分钟';
  var hours = Math.floor(minutes / 60);
  var rest = minutes % 60;
  return hours + ' 小时' + (rest ? ' ' + rest + ' 分钟' : '');
}

function mealGapMinutes(previous, current){
  if (!previous) return null;
  var before = mealRecordDate(previous);
  return Math.max(0, Math.round((current.getTime() - before.getTime()) / 60000));
}

function mealPreviousRecord(when, records){
  var result = null, resultTime = -Infinity;
  each(records || (mealData ? mealData.records : []), function(record){
    var at = mealRecordDate(record).getTime();
    if (at < when.getTime() && at > resultTime) {
      result = record;
      resultTime = at;
    }
  });
  return result;
}

function mealMomentReview(type, date, previous){
  var meta = mealTypeMeta(type);
  var regular = mealIsRegular(type, date);
  var gap = mealGapMinutes(previous, date);
  var detail = '';
  if (meta.primary) {
    detail = meta.name + '理想时间是 ' + meta.idealLabel + '，这次在 ' + mealClock(date) +
      (regular ? '，时间在范围内。' : '，不在理想时段。');
  } else if (type === 'tea') {
    detail = '这是一顿下午茶，不计入三顿正餐的规律统计。';
  } else {
    detail = '21:00 之后的记录归为夜宵，不计入三顿正餐的规律统计。';
  }
  if (gap == null) {
    detail += ' 目前还没有更早的用餐记录。';
  } else {
    var gapText = gap < 120 ? '间隔偏短，下一顿可以按饥饿感适量调整。' :
      gap > 330 ? '距上一顿有些久，慢一点吃，别一次吃得太急。' :
      '与上一顿的间隔比较从容。';
    detail += ' 距上一顿约 ' + mealDurationLabel(gap) + '，' + gapText;
  }
  var title;
  if (type === 'late') title = '夜宵时间';
  else if (type === 'tea') title = '下午加个餐';
  else if (regular && gap != null && gap < 120) title = '时间刚好，间隔略近';
  else if (regular) title = '吃得规律';
  else if (gap != null && gap > 330) title = '间隔有些长';
  else title = '这次不在理想时段';
  return { tone: regular ? 'good' : 'warn', title: title, detail: detail, regular: regular, gapMinutes: gap };
}

function mealTipFor(type, date){
  var tips = MEAL_TIPS[type] || MEAL_TIPS.late;
  var index = (date.getDate() + date.getHours() + date.getMinutes() + type.length) % tips.length;
  return tips[index];
}

function normalizeMealState(data){
  var parsed = [], seen = {};
  each(Array.isArray(data && data.records) ? data.records : [], function(record){
    if (!record || !record.type) return;
    var meta = mealTypeMeta(record.type);
    if (meta.id !== record.type) return;
    var when = mealRecordDate(record);
    if (isNaN(when.getTime())) return;
    var id = String(record.id || ('meal_' + when.getTime()));
    if (seen[id]) id += '_' + Math.random().toString(36).slice(2, 6);
    seen[id] = true;
    parsed.push({ id: id, type: record.type, when: when, backfill: !!record.backfill });
  });
  parsed.sort(function(a, b){ return a.when.getTime() - b.when.getTime(); });
  var out = mealDefaultState();
  each(parsed, function(item){
    var previous = out.records.length ? out.records[out.records.length - 1] : null;
    var review = mealMomentReview(item.type, item.when, previous);
    out.records.push({
      id: item.id,
      type: item.type,
      date: mealDateKey(item.when),
      time: mealClock(item.when),
      createdAt: item.when.toISOString(),
      regular: review.regular,
      gapMinutes: review.gapMinutes,
      reviewTitle: review.title,
      tip: mealTipFor(item.type, item.when),
      backfill: item.backfill
    });
  });
  return out;
}

function loadMealState(){
  mealData = normalizeMealState(storeGet(MKEY, null));
  saveMealState();
}

function saveMealState(){
  if (!mealData) mealData = mealDefaultState();
  mealData.schemaVersion = 1;
  mealData.records.sort(function(a, b){
    return String(a.createdAt).localeCompare(String(b.createdAt));
  });
  storeSet(MKEY, mealData);
}

function mealRecordsForDate(date){
  var key = mealDateKey(date);
  return (mealData ? mealData.records : []).filter(function(record){
    return record.date === key;
  });
}

function mealNextTargetAt(when, sourceRecords){
  when = when instanceof Date ? when : new Date(when || Date.now());
  var today = mealDateKey(when);
  var eaten = {};
  each(sourceRecords || (mealData ? mealData.records : []), function(record){
    if (record.date === today) eaten[record.type] = true;
  });
  for (var i = 0; i < MEAL_SLOTS.length; i++) {
    var slot = MEAL_SLOTS[i];
    var target = new Date(when.getFullYear(), when.getMonth(), when.getDate(), slot.hour, slot.minute, 0, 0);
    if (target.getTime() > when.getTime() && !eaten[slot.id]) {
      var meta = mealTypeMeta(slot.id);
      return {
        type: slot.id,
        name: slot.name,
        target: target,
        window: '理想 ' + meta.idealLabel,
        hint: slot.id === 'breakfast' ? '给一顿饭留出二十多分钟，也给自己留一点停顿。' :
          slot.id === 'lunch' ? '吃到七八分饱，下午会更从容一些。' :
          '晚餐清淡一点、少吃一点，夜里会更舒服。',
        tomorrow: false
      };
    }
  }
  var tomorrowTarget = new Date(when.getFullYear(), when.getMonth(), when.getDate() + 1, 6, 30, 0, 0);
  return {
    type: 'breakfast',
    name: '早餐',
    target: tomorrowTarget,
    window: '理想 06:30–09:00',
    hint: '今晚给身体留一点空腹的时间，明早再慢慢补回来。',
    tomorrow: true
  };
}

function mealCountdownText(ms){
  var total = Math.max(0, Math.ceil(ms / 1000));
  var hours = Math.floor(total / 3600);
  var minutes = Math.floor(total % 3600 / 60);
  var seconds = total % 60;
  return pad2(hours) + ':' + pad2(minutes) + ':' + pad2(seconds);
}

function paintMealCountdown(){
  if (!byId('meal-next-timer') || !mealData) return;
  var now = new Date();
  var current = mealTypeMeta(mealTypeForDate(now));
  var next = mealNextTargetAt(now);
  setTxt('meal-top-date', (now.getMonth() + 1) + '月' + now.getDate() + '日 · 周' + ['日', '一', '二', '三', '四', '五', '六'][now.getDay()]);
  setTxt('meal-record-hint', '现在 · 将记为' + current.name);
  setTxt('meal-next-name', next.name);
  setTxt('meal-next-timer', mealCountdownText(next.target.getTime() - now.getTime()));
  setTxt('meal-next-time', (next.tomorrow ? '明天 ' : '今天 ') + mealClock(next.target));
  setTxt('meal-next-window', next.window);
  setTxt('meal-next-hint', next.hint);
}

function mealEntryHtml(record){
  var meta = mealTypeMeta(record.type);
  return '<div class="meal-entry" data-type="' + meta.id + '">' +
    '<span class="meal-entry-time">' + escHtml(record.time) + '</span>' +
    '<span class="meal-entry-dot"></span>' +
    '<span class="meal-entry-main"><b>' + escHtml(meta.name) +
    (record.backfill ? '<i>补记</i>' : '') + '</b><small>' +
    escHtml(record.reviewTitle) + '</small></span>' +
    '<button type="button"' + actionAttrs('deleteMealRecord', [record.id]) + '>删除</button></div>';
}

function renderMealTypeStrip(){
  var box = byId('meal-type-strip');
  if (!box) return;
  var today = mealRecordsForDate(new Date());
  box.innerHTML = MEAL_TYPES.filter(function(type){ return type.primary; }).map(function(type){
    var rows = today.filter(function(record){ return record.type === type.id; });
    var regular = rows.some(function(record){ return record.regular; });
    return '<span class="meal-type-chip' + (rows.length ? ' has-record' : '') +
      (regular ? ' regular' : '') + '" data-type="' + type.id + '">' +
      '<b>' + type.short + '</b><small>' + (rows.length ? (regular ? '规律' : '已记') : '·') + '</small></span>';
  }).join('');
}

function renderMealList(){
  var box = byId('meal-list');
  if (!box) return;
  var today = mealRecordsForDate(new Date()).slice().sort(function(a, b){
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
  var primary = today.filter(function(record){ return mealTypeMeta(record.type).primary; });
  var extras = today.filter(function(record){ return !mealTypeMeta(record.type).primary; });
  var regularCount = primary.filter(function(record){ return record.regular; }).length;
  setTxt('meal-today-summary', primary.length ?
    '正餐 ' + primary.length + '/3 · 规律 ' + regularCount : '还没有正餐记录');
  box.innerHTML = primary.length ? primary.map(mealEntryHtml).join('') :
    '<div class="meal-empty">今天还没有正餐记录<br><span>准备吃饭时，点一下上方的“吃饭啦！”。</span></div>';
  var extraBox = byId('meal-extra-box');
  var extraList = byId('meal-extra-list');
  if (extraBox) extraBox.hidden = !extras.length;
  if (extraList) extraList.innerHTML = extras.map(mealEntryHtml).join('');
  setTxt('meal-extra-count', extras.length + ' 笔');
}

function renderMealWeek(){
  var box = byId('meal-week-list');
  if (!box) return;
  var today = new Date(), rows = [], total = 0, activeDays = 0;
  for (var offset = 0; offset < 7; offset++) {
    var day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    var records = mealRecordsForDate(day);
    total += records.length;
    if (records.length) activeDays++;
    if (!records.length) continue;
    var labels = MEAL_TYPES.filter(function(type){
      return records.some(function(record){ return record.type === type.id; });
    }).map(function(type){
      return type.name;
    }).join(' · ');
    rows.push('<div class="meal-week-row"><span><b>' + (offset === 0 ? '今天' : (day.getMonth() + 1) + '/' + day.getDate()) +
      '</b><small>' + escHtml(labels) + '</small></span><strong>' + records.length + ' 顿</strong></div>');
  }
  setTxt('meal-week-summary', total + ' 顿 · ' + activeDays + ' 天');
  box.innerHTML = rows.length ? rows.join('') : '<div class="meal-week-empty">过去 7 天还没有记录</div>';
}

function mealDayGrade(date){
  var records = mealRecordsForDate(date);
  var regularTypes = {};
  each(records, function(record){
    if (record.regular && mealTypeMeta(record.type).primary) regularTypes[record.type] = true;
  });
  var count = Object.keys(regularTypes).length;
  return {
    records: records,
    regularCount: count,
    late: records.some(function(record){ return record.type === 'late'; }),
    grade: count >= 3 ? 'green' : count === 2 ? 'yellow' : count === 1 ? 'red' : records.length ? 'none' : ''
  };
}

function renderMealCalendar(){
  var grid = byId('meal-calendar-grid');
  if (!grid) return;
  var today = new Date();
  var month = new Date(today.getFullYear(), today.getMonth() + mealCalendarOffset, 1);
  var year = month.getFullYear(), monthIndex = month.getMonth();
  var firstOffset = (month.getDay() + 6) % 7;
  var days = new Date(year, monthIndex + 1, 0).getDate();
  setTxt('meal-calendar-title', year + '年' + (monthIndex + 1) + '月');
  var next = document.querySelector('[data-action="changeMealCalendarMonth"][data-args="[1]"]');
  if (next) {
    next.disabled = mealCalendarOffset >= 0;
    next.style.opacity = mealCalendarOffset >= 0 ? '.28' : '';
  }
  var html = '';
  for (var blank = 0; blank < firstOffset; blank++) html += '<span class="meal-cal-blank"></span>';
  for (var dayNum = 1; dayNum <= days; dayNum++) {
    var day = new Date(year, monthIndex, dayNum);
    var info = mealDayGrade(day);
    var isToday = mealDateKey(day) === wTodayStr();
    html += '<span class="meal-cal-day' + (isToday ? ' today' : '') + '">' +
      '<b>' + dayNum + '</b>' +
      (info.grade ? '<i class="meal-cal-status ' + info.grade + '">' + (info.grade === 'none' ? '×' : '') + '</i>' : '') +
      (info.late ? '<i class="meal-cal-late" title="夜宵"></i>' : '') + '</span>';
  }
  grid.innerHTML = html;
}

function changeMealCalendarMonth(delta){
  mealCalendarOffset = Math.min(0, mealCalendarOffset + (Number(delta) || 0));
  renderMealCalendar();
}

function renderMealPage(){
  if (!mealData) return;
  paintMealCountdown();
  renderMealTypeStrip();
  renderMealList();
  renderMealWeek();
  renderMealCalendar();
}

function recordMealNow(){
  recordMealAt(new Date());
}

function recordMealAt(when, options){
  if (!mealData) loadMealState();
  options = options || {};
  when = when instanceof Date ? new Date(when.getTime()) : new Date(when || Date.now());
  if (isNaN(when.getTime())) when = new Date();
  var type = mealTypeForDate(when);
  var meta = mealTypeMeta(type);
  var previous = mealPreviousRecord(when);
  var review = mealMomentReview(type, when, previous);
  var record = {
    id: 'meal_' + when.getTime() + '_' + Math.random().toString(36).slice(2, 6),
    type: type,
    date: mealDateKey(when),
    time: mealClock(when),
    createdAt: when.toISOString(),
    regular: review.regular,
    gapMinutes: review.gapMinutes,
    reviewTitle: review.title,
    tip: mealTipFor(type, when),
    backfill: !!options.backfill
  };
  mealData.records.push(record);
  saveMealState();
  renderMealPage();
  renderDashboard();
  openSheet(
    '<h3>' + (record.backfill ? '补记 · ' : '') + escHtml(meta.name) + ' · ' + escHtml(record.time) + '</h3>' +
    '<div class="meal-feedback-state ' + escHtml(review.tone) + '">' + escHtml(review.title) + '</div>' +
    '<p class="meal-feedback-detail">' + escHtml(review.detail) + '</p>' +
    '<div class="meal-tip-card"><b>饮食小知识</b><span>' + escHtml(record.tip) + '</span></div>' +
    '<p class="meal-feedback-note">这些只是一般作息提示，按自己的饥饿感和身体状况调整。</p>' +
    '<div class="row"><button class="primary" style="flex:1"' + actionAttrs('closeSheet') + '>知道了</button></div>'
  );
  toast(record.backfill ? '已补记' + meta.name : '已记录' + meta.name);
}

function openMealBackfill(){
  var now = new Date();
  openSheet(
    '<h3>补记一顿</h3>' +
    '<p>选择当时的日期和时间，系统仍会自动判断餐次与是否规律。</p>' +
    '<label class="todo-form-label">日期</label><input class="todo-form-input" type="date" id="meal-backfill-date" value="' + wTodayStr() + '" max="' + wTodayStr() + '">' +
    '<label class="todo-form-label">时间</label><input class="todo-form-input" type="time" id="meal-backfill-time" value="' + mealClock(now) + '">' +
    '<div class="row"><button class="ghost"' + actionAttrs('closeSheet') + '>取消</button>' +
    '<button class="primary"' + actionAttrs('saveMealBackfill') + '>补记</button></div>'
  );
}

function saveMealBackfill(){
  var dateValue = byId('meal-backfill-date').value;
  var timeValue = byId('meal-backfill-time').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !/^\d{2}:\d{2}$/.test(timeValue)) {
    toast('请选择补记日期和时间');
    return;
  }
  var dateParts = dateValue.split('-'), timeParts = timeValue.split(':');
  var when = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]),
    Number(timeParts[0]), Number(timeParts[1]), 0, 0);
  if (when.getTime() > Date.now() + 60000) {
    toast('不能补记未来的时间');
    return;
  }
  recordMealAt(when, { backfill: true });
}

function deleteMealRecord(id){
  var record = (mealData && mealData.records || []).filter(function(item){ return item.id === id; })[0];
  if (!record) return;
  appConfirm('删除这条' + mealTypeMeta(record.type).name + '记录？', function(){
    mealData.records = mealData.records.filter(function(item){ return item.id !== id; });
    saveMealState();
    renderMealPage();
    renderDashboard();
    toast('记录已删除');
  }, { title: '删除三餐记录', confirmLabel: '删除' });
}

function initMeals(){
  loadMealState();
  renderMealPage();
}
