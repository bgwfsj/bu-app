/* ============================================================
   5.4 酒记
   ============================================================ */
var ALCOHOL_TYPES = [
  { id: 'beer', name: '啤酒', abv: 4.5 },
  { id: 'wine', name: '红酒', abv: 12 },
  { id: 'baijiu', name: '白酒', abv: 52 },
  { id: 'whisky', name: '洋酒', abv: 40 },
  { id: 'cocktail', name: '鸡尾酒', abv: 10 },
  { id: 'other', name: '其他', abv: 5 }
];
var ETHANOL_DENSITY = 0.789;
var ALCOHOL_HEALTH_TIPS = [
  '酒精被列为一类致癌物，不存在对所有人都绝对安全的饮酒量。',
  '酒精不能帮助睡眠，它会让后半夜的睡眠更碎、更浅。',
  '饮酒后不要驾车，也不要在饮酒后操作机械。',
  '如果正在服药、孕期或哺乳期，或存在肝脏疾病，应避免饮酒并咨询专业人员。',
  '少喝一点、慢一点，并搭配食物和饮水，比短时间大量饮酒更稳妥。'
];
var ALCOHOL_RECOVERY_STAGES = [
  { ms: 20 * 60 * 1000, label: '20 分钟后', text: '心率与循环逐渐从饮酒后的波动中平稳下来。' },
  { ms: 12 * 60 * 60 * 1000, label: '12 小时后', text: '血液酒精通常已明显下降，补水和休息仍是重点。' },
  { ms: 24 * 60 * 60 * 1000, label: '1 天后', text: '身体逐步补回水分，睡眠与精力可能开始恢复。' },
  { ms: 3 * 24 * 60 * 60 * 1000, label: '3 天后', text: '睡眠节律、注意力和水分状态常开始改善。' },
  { ms: 7 * 24 * 60 * 60 * 1000, label: '1 周后', text: '睡眠质量与白天精力通常更稳定。' },
  { ms: 28 * 24 * 60 * 60 * 1000, label: '4 周后', text: '肝脏脂肪与血压等指标可能出现改善趋势。' },
  { ms: 84 * 24 * 60 * 60 * 1000, label: '12 周后', text: '多项代谢指标可能进一步改善。' }
];
var alcoholViewDate = '';

function alcoholDefaultState(){
  return { schemaVersion: 1, records: [] };
}

function alcoholTypeMeta(type){
  for (var i = 0; i < ALCOHOL_TYPES.length; i++) {
    if (ALCOHOL_TYPES[i].id === type) return ALCOHOL_TYPES[i];
  }
  return ALCOHOL_TYPES[0];
}

function alcoholDateKey(date){
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

function alcoholGramsFor(volumeMl, abv){
  return Math.round(Math.max(0, volumeMl) * Math.max(0, abv) / 100 * ETHANOL_DENSITY * 100) / 100;
}

function normalizeAlcoholState(data){
  var out = alcoholDefaultState();
  each(Array.isArray(data && data.records) ? data.records : [], function(record){
    if (!record || typeof record.id !== 'string') return;
    var type = alcoholTypeMeta(record.type);
    var abv = Number(record.abv);
    var volume = Number(record.volumeMl);
    if (!isFinite(abv) || abv <= 0 || abv > 95 || !isFinite(volume) || volume <= 0 || volume > 3000) return;
    var created = record.createdAt ? new Date(record.createdAt) : null;
    var when = created && !isNaN(created.getTime()) ? created : new Date();
    out.records.push({
      id: record.id,
      type: type.id,
      typeName: String(record.typeName || type.name),
      abv: Math.round(abv * 10) / 10,
      volumeMl: Math.round(volume),
      alcoholGrams: alcoholGramsFor(volume, abv),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(record.date || '')) ? record.date : alcoholDateKey(when),
      time: /^\d{2}:\d{2}$/.test(String(record.time || '')) ? record.time : (pad2(when.getHours()) + ':' + pad2(when.getMinutes())),
      createdAt: when.toISOString(),
      backfill: !!record.backfill
    });
  });
  out.records.sort(function(a, b){ return String(a.createdAt).localeCompare(String(b.createdAt)); });
  return out;
}

function loadAlcoholState(){
  alcoholData = normalizeAlcoholState(storeGet(ALKEY, null));
  saveAlcoholState();
}

function saveAlcoholState(){
  if (!alcoholData) alcoholData = alcoholDefaultState();
  alcoholData.schemaVersion = 1;
  storeSet(ALKEY, alcoholData);
}

function alcoholRecordsForDate(date){
  var key = typeof date === 'string' ? date : alcoholDateKey(date);
  return alcoholData.records.filter(function(record){ return record.date === key; });
}

function alcoholTotals(records){
  var grams = 0;
  each(records || [], function(record){ grams += Number(record.alcoholGrams) || 0; });
  return { grams: Math.round(grams * 100) / 100 };
}

function latestAlcoholRecord(){
  if (!alcoholData) return null;
  var latest = null, latestTime = -Infinity;
  each(alcoholData.records || [], function(record){
    var time = new Date(record.createdAt).getTime();
    if (isFinite(time) && time > latestTime) {
      latest = record;
      latestTime = time;
    }
  });
  return latest;
}

function alcoholDurationText(ms, compact){
  var seconds = Math.max(0, Math.floor(Number(ms) / 1000));
  if (seconds < 60) return compact ? seconds + ' 秒' : Math.max(0, seconds) + ' 秒';
  var minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + ' 分';
  var hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + ' 小时 ' + (minutes % 60) + ' 分';
  var days = Math.floor(hours / 24);
  return days + ' 天 ' + (hours % 24) + ' 小时';
}

function renderAlcoholSobriety(){
  var duration = byId('alcohol-sober-duration');
  if (!duration) return;
  var latest = latestAlcoholRecord();
  if (!latest) {
    setTxt('alcohol-sober-duration', '还没有记录');
    setTxt('alcohol-sober-stage', '等待第一次记录');
    setTxt('alcohol-sober-copy', '记录一次饮酒后，这里会从那个时间点开始计时。');
    setTxt('alcohol-sober-next-title', '身体恢复节点');
    setTxt('alcohol-sober-next', ALCOHOL_RECOVERY_STAGES[0].label + ' · ' + ALCOHOL_RECOVERY_STAGES[0].text);
    var emptyBar = byId('alcohol-sober-progress');
    if (emptyBar) emptyBar.style.width = '0%';
    return;
  }
  var elapsed = Math.max(0, Date.now() - new Date(latest.createdAt).getTime());
  var currentIdx = -1;
  for (var i = 0; i < ALCOHOL_RECOVERY_STAGES.length; i++) {
    if (elapsed >= ALCOHOL_RECOVERY_STAGES[i].ms) currentIdx = i;
  }
  var current = currentIdx >= 0 ? ALCOHOL_RECOVERY_STAGES[currentIdx] : {
    label: '刚刚停下',
    text: '先补水、休息，观察身体反应；不要继续饮酒。'
  };
  var next = ALCOHOL_RECOVERY_STAGES[currentIdx + 1];
  setTxt('alcohol-sober-duration', alcoholDurationText(elapsed, false));
  setTxt('alcohol-sober-stage', current.label);
  setTxt('alcohol-sober-copy', current.text);
  if (next) {
    setTxt('alcohol-sober-next-title', '下一节点 · 还差 ' + alcoholDurationText(next.ms - elapsed, true));
    setTxt('alcohol-sober-next', next.label + ' · ' + next.text);
  } else {
    setTxt('alcohol-sober-next-title', '全部恢复节点已走过');
    setTxt('alcohol-sober-next', '继续保持，把睡眠、饮食和运动留给身体慢慢修复。');
  }
  var startMs = currentIdx >= 0 ? ALCOHOL_RECOVERY_STAGES[currentIdx].ms : 0;
  var endMs = next ? next.ms : ALCOHOL_RECOVERY_STAGES[ALCOHOL_RECOVERY_STAGES.length - 1].ms;
  var pct = next ? Math.min(1, Math.max(0, (elapsed - startMs) / (endMs - startMs))) : 1;
  var bar = byId('alcohol-sober-progress');
  if (bar) bar.style.width = (pct * 100).toFixed(1) + '%';
}

function openAlcoholRecoveryStages(){
  var latest = latestAlcoholRecord();
  var elapsed = latest ? Math.max(0, Date.now() - new Date(latest.createdAt).getTime()) : 0;
  var currentIdx = -1;
  if (latest) {
    for (var i = 0; i < ALCOHOL_RECOVERY_STAGES.length; i++) {
      if (elapsed >= ALCOHOL_RECOVERY_STAGES[i].ms) currentIdx = i;
    }
  }
  var rows = ALCOHOL_RECOVERY_STAGES.map(function(stage, index){
    var state = currentIdx >= 0 && index < currentIdx ? 'past' :
      (index === currentIdx ? 'now' : 'future');
    var status = state === 'past' ? '已走过' :
      (state === 'now' ? '当前' :
        (latest ? '还差 ' + alcoholDurationText(stage.ms - elapsed, true) : '记录后开始'));
    return '<div class="alcohol-stage-row ' + state + '">' +
      '<div><b>' + escHtml(stage.label) + '</b><small>' + escHtml(status) + '</small></div>' +
      '<p>' + escHtml(stage.text) + '</p></div>';
  }).join('');
  openSheet(
    '<h3>身体恢复状态</h3>' +
    '<p>' + (latest ?
      '距离上次饮酒 ' + escHtml(alcoholDurationText(elapsed, false)) + '。' :
      '记录一次饮酒后，恢复节点会开始计时。') + '</p>' +
    '<div class="alcohol-stage-list">' + rows + '</div>' +
    '<p class="alcohol-sobriety-note">恢复速度受饮酒量、体重、睡眠和饮食影响；这些节点用于了解常见方向，不构成医疗建议。</p>' +
    '<div class="row"><button class="primary" style="flex:1"' + actionAttrs('closeSheet') + '>知道了</button></div>'
  );
}

function alcoholRecordHtml(record, showDate){
  var typeName = record.typeName || alcoholTypeMeta(record.type).name;
  return '<div class="alcohol-record"><span class="alcohol-record-time">' +
    escHtml(showDate ? record.date.slice(5) + ' ' + record.time : record.time) + '</span>' +
    '<span class="alcohol-record-main"><b>' + escHtml(typeName) + ' · ' + record.volumeMl + ' ml · ' +
    record.abv + '%</b><small>约 ' + record.alcoholGrams.toFixed(1) + ' g 纯酒精' +
    (record.backfill ? ' · 补记' : '') + '</small></span>' +
    '<strong>' + record.alcoholGrams.toFixed(1) + 'g</strong></div>';
}

function renderAlcoholCalendar(){
  var grid = byId('alcohol-calendar-grid');
  if (!grid) return;
  var now = new Date();
  var month = new Date(now.getFullYear(), now.getMonth() + alcoholCalendarOffset, 1);
  var year = month.getFullYear(), monthIndex = month.getMonth();
  var firstOffset = (month.getDay() + 6) % 7;
  var days = new Date(year, monthIndex + 1, 0).getDate();
  setTxt('alcohol-calendar-title', year + '年' + (monthIndex + 1) + '月');
  var next = document.querySelector('[data-action="changeAlcoholCalendarMonth"][data-args="[1]"]');
  if (next) {
    next.disabled = alcoholCalendarOffset >= 0;
    next.style.opacity = next.disabled ? '.28' : '';
  }
  var html = '';
  for (var blank = 0; blank < firstOffset; blank++) html += '<span class="alcohol-cal-blank"></span>';
  for (var dayNum = 1; dayNum <= days; dayNum++) {
    var day = new Date(year, monthIndex, dayNum);
    var key = alcoholDateKey(day);
    var records = alcoholRecordsForDate(day);
    var classes = 'alcohol-cal-day' + (records.length ? ' has-record' : '') +
      (key === wTodayStr() ? ' today' : '');
    html += records.length ?
      '<button type="button" class="' + classes + '"' + actionAttrs('openAlcoholDay', [key]) + '>' +
        dayNum + '<i></i></button>' :
      '<span class="' + classes + '">' + dayNum + '</span>';
  }
  grid.innerHTML = html;
}

function renderAlcoholPage(){
  if (!alcoholData) return;
  var now = new Date();
  var today = alcoholRecordsForDate(now).slice().sort(function(a, b){
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
  var totals = alcoholTotals(today);
  var monthPrefix = now.getFullYear() + '-' + pad2(now.getMonth() + 1);
  var monthTotals = alcoholTotals(alcoholData.records.filter(function(record){
    return String(record.date).indexOf(monthPrefix) === 0;
  }));
  setTxt('alcohol-top-date', (now.getMonth() + 1) + '月' + now.getDate() + '日 · 周' +
    ['日', '一', '二', '三', '四', '五', '六'][now.getDay()]);
  setTxt('alcohol-month-grams', monthTotals.grams.toFixed(1));
  setTxt('alcohol-today-grams', totals.grams.toFixed(1));
  byId('alcohol-list').innerHTML = today.length ? today.map(function(record){
    return alcoholRecordHtml(record, false);
  }).join('') : '<div class="alcohol-empty">今天还没有饮酒记录<br>如果喝了，记一杯；如果没喝，也很好。</div>';
  renderAlcoholSobriety();
  renderAlcoholCalendar();
  renderDashboard();
}

function alcoholFormTypeGrid(){
  return ALCOHOL_TYPES.map(function(type){
    return '<button type="button" class="' + (alcoholDraftType === type.id ? 'on' : '') + '"' +
      actionAttrs('pickAlcoholType', [type.id]) + '>' + type.name + '</button>';
  }).join('');
}

function updateAlcoholFormPreview(){
  var abv = parseFloat(byId('alcohol-abv') ? byId('alcohol-abv').value : '') || 0;
  var volume = parseFloat(byId('alcohol-volume') ? byId('alcohol-volume').value : '') || 0;
  var grams = alcoholGramsFor(volume, abv);
  setTxt('alcohol-form-grams', '约 ' + grams.toFixed(1) + ' g 纯酒精');
}

function openAlcoholRecordForm(){
  var meta = alcoholTypeMeta(alcoholDraftType);
  openSheet(
    '<h3>记一杯</h3>' +
    '<p>选择酒种，确认度数和饮用量，纯酒精克数会自动计算。</p>' +
    '<label class="todo-form-label">酒种</label><div class="alcohol-type-grid" id="alcohol-type-grid">' +
      alcoholFormTypeGrid() + '</div>' +
    '<div class="alcohol-form-row"><div><label class="todo-form-label">酒精度数 %</label>' +
      '<input class="todo-form-input" id="alcohol-abv" type="number" inputmode="decimal" min="0.1" max="95" step="0.1" value="' + meta.abv + '"></div>' +
      '<div><label class="todo-form-label">饮用量 ml</label>' +
      '<input class="todo-form-input" id="alcohol-volume" type="number" inputmode="numeric" min="1" max="3000" step="10" value="330"></div></div>' +
    '<div class="alcohol-form-preview"><b id="alcohol-form-grams">约 0.0 g 纯酒精</b>' +
      '<span>只记录纯酒精克数</span></div>' +
    '<div class="row"><button class="ghost"' + actionAttrs('closeSheet') + '>取消</button>' +
    '<button class="primary"' + actionAttrs('saveAlcoholRecord') + '>记录</button></div>'
  );
  byId('alcohol-abv').addEventListener('input', updateAlcoholFormPreview);
  byId('alcohol-volume').addEventListener('input', updateAlcoholFormPreview);
  updateAlcoholFormPreview();
}

function openAlcoholBackfillForm(){
  var meta = alcoholTypeMeta(alcoholDraftType);
  var now = new Date();
  openSheet(
    '<h3>补记饮酒</h3>' +
    '<p>选择过去的日期和时间，再记录酒种、度数与饮用量。</p>' +
    '<div class="alcohol-form-row"><div><label class="todo-form-label">日期</label>' +
      '<input class="todo-form-input" id="alcohol-backfill-date" type="date" value="' + wTodayStr() + '" max="' + wTodayStr() + '"></div>' +
      '<div><label class="todo-form-label">时间</label>' +
      '<input class="todo-form-input" id="alcohol-backfill-time" type="time" value="' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + '"></div></div>' +
    '<label class="todo-form-label">酒种</label><div class="alcohol-type-grid" id="alcohol-type-grid">' +
      alcoholFormTypeGrid() + '</div>' +
    '<div class="alcohol-form-row"><div><label class="todo-form-label">酒精度数 %</label>' +
      '<input class="todo-form-input" id="alcohol-abv" type="number" inputmode="decimal" min="0.1" max="95" step="0.1" value="' + meta.abv + '"></div>' +
      '<div><label class="todo-form-label">饮用量 ml</label>' +
      '<input class="todo-form-input" id="alcohol-volume" type="number" inputmode="numeric" min="1" max="3000" step="10" value="330"></div></div>' +
    '<div class="alcohol-form-preview"><b id="alcohol-form-grams">约 0.0 g 纯酒精</b>' +
      '<span>只记录纯酒精克数</span></div>' +
    '<div class="row"><button class="ghost"' + actionAttrs('closeSheet') + '>取消</button>' +
    '<button class="primary"' + actionAttrs('saveAlcoholBackfill') + '>补记</button></div>'
  );
  byId('alcohol-abv').addEventListener('input', updateAlcoholFormPreview);
  byId('alcohol-volume').addEventListener('input', updateAlcoholFormPreview);
  updateAlcoholFormPreview();
}

function openAlcoholMenu(){
  openSheet(
    '<h3>酒记</h3>' +
    '<p>补录之前喝过的酒，记录仍会出现在对应日期和月历里。</p>' +
    '<div class="settings-group alcohol-menu-group">' +
      '<button class="settings-row" data-action="openAlcoholBackfillForm">' +
        '<span><b>补记饮酒记录</b><small>选择过去的日期和时间</small></span><em>补记 ›</em>' +
      '</button>' +
    '</div>' +
    '<div class="row"><button class="ghost" style="flex:1"' + actionAttrs('closeSheet') + '>取消</button></div>'
  );
}

function pickAlcoholType(type){
  var meta = alcoholTypeMeta(type);
  alcoholDraftType = meta.id;
  var grid = byId('alcohol-type-grid');
  if (grid) grid.innerHTML = alcoholFormTypeGrid();
  var abv = byId('alcohol-abv');
  if (abv) abv.value = meta.abv;
  updateAlcoholFormPreview();
}

function createAlcoholRecord(dateValue, timeValue, backfill){
  var meta = alcoholTypeMeta(alcoholDraftType);
  var abv = parseFloat(byId('alcohol-abv').value);
  var volume = parseInt(byId('alcohol-volume').value, 10);
  if (!isFinite(abv) || abv <= 0 || abv > 95) { toast('请输入有效度数'); return null; }
  if (!isFinite(volume) || volume <= 0 || volume > 3000) { toast('请输入有效饮用量'); return null; }
  var when;
  if (dateValue || timeValue) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !/^\d{2}:\d{2}$/.test(timeValue)) {
      toast('请选择补记日期和时间');
      return null;
    }
    var dateParts = dateValue.split('-'), timeParts = timeValue.split(':');
    when = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]),
      Number(timeParts[0]), Number(timeParts[1]), 0, 0);
    if (isNaN(when.getTime()) || when.getTime() > Date.now() + 60000) {
      toast('不能补记未来的时间');
      return null;
    }
  } else {
    when = new Date();
  }
  var record = {
    id: 'alcohol_' + when.getTime().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    type: meta.id,
    typeName: meta.name,
    abv: Math.round(abv * 10) / 10,
    volumeMl: volume,
    alcoholGrams: alcoholGramsFor(volume, abv),
    date: alcoholDateKey(when),
    time: pad2(when.getHours()) + ':' + pad2(when.getMinutes()),
    createdAt: when.toISOString(),
    backfill: !!backfill
  };
  alcoholData.records.push(record);
  saveAlcoholState();
  if (backfill) {
    var currentMonth = new Date();
    var targetMonth = new Date(when.getFullYear(), when.getMonth(), 1);
    var currentMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    alcoholCalendarOffset = Math.min(0,
      (targetMonth.getFullYear() - currentMonthStart.getFullYear()) * 12 +
      targetMonth.getMonth() - currentMonthStart.getMonth());
  }
  renderAlcoholPage();
  return record;
}

function showAlcoholRecordFeedback(record){
  var when = new Date(record.createdAt);
  var dayTotals = alcoholTotals(alcoholRecordsForDate(record.date));
  var tip = ALCOHOL_HEALTH_TIPS[(when.getDate() + when.getHours() + alcoholData.records.length) % ALCOHOL_HEALTH_TIPS.length];
  openSheet(
    '<h3>' + (record.backfill ? '已补记' : '已记录') + ' · ' + escHtml(record.typeName) + '</h3>' +
    '<p>' + escHtml(record.date) + ' · ' + record.volumeMl + ' ml · ' + record.abv + '% · ' + record.time + '</p>' +
    '<div class="alcohol-feedback-total"><b>' + record.alcoholGrams.toFixed(1) + ' g</b>' +
      '<span>本次纯酒精</span></div>' +
    '<div class="alcohol-feedback-total"><b>' + dayTotals.grams.toFixed(1) + ' g</b>' +
      '<span>当日累计纯酒精</span></div>' +
    '<div class="alcohol-feedback-tip"><b>健康提示</b><span>' + escHtml(tip) + '</span></div>' +
    '<div class="row"><button class="primary" style="flex:1"' + actionAttrs('closeSheet') + '>知道了</button></div>'
  );
  toast((record.backfill ? '已补记 ' : '已记录 ') + record.typeName);
}

function saveAlcoholRecord(){
  var record = createAlcoholRecord(null, null, false);
  if (record) showAlcoholRecordFeedback(record);
}

function saveAlcoholBackfill(){
  var dateValue = byId('alcohol-backfill-date').value;
  var timeValue = byId('alcohol-backfill-time').value;
  var record = createAlcoholRecord(dateValue, timeValue, true);
  if (record) showAlcoholRecordFeedback(record);
}

function deleteAlcoholRecord(id){
  var record = alcoholData.records.filter(function(item){ return item.id === id; })[0];
  if (!record) return;
  appConfirm('删除这条 ' + record.typeName + ' 饮酒记录？', function(){
    alcoholData.records = alcoholData.records.filter(function(item){ return item.id !== id; });
    saveAlcoholState();
    renderAlcoholPage();
    if (alcoholViewDate) openAlcoholDay(alcoholViewDate);
    toast('饮酒记录已删除');
  }, { title: '删除酒记', confirmLabel: '删除' });
}

function changeAlcoholCalendarMonth(delta){
  alcoholCalendarOffset = Math.min(0, alcoholCalendarOffset + (Number(delta) || 0));
  renderAlcoholCalendar();
}

function openAlcoholDay(date){
  var records = alcoholRecordsForDate(date).slice().sort(function(a, b){
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
  var totals = alcoholTotals(records);
  alcoholViewDate = date;
  openSheet(
    '<h3>' + escHtml(date) + '</h3>' +
    '<div class="alcohol-feedback-total"><b>' + totals.grams.toFixed(1) + ' g</b>' +
      '<span>当日纯酒精累计</span></div>' +
    (records.length ? records.map(function(record){
      return '<div class="alcohol-day-row"><span><b>' + escHtml(record.typeName) + ' · ' +
        record.volumeMl + ' ml · ' + record.abv + '%</b><small>' + record.time +
        ' · 约 ' + record.alcoholGrams.toFixed(1) + ' g' + (record.backfill ? ' · 补记' : '') +
        '</small></span><strong>' +
        record.alcoholGrams.toFixed(1) + 'g</strong><button' +
        actionAttrs('deleteAlcoholRecord', [record.id]) + '>删除</button></div>';
    }).join('') : '<div class="alcohol-empty">这一天没有饮酒记录</div>') +
    '<div class="row"><button class="ghost" style="flex:1"' + actionAttrs('closeSheet') + '>关闭</button></div>'
  );
}

function initAlcohol(){
  loadAlcoholState();
  renderAlcoholPage();
}
