/* ============================================================
   7. 页面切换
   ============================================================ */
var FUNCTION_PAGE_SEQUENCE = [1, 2, 3, 4, 5, 6, 8, 7];

function goPage(i){
  settingsOpen = false;
  ledgerSettingsOpen = false;
  page = i < 0 ? 0 : (i > 8 ? 8 : i);
  var pages = ['home', 'fitness', 'water', 'meals', 'quit', 'todo', 'ledger', 'reminder', 'alcohol'];
  document.body.dataset.page = pages[page];
  var sections = ['p-home', 'p-fitness', 'p-water', 'p-meals', 'p-quit', 'p-todo', 'p-ledger', 'p-reminder', 'p-alcohol'];
  each(sections, function(id, index){
    var section = byId(id);
    if (!section) return;
    section.classList.toggle('on', index === page);
    section.setAttribute('aria-hidden', index === page ? 'false' : 'true');
  });
  each(byId('page-pager').querySelectorAll('button'), function(btn){
    btn.classList.toggle('on', parseInt(btn.getAttribute('data-page-index'), 10) === page);
  });
  var settings = byId('p-settings');
  if (settings) {
    settings.classList.remove('on');
    settings.setAttribute('aria-hidden', 'true');
  }
  var ledgerSettings = byId('p-ledger-settings');
  if (ledgerSettings) {
    ledgerSettings.classList.remove('on');
    ledgerSettings.setAttribute('aria-hidden', 'true');
  }
  if (page === 4 && !S.quitDate && !sheetRequired) firstRunSheet();
  if (page === 1) ensureWorkoutTicker();
  if (page === 3) renderMealPage();
  if (page === 6) renderLedgerPage();
  if (page === 7 && reminderData) renderReminderPage();
  if (page === 8) {
    var alcoholTodayRecords = byId('alcohol-today-records');
    if (alcoholTodayRecords) alcoholTodayRecords.open = false;
    renderAlcoholPage();
  }
  if (page === 0) renderDashboard();
}

function openSettingsPage(){
  goPage(0);
  settingsOpen = true;
  document.body.dataset.page = 'settings';
  var home = byId('p-home');
  if (home) {
    home.classList.remove('on');
    home.setAttribute('aria-hidden', 'true');
  }
  var settings = byId('p-settings');
  if (settings) {
    settings.classList.add('on');
    settings.setAttribute('aria-hidden', 'false');
  }
}

function closeSettingsPage(){
  settingsOpen = false;
  goPage(0);
}

function openLedgerSettingsPage(){
  ledgerSettingsOpen = true;
  document.body.dataset.page = 'ledger-settings';
  var ledger = byId('p-ledger');
  if (ledger) {
    ledger.classList.remove('on');
    ledger.setAttribute('aria-hidden', 'true');
  }
  var settings = byId('p-ledger-settings');
  if (settings) {
    settings.classList.add('on');
    settings.setAttribute('aria-hidden', 'false');
  }
  refreshLedgerSettingsView();
}

function closeLedgerSettingsPage(){
  ledgerSettingsOpen = false;
  goPage(6);
}

function handleBackNavigation(){
  var sheet = byId('sheet');
  if (sheet && sheet.classList.contains('on')) {
    if (!sheetRequired) closeSheet();
    return true;
  }
  if (settingsOpen) {
    closeSettingsPage();
    return true;
  }
  if (ledgerSettingsOpen) {
    closeLedgerSettingsPage();
    return true;
  }
  if (page > 0) {
    goPage(0);
    return true;
  }
  return false;
}

function moveByHorizontalSwipe(dx){
  if (page === 0 || settingsOpen || ledgerSettingsOpen) {
    return;
  }
  moveByFunctionOrder(dx < 0 ? 1 : -1);
}

function moveByFunctionOrder(step){
  var index = FUNCTION_PAGE_SEQUENCE.indexOf(page);
  if (index < 0) return;
  var next = (index + step + FUNCTION_PAGE_SEQUENCE.length) % FUNCTION_PAGE_SEQUENCE.length;
  goPage(FUNCTION_PAGE_SEQUENCE[next]);
}

function targetOwnsHorizontalGesture(target){
  return !!(target && target.closest &&
    target.closest('[data-drag-kind][data-drag-state][data-drag-id]'));
}

// 左右滑动切换（竖向滚动优先）
(function(){
  var sx = 0, sy = 0, tracking = false;
  var el = byId('app');
  el.addEventListener('touchstart', function(e){
    if (e.touches.length !== 1 || targetOwnsHorizontalGesture(e.target)) {
      tracking = false;
      return;
    }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
  }, { passive: true });
  el.addEventListener('touchend', function(e){
    if (!tracking) return;
    tracking = false;
    var t = e.changedTouches[0];
    var dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 52 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      moveByHorizontalSwipe(dx);
    }
  }, { passive: true });
})();

document.addEventListener('keydown', function(e){
  if (settingsOpen || ledgerSettingsOpen) return;
  if (e.key === 'ArrowRight') {
    if (page === 0) goPage(1);
    else moveByFunctionOrder(1);
  }
  if (e.key === 'ArrowLeft' && page > 0) {
    moveByFunctionOrder(-1);
  }
});
document.addEventListener('visibilitychange', function(){
  if (!document.hidden && activeWorkout()) {
    paintLiveWorkout();
    ensureWorkoutTicker();
  }
});
window.addEventListener('focus', function(){
  if (activeWorkout()) {
    paintLiveWorkout();
    ensureWorkoutTicker();
  }
});
