/* ============================================================
   6. 破戒 / 设置
   ============================================================ */
byId('btn-break').addEventListener('click', function(){
  openSheet(
    '<h3>确定破戒了吗？</h3>' +
    '<p>确认后倒计时从此刻重新开始，身体恢复进度归零。<br>偶尔一次反复不代表失败，明天可以从头再来。</p>' +
    '<div class="row"><button class="ghost"' + actionAttrs('closeSheet') + '>再忍忍</button>' +
    '<button class="danger"' + actionAttrs('doBreak') + '>确认破戒</button></div>'
  );
});

function doBreak(){
  var now = Date.now();
  if (!Array.isArray(S.quitHistory)) S.quitHistory = [];
  if (S.quitDate > 0) {
    S.quitHistory.push({
      startedAt: S.quitDate,
      endedAt: now,
      durationMs: Math.max(0, now - S.quitDate)
    });
    S.quitHistory = S.quitHistory.slice(-100);
  }
  S.quitDate = now;
  S.smokeCount = (Math.max(0, Math.floor(Number(S.smokeCount) || 0)) || 0) + 1;
  saveS();
  closeSheet();
  lastStageIdx = -99;
  renderQuitPage();
  toast('已重置，从现在重新开始 · 抽烟 +1');
}

byId('btn-set').addEventListener('click', openQuitMenu);

/* 左上角“戒烟 / 烟”：在两个视图之间切换 */
function toggleSmokeView(){
  S.smokeView = !S.smokeView;
  saveS();
  renderQuitPage();
  fitClock();
}
byId('quit-brand').addEventListener('click', toggleSmokeView);

/* 戒烟右上角 ⋮：时间皮肤 + 设置起始时间 */
function openQuitMenu(){
  var cur = VIEWS.indexOf(S.view) < 0 ? 'round' : S.view;
  var skinRows = '';
  for (var i = 0; i < VIEWS.length; i++) {
    var v = VIEWS[i];
    skinRows += '<button class="settings-row"' + actionAttrs('setClockView', [v]) + '>' +
      '<span><b>' + (VIEW_NAMES[v] || v) + '</b></span>' +
      '<em>' + (v === cur ? '当前' : '') + '</em></button>';
  }
  var start = Number(S.smokeStart) > 0 ? S.smokeStart : 0;
  var count = Math.max(0, Math.floor(Number(S.smokeCount) || 0));
  var smokeSummary = start > 0 ?
    '自 ' + quitRecordDate(start) + ' 起 · 共 ' + count + ' 根' : '尚未开始';
  openSheet(
    '<h3>戒烟设置</h3>' +
    '<p>换一种倒计时的样子，或者调整开始时间。</p>' +
    '<div class="settings-group"><div class="settings-group-title">时间皮肤</div>' + skinRows + '</div>' +
    '<div class="settings-group"><div class="settings-group-title">计时</div>' +
    '<button class="settings-row" data-action="openSetQuitDate">' +
      '<span><b>设置戒烟起始时间</b><small>仅用于修正倒计时起点，不影响其他数据</small></span><em>设置 ›</em></button>' +
    '</div>' +
    '<div class="settings-group"><div class="settings-group-title">抽烟统计</div>' +
    '<div class="settings-row"><span><b>当前统计</b><small>' + smokeSummary + '</small></span></div>' +
    '<button class="settings-row" data-action="openSetSmokeStart">' +
      '<span><b>设置统计起点</b><small>从这一时刻开始计时，破戒不动起点</small></span><em>设置 ›</em></button>' +
    '<button class="settings-row" data-action="openSetSmokeCount">' +
      '<span><b>调整抽烟根数</b><small>破戒自动 +1，也可手动补改</small></span><em>设置 ›</em></button>' +
    '<button class="settings-row" data-action="resetSmokeRecord">' +
      '<span><b>重置本次统计</b><small>清空起点与根数，戒烟不受影响</small></span><em>重置 ›</em></button>' +
    '</div>' +
    '<div class="row"><button class="ghost" style="flex:1"' + actionAttrs('closeSheet') + '>关闭</button></div>'
  );
}

function setClockView(v){
  setView(v);
  closeSheet();
  toast('已切换为「' + (VIEW_NAMES[v] || v) + '」');
}

function openSetQuitDate(){
  openSheet(
    '<h3>设置戒烟起始时间</h3>' +
    '<p>仅用于修正倒计时起点，不会影响其他数据。</p>' +
    '<label class="fld">开始时间<input type="datetime-local" id="set-date" value="' + toLocalInput(S.quitDate) + '"></label>' +
    '<div class="row"><button class="ghost"' + actionAttrs('closeSheet') + '>取消</button>' +
    '<button class="primary"' + actionAttrs('saveSetDate') + '>保存</button></div>'
  );
}

function toLocalInput(ms){
  var d = new Date(ms);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
    'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
function saveSetDate(){
  var v = byId('set-date').value;
  if (!v) { toast('请选择时间'); return; }
  var t = new Date(v).getTime();
  if (!(t > 0) || t > Date.now()) { toast('时间不能晚于现在'); return; }
  S.quitDate = t;
  saveS();
  closeSheet();
  lastStageIdx = -99;
  renderQuitPage();
  toast('已更新起始时间');
}

function openSetSmokeStart(){
  var start = Number(S.smokeStart) > 0 ? S.smokeStart : Date.now();
  openSheet(
    '<h3>设置统计起点</h3>' +
    '<p>从这一刻开始计时；破戒只会 +1 根，不会改动起点。</p>' +
    '<label class="fld">开始时间<input type="datetime-local" id="smoke-date" value="' + toLocalInput(start) + '"></label>' +
    '<div class="row"><button class="ghost"' + actionAttrs('closeSheet') + '>取消</button>' +
    '<button class="primary"' + actionAttrs('saveSetSmokeStart') + '>保存</button></div>'
  );
}

function saveSetSmokeStart(){
  var v = byId('smoke-date').value;
  if (!v) { toast('请选择时间'); return; }
  var t = new Date(v).getTime();
  if (!(t > 0) || t > Date.now()) { toast('时间不能晚于现在'); return; }
  S.smokeStart = t;
  saveS();
  closeSheet();
  renderQuitPage();
  fitClock();
  toast('已更新统计起点');
}

function openSetSmokeCount(){
  openSheet(
    '<h3>调整抽烟根数</h3>' +
    '<p>破戒会自动 +1；如果想补记以前抽的烟，也可以直接改。</p>' +
    '<label class="fld">根数<input type="number" id="smoke-count-input" min="0" step="1" inputmode="numeric" value="' + (Math.max(0, Math.floor(Number(S.smokeCount) || 0))) + '"></label>' +
    '<div class="row"><button class="ghost"' + actionAttrs('closeSheet') + '>取消</button>' +
    '<button class="primary"' + actionAttrs('saveSetSmokeCount') + '>保存</button></div>'
  );
}

function saveSetSmokeCount(){
  var v = parseInt(byId('smoke-count-input').value, 10);
  if (isNaN(v) || v < 0) { toast('请输入不小于 0 的整数'); return; }
  S.smokeCount = Math.min(999999, v);
  saveS();
  closeSheet();
  renderQuitPage();
  toast('已更新根数');
}

function resetSmokeRecord(){
  appConfirm(
    '会清空统计起点与抽烟根数，戒烟时间不受影响。',
    function(){
      S.smokeStart = 0;
      S.smokeCount = 0;
      saveS();
      renderQuitPage();
      toast('本次统计已重置');
    },
    { title: '重置抽烟统计', confirmLabel: '重置' }
  );
}

/* ============================================================
   6.1 首次启动引导
   ============================================================ */
function firstRunSheet(){
  openSheet(
    '<h3>你是什么时候开始戒烟的？</h3>' +
    '<p>设置一次即可，之后打开就在这里看时间。</p>' +
    '<div class="presets">' +
      '<button' + actionAttrs('setQuitNow') + '>就在刚刚</button>' +
      '<button' + actionAttrs('setQuitToday') + '>今天 0 点</button>' +
      '<button' + actionAttrs('setQuitDaysAgo', [7]) + '>7 天前</button>' +
      '<button' + actionAttrs('setQuitDaysAgo', [30]) + '>30 天前</button>' +
    '</div>' +
    '<label class="fld">自定义<input type="datetime-local" id="fr-date"></label>' +
    '<button class="primary" style="width:100%"' + actionAttrs('setQuitFromInput') + '>开始</button>',
    true
  );
}

function setQuitNow(){
  setQuit(Date.now());
}

function setQuitToday(){
  setQuit(startOfToday());
}

function setQuitDaysAgo(days){
  setQuit(Date.now() - Math.max(0, Number(days) || 0) * 86400000);
}
function startOfToday(){
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function setQuit(t){
  S.quitDate = t;
  saveS();
  sheetRequired = false;
  closeSheet();
  lastStageIdx = -99;
  renderQuitPage();
}
function setQuitFromInput(){
  var v = byId('fr-date').value;
  if (!v) { toast('请选择日期时间'); return; }
  var t = new Date(v).getTime();
  if (!(t > 0) || t > Date.now()) { toast('时间不能晚于现在'); return; }
  setQuit(t);
}
