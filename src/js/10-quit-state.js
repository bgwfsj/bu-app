/* ============================================================
   3. 状态加载（本 app 存档 → 旧版游戏存档只读迁移）
   ============================================================ */
function loadState(){
  var d = storeGet(AKEY, null);
  if (d && typeof d.quitDate === 'number' && d.quitDate > 0) {
    S = d;
    normalizeQuitHistory();
    return true;
  }

  // 首次运行：从旧游戏存档里只读取 quitDate，不碰旧存档
  var old = storeGet(QKEY, null);
  var legacy = old && old.registration && old.registration.quitDate;
  if (legacy > 0 && legacy <= Date.now()) {
    S = { quitDate: legacy, quitHistory: [] };
    saveS();
    return true;
  }
  return false;
}

function normalizeQuitHistory(){
  if (!Array.isArray(S.quitHistory)) S.quitHistory = [];
  S.quitHistory = S.quitHistory.filter(function(item){
    return item && Number(item.startedAt) > 0 && Number(item.endedAt) > 0 &&
      Number(item.durationMs) >= 0;
  }).slice(-100);
}

/* ============================================================
   4. 戒烟渲染
   ============================================================ */
function currentStageIdx(ms){
  var idx = -1;
  for (var i = 0; i < STAGES.length; i++) if (ms >= STAGES[i].ms) idx = i;
  return idx;
}

function setCurHead(label, badge){
  var el = byId('cur-t');
  if (!el) return;
  var html = '<span class="cdot"></span>' + label + '<em>' + badge + '</em>';
  if (el.getAttribute('data-h') !== html) {
    el.innerHTML = html;
    el.setAttribute('data-h', html);
  }
}

function renderQuit(){
  if (!S.quitDate) {
    renderQuitRecord(0);
    setTxt('r-d', '--'); setTxt('r-h', '--'); setTxt('r-m', '--'); setTxt('r-s', '--');
    setTxt('e-d', '--'); setTxt('e-h', '--'); setTxt('e-m', '--'); setTxt('e-s', '--');
    setTxt('f-d', '--'); setTxt('f-h', '--'); setTxt('f-m', '--'); setTxt('f-s', '--');
    setTxt('n-d', '--'); setTxt('n-h', '--'); setTxt('n-m', '--'); setTxt('n-s', '--');
    updateFlip('0', '00', '00', '00');
    setCurHead('等待设置', '0/' + STAGES.length);
    byId('cur-d').textContent = '先设置你开始戒烟的时间。';
    setTxt('quit-hero-title', '从今天开始');
    setTxt('quit-hero-sub', '先设置戒烟起点，之后每次打开都会看到身体恢复的进度。');
    byId('next-t').textContent = STAGES[0].d;
    byId('next-v').textContent = '--';
    byId('barfill').style.width = '0%';
    setClockProgress(0);
    if (lastStageIdx !== -1) { lastStageIdx = -1; renderStageList(-1); }
    return;
  }
  var now = Date.now();
  var ms = Math.max(0, now - S.quitDate);
  renderQuitRecord(ms);
  var s = Math.floor(ms / 1000);
  var d = Math.floor(s / 86400);
  var h = Math.floor((s % 86400) / 3600);
  var m = Math.floor((s % 3600) / 60);
  var sec = s % 60;

  var hh = pad2(h), mm = pad2(m), ss = pad2(sec);
  setTxt('r-d', '' + d);
  setTxt('r-h', hh);
  setTxt('r-m', mm);
  setTxt('r-s', ss);
  setTxt('e-d', '' + d);
  setTxt('e-h', hh);
  setTxt('e-m', mm);
  setTxt('e-s', ss);
  setTxt('f-d', '' + d);
  setTxt('f-h', hh);
  setTxt('f-m', mm);
  setTxt('f-s', ss);
  setTxt('n-d', '' + d);
  setTxt('n-h', hh);
  setTxt('n-m', mm);
  setTxt('n-s', ss);
  var dl = String(d).length;
  var roundDay = document.querySelector('.roundday');
  if (roundDay) roundDay.dataset.len = dl >= 5 ? '5' : (dl === 4 ? '4' : '');
  if (dl !== lastDLen) { lastDLen = dl; fitClock(); }   // 位数变化时重算字号
  updateFlip('' + d, hh, mm, ss);
  setTxt('quit-hero-title', '身体正在回来');

  var idx = currentStageIdx(ms);

  // 当前身体状况
  if (idx >= 0) {
    setCurHead('戒烟 ' + STAGES[idx].t, (idx + 1) + '/' + STAGES.length);
    byId('cur-d').textContent = STAGES[idx].d;
    setTxt('quit-hero-sub', STAGES[idx].d);
  } else {
    setCurHead('刚刚开始', '0/' + STAGES.length);
    byId('cur-d').textContent = '身体仍在代谢尼古丁，先坚持住最初的 20 分钟。';
    setTxt('quit-hero-sub', '身体仍在代谢尼古丁，先坚持住最初的 20 分钟。');
  }

  // 下一阶段
  var next = STAGES[idx + 1];
  var curMs = idx >= 0 ? STAGES[idx].ms : 0;
  if (next) {
    byId('next-t').textContent = next.d;
    byId('next-v').textContent = fmtGapShort(next.ms - ms);
    var span = next.ms - curMs;
    var pct = span > 0 ? Math.min(1, Math.max(0, (ms - curMs) / span)) : 0;
    byId('barfill').style.width = (pct * 100).toFixed(2) + '%';
    setClockProgress(pct);
  } else {
    byId('next-t').textContent = '全部阶段已达成，身体已接近从不吸烟者水平';
    byId('next-v').textContent = '已完成';
    byId('barfill').style.width = '100%';
    setClockProgress(1);
  }

  if (idx !== lastStageIdx) {
    lastStageIdx = idx;
    renderStageList(idx);
  }
}

function quitRecordDuration(ms){
  var minutes = Math.floor(Math.max(0, ms) / 60000);
  if (minutes >= 1440) return Math.floor(minutes / 1440) + ' 天';
  if (minutes >= 60) return Math.floor(minutes / 60) + ' 小时';
  return Math.max(1, minutes) + ' 分钟';
}

function quitRecordDate(ms){
  var d = new Date(ms);
  return d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate());
}

function renderQuitRecord(currentMs){
  var box = byId('quit-record');
  if (!box) return;
  if (!S.quitDate) {
    box.innerHTML = '';
    box.hidden = true;
    return;
  }
  normalizeQuitHistory();
  var history = S.quitHistory || [];
  box.hidden = false;
  if (!history.length) {
    box.innerHTML = '<b>你第一次走这么远</b>';
    return;
  }
  var longest = history.slice().sort(function(a, b){
    return Number(b.durationMs) - Number(a.durationMs);
  })[0];
  var last = history.slice().sort(function(a, b){
    return Number(b.endedAt) - Number(a.endedAt);
  })[0];
  if (currentMs >= Number(longest.durationMs)) {
    box.innerHTML = '<b>你第一次走这么远</b>';
  } else {
    box.innerHTML = '<b>最久 ' + quitRecordDuration(longest.durationMs) +
      '</b><small>' + quitRecordDate(last.endedAt) + '</small>';
  }
}

function setTxt(id, v){
  var el = byId(id);
  if (el && el.textContent !== v) el.textContent = v;
}

function setClockProgress(pct){
  pct = Math.min(1, Math.max(0, Number(pct) || 0));
  var clocks = byId('clocks');
  if (clocks) clocks.style.setProperty('--stage', pct);

  var rings = [{ id: 'round-ring', radius: 128 }];
  each(rings, function(item){
    var ring = byId(item.id);
    if (!ring) return;
    var circumference = 2 * Math.PI * item.radius;
    ring.setAttribute('stroke-dasharray', circumference.toFixed(2));
    ring.setAttribute('stroke-dashoffset', (circumference * (1 - pct)).toFixed(2));
  });

  var wind = byId('enso-ring');
  if (wind) {
    var windLength = wind.getTotalLength();
    wind.setAttribute('stroke-dasharray', windLength.toFixed(2));
    wind.setAttribute('stroke-dashoffset', (windLength * (1 - pct)).toFixed(2));
  }

  var angle = pct * Math.PI * 2;
  ['orbit-dot', 'orbit-glow'].forEach(function(id){
    var dot = byId(id);
    if (!dot) return;
    dot.setAttribute('cx', (140 + Math.cos(angle) * 128).toFixed(2));
    dot.setAttribute('cy', (140 + Math.sin(angle) * 128).toFixed(2));
  });

  var flow = byId('flow-track');
  var flowDot = byId('flow-dot');
  if (flow && flowDot) {
    var length = flow.getTotalLength();
    var point = flow.getPointAtLength(length * pct);
    flowDot.setAttribute('cx', point.x.toFixed(2));
    flowDot.setAttribute('cy', point.y.toFixed(2));
  }
}

function renderStageList(idx){
  var html = '';
  for (var i = 0; i < STAGES.length; i++) {
    var cls = i === idx ? 'srow now' : (i < idx ? 'srow past' : 'srow');
    html += '<div class="' + cls + '"><div class="st">' + STAGES[i].t + '</div><div class="sd">' + STAGES[i].d + '</div></div>';
  }
  byId('stagelist').innerHTML = html;
}
