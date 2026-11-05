/* ============================================================
   7. 页面切换
   ============================================================ */
function goPage(i){
  settingsOpen = false;
  ledgerSettingsOpen = false;
  page = i < 0 ? 0 : (i > 6 ? 6 : i);
  var pages = ['home', 'fitness', 'water', 'quit', 'todo', 'ledger', 'reminder'];
  document.body.dataset.page = pages[page];
  var sections = ['p-home', 'p-fitness', 'p-water', 'p-quit', 'p-todo', 'p-ledger', 'p-reminder'];
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
  if (page === 3 && !S.quitDate && !sheetRequired) firstRunSheet();
  if (page === 1) ensureWorkoutTicker();
  if (page === 5) renderLedgerPage();
  if (page === 6 && reminderData) renderReminderPage();
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
  goPage(5);
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
  if (dx < 0) goPage(page === 6 ? 1 : page + 1);
  else goPage(page === 1 ? 6 : page - 1);
}

// 左右滑动切换（竖向滚动优先）
(function(){
  var sx = 0, sy = 0, tracking = false;
  var el = byId('app');
  el.addEventListener('touchstart', function(e){
    if (e.touches.length !== 1) { tracking = false; return; }
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
    else goPage(page === 6 ? 1 : page + 1);
  }
  if (e.key === 'ArrowLeft' && page > 0) {
    goPage(page === 1 ? 6 : page - 1);
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
