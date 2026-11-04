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
  S.quitDate = Date.now();
  saveS();
  closeSheet();
  lastStageIdx = -99;
  renderQuit();
  toast('已重置，从现在重新开始');
}

byId('btn-set').addEventListener('click', function(){
  openSheet(
    '<h3>设置戒烟起始时间</h3>' +
    '<p>仅用于修正倒计时起点，不会影响其他数据。</p>' +
    '<label class="fld">开始时间<input type="datetime-local" id="set-date" value="' + toLocalInput(S.quitDate) + '"></label>' +
    '<div class="row"><button class="ghost"' + actionAttrs('closeSheet') + '>取消</button>' +
    '<button class="primary"' + actionAttrs('saveSetDate') + '>保存</button></div>'
  );
});

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
  renderQuit();
  toast('已更新起始时间');
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
  renderQuit();
}
function setQuitFromInput(){
  var v = byId('fr-date').value;
  if (!v) { toast('请选择日期时间'); return; }
  var t = new Date(v).getTime();
  if (!(t > 0) || t > Date.now()) { toast('时间不能晚于现在'); return; }
  setQuit(t);
}
