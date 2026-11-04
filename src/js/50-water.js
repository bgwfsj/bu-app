/* ============================================================
   8. 喝水
   ============================================================ */
/* ---------- 数据层 ---------- */
function wTodayStr(){
  var d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function wDefault(){
  return { currentDate: wTodayStr(), todayRecords: [], dailyGoal: 2000, history: {}, quickAmounts: DEFAULT_QUICK.slice() };
}
function wNormalize(d){
  if (!d || typeof d !== 'object' || !d.currentDate || !Array.isArray(d.todayRecords)) return null;
  if (!Array.isArray(d.quickAmounts) || d.quickAmounts.length !== 6) d.quickAmounts = DEFAULT_QUICK.slice();
  d.dailyGoal = d.dailyGoal || 2000;
  d.history = d.history || {};
  return d;
}
function wLoad(){ return wNormalize(storeGet(WKEY, null)) || wDefault(); }
function wSave(){ wd.schemaVersion = 1; storeSet(WKEY, wd); }
function wQuickAmounts(){
  var a = (wd && wd.quickAmounts) || [];
  return a.length === 6 ? a : DEFAULT_QUICK.slice();
}
function wTotal(){ return wd.todayRecords.reduce(function(s, r){ return s + (r.amount || 0); }, 0); }

/* 跨天：把昨天以前的数据归档进 history */
function wRollover(){
  var today = wTodayStr();
  if (wd.currentDate === today) return false;
  if (wd.todayRecords.length) {
    wd.history[wd.currentDate] = { count: wd.todayRecords.length, total: wTotal() };
  }
  wd.currentDate = today;
  wd.todayRecords = [];
  wSave();
  return true;
}

function initWater(){
  wd = wLoad();
  wRollover();
  bindWaterLists();
  renderWater();
}

function renderWater(){
  var total = wTotal();
  var goal = wd.dailyGoal || 2000;
  var pct = Math.min(total / goal, 1);
  var C = 2 * Math.PI * 86;

  byId('w-total').textContent = total;
  byId('w-goal').textContent = '/ ' + goal + ' ml';
  byId('w-pct').textContent = Math.round(pct * 100) + '%';
  setTxt('water-hero-sub', total >= goal ?
    '今天已经喝够 ' + total + ' ml，接下来按身体需要补充就好。' :
    '今天已记录 ' + total + ' ml，距离目标还差 ' + (goal - total) + ' ml。');
  var fg = byId('rfg');
  fg.setAttribute('stroke-dasharray', C.toFixed(2));
  fg.setAttribute('stroke-dashoffset', (C * (1 - pct)).toFixed(2));

  // 快捷按钮
  var grid = byId('qgrid');
  grid.innerHTML = wd.quickAmounts.map(function(a){
    return '<button class="qbtn" data-amt="' + a + '">' + a + ' ml</button>';
  }).join('');

  // 今日记录（倒序）
  byId('w-count').textContent = wd.todayRecords.length + ' 次';
  var list = byId('w-list');
  if (!wd.todayRecords.length) {
    list.innerHTML = '<div class="rempty">今天还没喝水，先来一杯</div>';
  } else {
    var rows = '';
    for (var j = wd.todayRecords.length - 1; j >= 0; j--) {
      var r = wd.todayRecords[j];
      rows += '<div class="ritem"><span class="rtime">' + r.time + '</span>' +
        '<span class="ramt">' + r.amount + ' ml</span>' +
        '<button class="rdel" data-i="' + j + '">&#10005;</button></div>';
    }
    list.innerHTML = rows;
  }

  renderWChart();
  renderWHist();
}

/* 列表类交互统一用事件委托，渲染时不再重复绑监听 */
function bindWaterLists(){
  var grid = byId('qgrid');
  if (grid && !grid._bound) {
    grid._bound = true;
    grid.addEventListener('click', function(e){
      var b = e.target.closest('.qbtn');
      if (b) wAdd(parseInt(b.getAttribute('data-amt'), 10));
    });
  }
  var list = byId('w-list');
  if (list && !list._bound) {
    list._bound = true;
    list.addEventListener('click', function(e){
      var b = e.target.closest('.rdel');
      if (b) wDel(parseInt(b.getAttribute('data-i'), 10));
    });
  }
  var hist = byId('w-list2');
  if (hist && !hist._bound) {
    hist._bound = true;
    hist.addEventListener('click', function(e){
      var b = e.target.closest('.rdel');
      if (b) wDelDay(b.getAttribute('data-d'));
    });
  }
  var clearBtn = byId('w-hist-clear');
  if (clearBtn && !clearBtn._bound) {
    clearBtn._bound = true;
    clearBtn.addEventListener('click', clearWaterHistory);
  }
}

function clearWaterHistory(){
  if (!wd || !Object.keys(wd.history || {}).length) return;
  appConfirm('清空所有历史记录？今日记录不受影响。', function(){
    wd.history = {};
    wSave();
    renderWater();
    toast('历史已清空');
  });
}

function wAdd(amount){
  var amt = intIn(amount, 1, 9999);
  if (amt === null) { toast(amount > 9999 ? '水量过大' : '请输入有效水量'); return; }
  var now = new Date();
  wd.todayRecords.push({ time: pad2(now.getHours()) + ':' + pad2(now.getMinutes()), amount: amt });
  wSave();
  renderWater();
  byId('w-input').value = '';
  if (wTotal() >= wd.dailyGoal) toast('今日目标已达成');
  else toast('已记录 ' + amt + ' ml');
}
function wDel(i){
  wd.todayRecords.splice(i, 1);
  wSave();
  renderWater();
}

/* ---- 近 7 天折线（内联 SVG，无外部依赖） ---- */
function wDateOffset(off){
  var d = new Date();
  d.setDate(d.getDate() + off);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function wDayTotal(ds){
  if (ds === wTodayStr()) return wTotal();
  var h = wd.history && wd.history[ds];
  return h ? (h.total || 0) : 0;
}
function renderWChart(){
  var box = byId('w-chart');
  if (!box) return;
  var goal = wd.dailyGoal || 2000;
  var gl = byId('w-chart-goal');
  if (gl) gl.textContent = '目标 ' + goal + ' ml';

  var dates = [], labels = [];
  for (var i = -6; i <= 0; i++) {
    var ds = wDateOffset(i);
    dates.push(ds);
    if (i === 0) labels.push('今天');
    else { var p = ds.split('-'); labels.push(parseInt(p[1], 10) + '/' + parseInt(p[2], 10)); }
  }
  var totals = dates.map(wDayTotal);
  var hasAny = false;
  for (var a = 0; a < totals.length; a++) { if (totals[a] > 0) { hasAny = true; break; } }
  if (!hasAny) {
    box.innerHTML = '<div class="wempty">还没有记录，喝水后这里会出现 7 天趋势</div>';
    return;
  }
  var maxv = Math.max(goal, Math.max.apply(null, totals));
  var top = maxv * 1.22;
  var W = 320, H = 128, L = 12, R = 308, T = 18, B = 94;
  var n = dates.length, step = (R - L) / (n - 1);
  function X(i){ return L + step * i; }
  function Y(v){ return B - (v / top) * (B - T); }

  var pts = totals.map(function(v, i){ return [X(i), Y(v)]; });
  var line = pts.map(function(p, i){ return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
  var area = line + ' L' + R + ' ' + B + ' L' + L + ' ' + B + ' Z';
  var gy = Y(goal).toFixed(1);

  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="近七天喝水量">';
  s += '<defs><linearGradient id="wga" x1="0" y1="0" x2="0" y2="1">' +
       '<stop offset="0%" stop-color="#0b8ed6" stop-opacity=".20"/>' +
       '<stop offset="100%" stop-color="#0b8ed6" stop-opacity="0"/></linearGradient></defs>';
  s += '<line class="grid" x1="' + L + '" y1="' + B + '" x2="' + R + '" y2="' + B + '"/>';
  s += '<line class="goal" x1="' + L + '" y1="' + gy + '" x2="' + R + '" y2="' + gy + '"/>';
  s += '<path class="area" d="' + area + '"/>';
  s += '<path class="line" d="' + line + '"/>';
  for (var k = 0; k < pts.length; k++) {
    var last = (k === pts.length - 1);
    s += '<circle class="pt' + (last ? ' today' : '') + '" cx="' + pts[k][0].toFixed(1) + '" cy="' + pts[k][1].toFixed(1) + '" r="' + (last ? 3.2 : 2.4) + '"/>';
  }
  for (var m = 0; m < pts.length; m++) {
    if (totals[m] <= 0) continue;
    var lx = pts[m][0], anchor = '';
    if (m === 0) { lx = L + 1; anchor = ' style="text-anchor:start"'; }
    else if (m === pts.length - 1) { lx = R - 1; anchor = ' style="text-anchor:end"'; }
    var ly = pts[m][1] - 7;
    if (ly < 9) ly = pts[m][1] + 13;
    s += '<text class="vl" x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '"' + anchor + '>' + totals[m] + '</text>';
  }
  for (var q = 0; q < labels.length; q++) {
    s += '<text class="xl' + (q === labels.length - 1 ? ' today' : '') + '" x="' + X(q).toFixed(1) + '" y="' + (B + 17) + '">' + labels[q] + '</text>';
  }
  s += '</svg>';
  box.innerHTML = s;
}

/* ---- 历史记录 ---- */
function renderWHist(){
  var list = byId('w-list2'), sum = byId('w-hist-sum'), foot = byId('w-hist-foot');
  if (!list) return;
  var keys = Object.keys(wd.history || {}).sort().reverse();
  var totalAll = 0;
  for (var i = 0; i < keys.length; i++) totalAll += (wd.history[keys[i]].total || 0);
  if (sum) sum.textContent = keys.length ? (keys.length + ' 天 · 均 ' + Math.round(totalAll / keys.length) + ' ml') : '暂无';
  if (foot) foot.style.display = keys.length ? '' : 'none';

  if (keys.length === 0) {
    list.innerHTML = '<div class="rempty">还没有历史，过了今晚自动归档</div>';
    return;
  }
  var rows = '';
  for (var j = 0; j < keys.length; j++) {
    var d = keys[j], h = wd.history[d], p = d.split('-');
    rows += '<div class="ritem"><span class="hday">' + parseInt(p[1], 10) + '月' + parseInt(p[2], 10) + '日</span>' +
      '<span class="ramt">' + (h.count || 0) + ' 次 · ' + (h.total || 0) + ' ml</span>' +
      '<button class="rdel" data-d="' + d + '">&#10005;</button></div>';
  }
  list.innerHTML = rows;
}
function wDelDay(ds){
  if (!wd.history || !wd.history[ds]) return;
  delete wd.history[ds];
  wSave();
  renderWater();
  toast('已删除');
}

byId('btn-wadd').addEventListener('click', function(){
  var v = parseInt(byId('w-input').value, 10);
  if (!v) { toast('请输入水量'); return; }
  wAdd(v);
});
byId('w-input').addEventListener('keydown', function(e){
  if (e.key === 'Enter') { e.preventDefault(); this.blur(); byId('btn-wadd').click(); }
});

byId('btn-wset').addEventListener('click', function(){
  openWaterSettings();
});

/* ---------- 设置 ---------- */
function openWaterSettings(){
  var q = wQuickAmounts();
  var cells = q.map(function(v, i){
    return '<label class="qcell"><input type="number" inputmode="numeric" id="wq-' + i + '" value="' + v + '"></label>';
  }).join('');
  openSheet(
    '<h3>喝水设置</h3>' +
    '<p>每日目标，以及快捷按钮上的水量（默认水量）</p>' +
    '<label class="fld">每日目标 (ml)<input type="number" inputmode="numeric" id="w-goal-input" value="' + (wd.dailyGoal || 2000) + '"></label>' +
    '<div class="fld" style="margin-bottom:6px">快捷水量 (ml)</div>' +
    '<div class="qgrid-edit">' + cells + '</div>' +
    '<div class="row"><button class="ghost"' + actionAttrs('closeSheet') + '>取消</button>' +
    '<button class="primary"' + actionAttrs('saveWaterSettings') + '>保存</button></div>'
  );
}

function saveWaterSettings(){
  var goal = intIn(byId('w-goal-input').value, 100, 20000);
  if (goal === null) { toast('目标请填 100~20000'); return; }
  var amounts = [];
  for (var i = 0; i < 6; i++) {
    var el = byId('wq-' + i);
    var v = intIn(el && el.value, 10, 4999);
    if (v === null) { toast('快捷水量请填 10~4999'); return; }
    amounts.push(v);
  }
  wd.dailyGoal = goal;
  wd.quickAmounts = amounts;
  wSave();
  closeSheet();
  renderWater();
  toast('设置已保存');
}
