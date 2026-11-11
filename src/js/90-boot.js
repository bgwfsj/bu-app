/* ============================================================
   9. 启动
   ============================================================ */
function boot(){
  var ok = loadState();
  setView(S.view || 'round');
  if (flipLen === 0) buildFlip(2);
  var clkBox = byId('clocks');
  if (clkBox) {
    // 连点时间 5 下切换皮肤（共 5 种）
    var taps = 0, lastTap = 0, tapTimer = null;
    clkBox.addEventListener('click', function(){
      var now = Date.now();
      taps = (now - lastTap > 900) ? 1 : taps + 1;
      lastTap = now;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(function(){ taps = 0; }, 1200);
      if (taps >= 5) {
        taps = 0;
        clearTimeout(tapTimer);
        var cur = VIEWS.indexOf(S.view || 'round');
        var next = VIEWS[(cur + 1) % VIEWS.length];
        setView(next);
        toast(VIEW_NAMES[next] || next);
      }
    });
  }
  var curHead = byId('cur-t');
  if (curHead) curHead.addEventListener('click', function(ev){
    var t = ev.target;
    if (t && t.tagName === 'EM') {
      var box = byId('stages');
      if (box) box.open = !box.open;
    }
  });
  initFitness();
  renderQuit();
  initWater();
  initMeals();
  initAlcohol();
  initTodo();
  initReminder();
  initLedger();
  bindDragGestures();
  initHomeLayout();
  renderDashboard();

  setInterval(function(){
    paintLiveTimers();
    paintMealCountdown();
  }, 1000);
  // 跨天检查（喝水）
  setInterval(function(){
    if (wd && wd.currentDate !== wTodayStr()) initWater();
    if (fit && archiveOldWorkouts()) {
      saveWorkout();
      renderWorkoutHome();
    }
    if (todoData && page === 5) renderTodoPage();
    if (mealData && page === 3) renderMealPage();
    if (reminderData && page === 7) renderReminderPage();
    if (alcoholData && page === 8) renderAlcoholPage();
    checkTodoReminder();
  }, 30000);
}

function checkAppUpdate(){
  if (window.AppNative && window.AppNative.checkForUpdates) {
    window.AppNative.checkForUpdates();
    return;
  }
  toast('网页预览不能检查安装包更新');
}

(function(){
  // 便于测试：window.RESET_APP() 清空本 app 存档
  window.RESET_APP = function(){ localStorage.removeItem(AKEY); location.reload(); };
  window.doBreak = doBreak;
  window.closeSheet = closeSheet;
  window.setQuit = setQuit;
  window.setQuitFromInput = setQuitFromInput;
  window.startOfToday = startOfToday;
  window.saveSetDate = saveSetDate;
  window.saveWaterSettings = saveWaterSettings;
  window.fitClock = fitClock;
  window.handleBack = handleBackNavigation;
  window.paintLiveWorkout = paintLiveWorkout;
  window.paintLiveTimers = paintLiveTimers;
  window.applyConfirmedReminders = applyConfirmedReminders;
  window.refreshVisitStats = renderVisitStats;
  window.exportUpdateBackup = exportAppBackup;
  boot();
})();
