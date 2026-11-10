/* ============================================================
   7.2 首页与首页布局
   ============================================================ */
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
  if (mealData) {
    var todayMeals = mealRecordsForDate(new Date());
    var lastMeal = todayMeals.slice().sort(function(a, b){
      return String(b.createdAt).localeCompare(String(a.createdAt));
    })[0];
    setTxt('home-meal-copy', todayMeals.length ?
      '今天 ' + todayMeals.length + ' 顿 · 最近 ' + mealTypeMeta(lastMeal.type).name :
      '记录今天吃了什么');
  }
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
  renderVisitStats();
}

function renderHomeLayoutSettings(){
  var classic = byId('home-layout-classic-state');
  var honeycomb = byId('home-layout-honeycomb-state');
  var facet = byId('home-layout-facet-state');
  if (classic) classic.textContent = homeLayoutMode === 'classic' ? '使用中' : '切换 ›';
  if (honeycomb) honeycomb.textContent = homeLayoutMode === 'honeycomb' ? '使用中' : '切换 ›';
  if (facet) facet.textContent = homeLayoutMode === 'facet' ? '使用中' : '切换 ›';
}

function syncHomeLayoutGeometry(){
  var grid = document.querySelector('.home-grid');
  if (!grid) return;
  if (homeLayoutMode === 'honeycomb') {
    var width = grid.clientWidth || grid.getBoundingClientRect().width;
    if (width > 0) {
      grid.style.setProperty('--hex-size', (width * .4) + 'px');
      grid.style.setProperty('--hex-height', (width * .36) + 'px');
      grid.style.setProperty('--honeycomb-height', (width * 1.134) + 'px');
      grid.style.height = (width * 1.134) + 'px';
      width = grid.clientWidth || width;
      grid.style.setProperty('--hex-size', (width * .4) + 'px');
      grid.style.setProperty('--hex-height', (width * .36) + 'px');
      grid.style.setProperty('--honeycomb-height', (width * 1.134) + 'px');
      grid.style.height = (width * 1.134) + 'px';
    }
  } else {
    grid.style.removeProperty('--hex-size');
    grid.style.removeProperty('--hex-height');
    grid.style.removeProperty('--honeycomb-height');
    grid.style.removeProperty('height');
  }
}

function applyHomeLayout(mode){
  homeLayoutMode = mode === 'honeycomb' || mode === 'facet' ? mode : 'classic';
  var grid = document.querySelector('.home-grid');
  if (grid) grid.setAttribute('data-layout', homeLayoutMode);
  syncHomeLayoutGeometry();
  renderHomeLayoutSettings();
}

function setHomeLayout(mode){
  applyHomeLayout(mode);
  storeSet(HOME_LAYOUT_KEY, homeLayoutMode);
  toast(homeLayoutMode === 'honeycomb' ? '已切换为拼图布局' :
    homeLayoutMode === 'facet' ? '已切换为中心折面布局' : '已切换为经典布局');
}

function initHomeLayout(){
  var mode = storeGet(HOME_LAYOUT_KEY, 'classic');
  applyHomeLayout(mode);
  if (!homeLayoutResizeBound) {
    homeLayoutResizeBound = true;
    window.addEventListener('resize', syncHomeLayoutGeometry);
  }
}

var webVisitPreviewCounted = false;

function renderVisitStats(){
  var box = byId('home-visit-stats');
  if (!box) return;
  var total = 0, today = 0;
  if (window.AppNative && window.AppNative.getAppVisitStats) {
    try {
      var nativeStats = JSON.parse(window.AppNative.getAppVisitStats() || '{}');
      total = Math.max(0, Number(nativeStats.total) || 0);
      today = Math.max(0, Number(nativeStats.today) || 0);
    } catch (error) {
      box.hidden = true;
      return;
    }
  } else {
    var key = 'bu_preview_visit_stats_v1';
    var stats = storeGet(key, { total: 0, date: '', today: 0 });
    var todayKey = wTodayStr();
    if (!webVisitPreviewCounted) {
      if (stats.date !== todayKey) stats.today = 0;
      stats.total = (Number(stats.total) || 0) + 1;
      stats.today = (Number(stats.today) || 0) + 1;
      stats.date = todayKey;
      storeSet(key, stats);
      webVisitPreviewCounted = true;
    }
    total = Math.max(0, Number(stats.total) || 0);
    today = Math.max(0, Number(stats.today) || 0);
  }
  setTxt('home-visit-count', '此间相逢 ' + total.toLocaleString('zh-CN') +
    ' 次 · 今日 ' + today.toLocaleString('zh-CN') + ' 次');
  var copy = visitCopyFor(total, today);
  var copyBox = byId('home-visit-copy');
  if (copyBox) {
    copyBox.textContent = copy.text;
    copyBox.classList.toggle('special', !!copy.special);
  }
  box.hidden = false;
}
