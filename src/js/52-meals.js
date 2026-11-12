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

var MEAL_GAP_RULES = {
  'breakfast>lunch':  { short: 210, long: 390, label: '早餐到午餐', range: '4–6 小时' },
  'breakfast>tea':    { short: 210, long: 480, label: '早餐到下午茶', range: '3–7 小时' },
  'breakfast>dinner': { short: 330, long: 600, label: '早餐到晚餐', range: '6–10 小时' },
  'breakfast>late':   { short: 540, long: 960, label: '早餐到夜宵', range: '9–16 小时' },
  'lunch>tea':        { short: 90,  long: 240, label: '午餐到下午茶', range: '1.5–3 小时' },
  'lunch>dinner':     { short: 270, long: 480, label: '午餐到晚餐', range: '4.5–7 小时' },
  'lunch>late':       { short: 420, long: 720, label: '午餐到夜宵', range: '7–12 小时' },
  'lunch>breakfast':  { short: 780, long: 1260, label: '午餐到早餐', range: '13–20 小时', overnight: true },
  'tea>dinner':       { short: 120, long: 300, label: '下午茶到晚餐', range: '2–4 小时' },
  'tea>late':         { short: 240, long: 540, label: '下午茶到夜宵', range: '4–8 小时' },
  'tea>breakfast':    { short: 600, long: 1080, label: '下午茶到早餐', range: '10–18 小时', overnight: true },
  'tea>lunch':        { short: 600, long: 1080, label: '下午茶到午餐', range: '10–18 小时', overnight: true },
  'dinner>late':      { short: 90,  long: 300, label: '晚餐到夜宵', range: '2–4 小时' },
  'dinner>breakfast': { short: 540, long: 960, label: '晚餐到早餐', range: '10–15 小时', overnight: true },
  'dinner>lunch':     { short: 780, long: 1260, label: '晚餐到午餐', range: '13–20 小时', overnight: true },
  'late>breakfast':   { short: 480, long: 900, label: '夜宵到早餐', range: '8–14 小时', overnight: true },
  'late>lunch':       { short: 720, long: 1200, label: '夜宵到午餐', range: '12–19 小时', overnight: true },
  'late>dinner':      { short: 660, long: 1260, label: '夜宵到晚餐', range: '11–20 小时', overnight: true }
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

function mealInIdealWindow(type, date){
  var meta = mealTypeMeta(type);
  if (!meta.primary) return false;
  var minutes = date.getHours() * 60 + date.getMinutes();
  return minutes >= meta.idealStart && minutes <= meta.idealEnd;
}

function mealGapRule(prevType, curType){
  var rule = MEAL_GAP_RULES[prevType + '>' + curType];
  if (!rule) {
    rule = prevType === curType ?
      { short: 120, long: 360, label: '同类餐次', range: '2–6 小时', same: true } :
      { short: 120, long: 480, label: mealTypeMeta(prevType).name + '到' + mealTypeMeta(curType).name, range: '2–8 小时' };
  }
  return rule;
}

function mealGapInfo(prevType, curType, gap){
  var rule = mealGapRule(prevType, curType);
  if (gap < rule.short) return { band: 'short', rule: rule };
  if (gap > rule.long) return { band: 'long', rule: rule };
  return { band: 'good', rule: rule };
}

function mealGapText(prevType, curType, gap, info){
  var rule = info.rule;
  var prevName = mealTypeMeta(prevType).name;
  if (rule.same) {
    if (info.band === 'short') return '同一个' + prevName + '相隔不到 2 小时，可能是重复记录，检查一下。';
    if (info.band === 'long') return '同一个' + prevName + '又记了一次，相隔约 ' + mealDurationLabel(gap) + '。';
    return '同一个' + prevName + '相隔约 ' + mealDurationLabel(gap) + '。';
  }
  if (info.band === 'short') {
    return '距上一顿（' + prevName + '）只有 ' + mealDurationLabel(gap) + '，' + rule.label + '常见间隔是 ' + rule.range + '，这次偏近，不饿的话可以晚一点再吃。';
  }
  if (info.band === 'long') {
    return '距上一顿（' + prevName + '）约 ' + mealDurationLabel(gap) + '，比' + rule.label + '常见的 ' + rule.range + '久一些，慢慢吃，别一次吃得太急。';
  }
  if (rule.overnight) {
    return '距上一顿（' + prevName + '）约 ' + mealDurationLabel(gap) + '，经过一整夜，正是' + rule.label + '常见的间隔。';
  }
  return '距上一顿（' + prevName + '）约 ' + mealDurationLabel(gap) + '，落在' + rule.label + '常见的 ' + rule.range + '里。';
}

function mealIsRegular(type, date, previous){
  if (!mealInIdealWindow(type, date)) return false;
  var gap = mealGapMinutes(previous, date);
  if (gap == null) return true;
  var info = mealGapInfo(previous ? previous.type : null, type, gap);
  return info.band !== 'short';
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
  var gap = mealGapMinutes(previous, date);
  var gapInfo = gap == null ? null : mealGapInfo(previous ? previous.type : null, type, gap);
  var regular = mealIsRegular(type, date, previous);
  var detail = '';
  if (meta.primary) {
    var inWindow = mealInIdealWindow(type, date);
    detail = meta.name + '理想时间是 ' + meta.idealLabel + '，这次在 ' + mealClock(date) +
      (inWindow ? '，时间在范围内。' : '，不在理想时段。');
    if (!inWindow && gapInfo && gapInfo.band === 'good') {
      detail += ' 上一顿比较晚，这一顿顺延一些也合理。';
    }
  } else if (type === 'tea') {
    detail = '这是一顿下午茶，不计入三顿正餐的规律统计。';
  } else {
    detail = '21:00 之后的记录归为夜宵，不计入三顿正餐的规律统计。';
  }
  if (gap == null) {
    detail += ' 目前还没有更早的用餐记录。';
  } else {
    detail += ' ' + mealGapText(previous.type, type, gap, gapInfo);
  }
  var title;
  if (type === 'late') title = '夜宵时间';
  else if (type === 'tea') title = '下午加个餐';
  else if (regular) title = '吃得规律';
  else if (gapInfo && gapInfo.band === 'short') title = '间隔有点近';
  else if (gapInfo && gapInfo.band === 'long') title = '间隔有些久';
  else if (gapInfo && gapInfo.band === 'good') title = '时间略晚，间隔合适';
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
      var previousSlot = i === 0 ?
        new Date(when.getFullYear(), when.getMonth(), when.getDate() - 1, 17, 30, 0, 0) :
        new Date(when.getFullYear(), when.getMonth(), when.getDate(), MEAL_SLOTS[i - 1].hour, MEAL_SLOTS[i - 1].minute, 0, 0);
      return {
        type: slot.id,
        name: slot.name,
        target: target,
        from: previousSlot,
        window: '理想 ' + meta.idealLabel,
        hint: slot.id === 'breakfast' ? '给一顿饭留出二十多分钟，也给自己留一点停顿。' :
          slot.id === 'lunch' ? '吃到七八分饱，下午会更从容一些。' :
          '晚餐清淡一点、少吃一点，夜里会更舒服。',
        tomorrow: false
      };
    }
  }
  var tomorrowTarget = new Date(when.getFullYear(), when.getMonth(), when.getDate() + 1, 6, 30, 0, 0);
  var tomorrowFrom = new Date(when.getFullYear(), when.getMonth(), when.getDate(), 17, 30, 0, 0);
  return {
    type: 'breakfast',
    name: '早餐',
    target: tomorrowTarget,
    from: tomorrowFrom,
    window: '理想 06:30–09:00',
    hint: '今晚给身体留一点空腹的时间，明早再慢慢补回来。',
    tomorrow: true
  };
}

function mealCountdownTargetAt(when, sourceRecords){
  when = when instanceof Date ? when : new Date(when || Date.now());
  var records = sourceRecords || (mealData ? mealData.records : []);
  var minutes = when.getHours() * 60 + when.getMinutes();
  var today = mealDateKey(when);
  var eaten = {};
  each(records, function(record){
    if (record.date === today) eaten[record.type] = true;
  });
  var previous = mealPreviousRecord(when, records);

  function slotStart(meta){
    return new Date(when.getFullYear(), when.getMonth(), when.getDate(), 0, meta.idealStart, 0, 0);
  }
  function slotEnd(meta){
    return new Date(when.getFullYear(), when.getMonth(), when.getDate(), 0, meta.idealEnd, 0, 0);
  }
  function earliestGood(meta){
    if (!previous) return slotStart(meta);
    var byGap = new Date(mealRecordDate(previous).getTime() +
      mealGapRule(previous.type, meta.id).short * 60000);
    return byGap.getTime() > slotStart(meta).getTime() ? byGap : slotStart(meta);
  }
  function gapReason(meta){
    var rule = mealGapRule(previous.type, meta.id);
    return rule.label + '常见间隔是 ' + rule.range;
  }

  var current = null;
  for (var i = 0; i < MEAL_TYPES.length; i++) {
    var t = MEAL_TYPES[i];
    if (!t.primary || minutes < t.idealStart || minutes > t.idealEnd || eaten[t.id]) continue;
    current = t;
    break;
  }

  if (current) {
    var earliest = earliestGood(current);
    if (earliest.getTime() <= when.getTime()) {
      return {
        type: current.id,
        name: current.name,
        target: slotEnd(current),
        from: slotStart(current),
        window: '理想 ' + current.idealLabel,
        hint: '现在正处在' + current.name + '的理想时段，慢慢吃，不必赶时间。',
        currentWindow: true,
        intervalWait: false,
        tomorrow: false
      };
    }
    return {
      type: current.id,
      name: current.name,
      target: earliest,
      from: slotStart(current),
      window: '理想 ' + current.idealLabel,
      hint: '上一顿刚吃完不久，' + gapReason(current) + '，建议等到 ' +
        mealClock(earliest) + ' 左右再吃，间隔会更从容。',
      currentWindow: false,
      intervalWait: true,
      tomorrow: false
    };
  }

  var next = mealNextTargetAt(when, records);
  var target = next.target;
  var hint = next.hint;
  if (previous) {
    var rule = mealGapRule(previous.type, next.type);
    var byGap = new Date(mealRecordDate(previous).getTime() + rule.short * 60000);
    if (byGap.getTime() > target.getTime()) {
      target = byGap;
      hint = rule.label + '常见间隔是 ' + rule.range + '，建议等到 ' +
        mealClock(target) + ' 左右再吃，间隔更从容。';
    }
  }
  next.target = target;
  next.hint = hint;
  next.currentWindow = false;
  next.intervalWait = false;
  return next;
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
  var next = mealCountdownTargetAt(now);
  setTxt('meal-top-date', (now.getMonth() + 1) + '月' + now.getDate() + '日 · 周' + ['日', '一', '二', '三', '四', '五', '六'][now.getDay()]);
  setTxt('meal-record-hint', '将记为' + current.name);
  setTxt('meal-next-label', next.currentWindow ? '距离当前理想就餐时间结束' :
    (next.intervalWait ? '距离' + next.name + '最佳时间' : '距离下一顿最佳时间'));
  setTxt('meal-next-name', next.name);
  setTxt('meal-next-timer', mealCountdownText(next.target.getTime() - now.getTime()));
  setTxt('meal-next-window', next.intervalWait ? next.window + ' · 建议 ' + mealClock(next.target) + ' 起' : next.window);
  setTxt('meal-next-hint', next.hint);
  var span = Math.max(1, next.target.getTime() - next.from.getTime());
  var elapsed = Math.max(0, Math.min(span, now.getTime() - next.from.getTime()));
  var progress = byId('meal-next-progress');
  if (progress) progress.style.width = (elapsed / span * 100).toFixed(2) + '%';
}

function mealEntryHtml(record){
  var meta = mealTypeMeta(record.type);
  return '<div class="meal-entry" data-type="' + meta.id + '" data-regular="' + (record.regular ? 'true' : 'false') + '">' +
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
    html += '<button type="button" class="meal-cal-day' + (isToday ? ' today' : '') + '"' +
      actionAttrs('openMealDay', [mealDateKey(day)]) + '>' +
      '<b>' + dayNum + '</b>' +
      (info.grade ? '<i class="meal-cal-status ' + info.grade + '">' + (info.grade === 'none' ? '×' : '') + '</i>' : '') +
      (info.late ? '<i class="meal-cal-late" title="夜宵"></i>' : '') + '</button>';
  }
  grid.innerHTML = html;
}

function changeMealCalendarMonth(delta){
  mealCalendarOffset = Math.min(0, mealCalendarOffset + (Number(delta) || 0));
  renderMealCalendar();
}

function openMealDay(dateKey){
  var parts = String(dateKey || '').split('-');
  if (parts.length !== 3) return;
  var day = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(day.getTime())) return;
  var all = (mealData ? mealData.records : []).slice().sort(function(a, b){
    return String(a.createdAt).localeCompare(String(b.createdAt));
  });
  var dayRecords = mealRecordsForDate(day).slice().sort(function(a, b){
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
  var primary = dayRecords.filter(function(record){ return mealTypeMeta(record.type).primary; });
  var regularCount = primary.filter(function(record){ return record.regular; }).length;
  var grade = mealDayGrade(day);
  var rows = dayRecords.map(function(record){
    var meta = mealTypeMeta(record.type);
    var prev = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === record.id) {
        if (i > 0) prev = all[i - 1];
        break;
      }
    }
    var review = mealMomentReview(record.type, mealRecordDate(record), prev);
    return '<div class="meal-day-row">' +
      '<span class="meal-day-dot ' + (record.regular ? 'good' : 'warn') + '"></span>' +
      '<span class="meal-day-main"><b>' + escHtml(meta.name) + ' · ' + escHtml(record.time) +
        (record.backfill ? '<i>补记</i>' : '') + '</b><small>' + escHtml(review.title) +
        '</small></span><p>' + escHtml(review.detail) + '</p></div>';
  }).join('');
  openSheet(
    '<h3>' + (day.getMonth() + 1) + '月' + day.getDate() + '日 · 三餐</h3>' +
    (dayRecords.length ?
      '<div class="meal-day-summary"><i class="' + (grade.grade === 'none' ? 'none' : grade.grade) + '">' +
        (grade.grade === 'none' ? '×' : '') + '</i>正餐 ' + primary.length + '/3 · 规律 ' +
        regularCount + '</div>' : '') +
    (rows || '<div class="meal-empty">这一天没有三餐记录</div>') +
    '<div class="row"><button class="ghost" style="flex:1"' + actionAttrs('closeSheet') + '>关闭</button></div>'
  );
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

function openMealMenu(){
  openSheet(
    '<h3>三餐</h3>' +
    '<div class="settings-group meal-menu-group">' +
    '<button class="settings-row" data-action="openMealBackfill"><span><b>补记一顿</b><small>选择过去的日期和时间补记</small></span><em>补记 ›</em></button>' +
    '</div>' +
    '<div class="row"><button class="ghost" style="flex:1"' + actionAttrs('closeSheet') + '>取消</button></div>'
  );
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



