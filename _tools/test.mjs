import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(root, 'quit-app.html');
const csvPath = path.join(root, '_local-data', '导出数据.csv');
const browserPath = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bu-app-test-'));

class Cdp {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.ws = new WebSocket(url);
  }

  async open() {
    await Promise.race([new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    }), new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('CDP websocket open timeout')), 5000);
    })]);
    const onMessage = raw => {
      if (process.env.BU_TEST_DEBUG) console.error('CDP <-', raw.slice(0, 240));
      const message = JSON.parse(raw);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    };
    this.ws.addEventListener('message', event => {
      const raw = event.data;
      if (typeof raw === 'string') onMessage(raw);
      else if (typeof raw.text === 'function') raw.text().then(onMessage);
      else onMessage(Buffer.from(raw).toString('utf8'));
    });
    this.ws.addEventListener('close', () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error('CDP connection closed'));
      }
      this.pending.clear();
    });
  }

  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 10000);
      this.pending.set(id, {
        resolve(value) {
          clearTimeout(timer);
          resolve(value);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        }
      });
      this.ws.send(JSON.stringify({ id, method, params }));
      if (process.env.BU_TEST_DEBUG) console.error('CDP ->', id, method);
    });
  }

  close() {
    this.ws.close();
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForApp(cdp) {
  for (let i = 0; i < 80; i++) {
    try {
      const result = await cdp.call('Runtime.evaluate', {
        expression: "document.readyState === 'complete' && typeof window.goPage === 'function'",
        returnByValue: true
      });
      if (result.result.value === true) return;
    } catch {}
    await delay(100);
  }
  throw new Error('App did not finish loading');
}

async function evaluate(cdp, expression) {
  const result = await cdp.call('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

function startBrowser() {
  const appUrl = pathToFileURL(appPath).href;
  const child = spawn(browserPath, [
    '--headless=new',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--allow-file-access-from-files',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    appUrl
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  return new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`Browser did not start:\n${stderr}`)), 15000);
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (!match) return;
      clearTimeout(timer);
      resolve({ child, port: Number(match[1]) });
    });
    child.once('error', reject);
    child.once('exit', code => {
      if (stderr.includes('DevTools listening on')) return;
      clearTimeout(timer);
      reject(new Error(`Browser exited before DevTools was ready (code ${code}):\n${stderr}`));
    });
  });
}

async function pageSocket(port) {
  for (let i = 0; i < 80; i++) {
    const tabs = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(1000)
    }).then(r => r.json()).catch(() => []);
    const tab = tabs.find(item => item.type === 'page' && item.url.startsWith('file:'));
    if (tab) return tab.webSocketDebuggerUrl;
    await delay(100);
  }
  throw new Error('Could not find app page');
}

function staticChecks() {
  const html = fs.readFileSync(appPath, 'utf8');
  assert.equal(html.includes('__APP_STYLES__'), false, 'style placeholder remains');
  assert.equal(html.includes('__APP_SCRIPTS__'), false, 'script placeholder remains');
  assert.doesNotMatch(html, /\son(?:click|change|input|submit)=/i, 'inline event handler remains');
  assert.doesNotMatch(html, /<script\s+[^>]*src=/i, 'external script found');
  assert.doesNotMatch(html, /<link\s+[^>]*href=/i, 'external stylesheet found');
}

async function run() {
  staticChecks();
  console.log('Starting headless browser...');
  const { child, port } = await startBrowser();
  let cdp;
  try {
    cdp = new Cdp(await pageSocket(port));
    console.log('Connecting to app...');
    await cdp.open();
    await delay(150);
    await waitForApp(cdp);
    await delay(150);
    console.log('Running regression checks...');

    await evaluate(cdp, 'localStorage.clear(); true');
    await cdp.call('Page.reload', { ignoreCache: true });
    await waitForApp(cdp);
    await delay(300);

    if (process.env.BU_TEST_DEBUG) {
      const dom = await evaluate(cdp, `['p-home','p-fitness','p-water','p-meals','p-quit','p-todo','p-reminder','p-ledger'].map(function(id){
        var el = document.getElementById(id);
        return { id: id, found: !!el, tag: el && el.tagName, classList: !!(el && el.classList), className: el && el.className };
      })`);
      console.error('DOM', JSON.stringify(dom));
      const loopDiag = await evaluate(cdp, `(function(){
        var out = [];
        each(['p-home'], function(id, index){
          var section = byId(id);
          out.push({
            id: id,
            type: typeof section,
            tag: section && section.tagName,
            classListType: section && typeof section.classList,
            toggleType: section && section.classList && typeof section.classList.toggle
          });
        });
        return out;
      })()`);
      console.error('LOOP', JSON.stringify(loopDiag));
    }

    const navigation = await evaluate(cdp, `(function(){
      goPage(0);
      moveByHorizontalSwipe(-1);
      var homeLocked = page === 0;
      goPage(7);
      moveByHorizontalSwipe(-1);
      var wrappedForward = page === 1;
      goPage(1);
      moveByHorizontalSwipe(1);
      var wrappedBackward = page === 7;
      goPage(5);
      moveByHorizontalSwipe(-1);
      var todoNext = page === 6 &&
        byId('page-pager').querySelector('button.on').textContent.trim() === '账';
      moveByHorizontalSwipe(-1);
      var ledgerNext = page === 7 &&
        byId('page-pager').querySelector('button.on').textContent.trim() === '醒';
      var pagerLabels = Array.prototype.map.call(
        byId('page-pager').querySelectorAll('button'),
        function(btn){ return btn.textContent.trim(); }
      );
      S.quitDate = Date.now() - 3600000;
      saveS();
      renderQuit();
      goPage(4);
      var breakRect = byId('btn-break').getBoundingClientRect();
      var quitRecordRect = byId('quit-record').getBoundingClientRect();
      var pagerRect = byId('page-pager').getBoundingClientRect();
      var controlsSeparate = breakRect.bottom < pagerRect.top;
      var quitRecordBesideBreak = quitRecordRect.width > 0 &&
        quitRecordRect.right <= breakRect.left + 1;
      var activeQuickLabel = byId('page-pager').querySelector('button.on').textContent.trim();
      var homeFootnoteRemoved = !document.querySelector('.home-footnote');
      var dragTarget = document.createElement('span');
      var dragRow = document.createElement('div');
      dragRow.setAttribute('data-drag-kind', 'todo');
      dragRow.setAttribute('data-drag-state', 'active');
      dragRow.setAttribute('data-drag-id', 'gesture-test');
      dragRow.appendChild(dragTarget);
      goPage(5);
      var handledBack = handleBackNavigation() && page === 0;
      return {
        homeLocked: homeLocked,
        wrappedForward: wrappedForward,
        wrappedBackward: wrappedBackward,
        todoNext: todoNext,
        ledgerNext: ledgerNext,
        handledBack: handledBack,
        pagerLabels: pagerLabels,
        controlsSeparate: controlsSeparate,
        quitRecordBesideBreak: quitRecordBesideBreak,
        activeQuickLabel: activeQuickLabel,
        homeFootnoteRemoved: homeFootnoteRemoved,
        dragOwnsHorizontalGesture: targetOwnsHorizontalGesture(dragTarget),
        plainOwnsHorizontalGesture: targetOwnsHorizontalGesture(document.body)
      };
    })()`);
    assert.deepEqual(navigation, {
      homeLocked: true,
      wrappedForward: true,
      wrappedBackward: true,
      todoNext: true,
      ledgerNext: true,
      handledBack: true,
      pagerLabels: ['练', '水', '饭', '戒', '记', '账', '醒'],
      controlsSeparate: true,
      quitRecordBesideBreak: true,
      activeQuickLabel: '戒',
      homeFootnoteRemoved: true,
      dragOwnsHorizontalGesture: true,
      plainOwnsHorizontalGesture: false
    });

    const meals = await evaluate(cdp, `(function(){
      goPage(3);
      var active = byId('p-meals').classList.contains('on') &&
        document.body.dataset.page === 'meals';
      var pagerLabel = byId('page-pager').querySelector('button.on').textContent.trim();
      var classifications = {
        breakfast: mealTypeForDate(new Date(2026, 10, 9, 6, 30)),
        lunch: mealTypeForDate(new Date(2026, 10, 9, 11, 30)),
        tea: mealTypeForDate(new Date(2026, 10, 9, 15, 10)),
        dinner: mealTypeForDate(new Date(2026, 10, 9, 19, 0)),
        late: mealTypeForDate(new Date(2026, 10, 9, 23, 10))
      };
      var regularWindows = {
        breakfastStart: mealIsRegular('breakfast', new Date(2026, 10, 9, 6, 30)),
        breakfastEnd: mealIsRegular('breakfast', new Date(2026, 10, 9, 9, 0)),
        breakfastLate: mealIsRegular('breakfast', new Date(2026, 10, 9, 9, 30)),
        lunchStart: mealIsRegular('lunch', new Date(2026, 10, 9, 11, 30)),
        lunchEnd: mealIsRegular('lunch', new Date(2026, 10, 9, 13, 0)),
        lunchLate: mealIsRegular('lunch', new Date(2026, 10, 9, 13, 10)),
        dinnerStart: mealIsRegular('dinner', new Date(2026, 10, 9, 17, 30)),
        dinnerEnd: mealIsRegular('dinner', new Date(2026, 10, 9, 19, 30)),
        dinnerLate: mealIsRegular('dinner', new Date(2026, 10, 9, 20, 0))
      };
      var nextLunch = mealNextTargetAt(new Date(2026, 10, 9, 10, 0), []);
      var nextBreakfast = mealNextTargetAt(new Date(2026, 10, 9, 19, 0), [{
        date: '2026-11-09', type: 'dinner'
      }]);
      var now = new Date();
      var todayAt = function(hour, minute){
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
      };
      recordMealAt(todayAt(12, 5));
      var sheetTitle = byId('sheet').querySelector('h3').textContent.trim();
      var hasEvaluation = byId('sheet').querySelectorAll('.meal-feedback-state').length === 1;
      var hasTip = byId('sheet').querySelectorAll('.meal-tip-card').length === 1;
      var gapMentioned = byId('sheet').querySelector('.meal-feedback-detail').textContent.indexOf('更早的用餐记录') >= 0;
      closeSheet();
      recordMealAt(todayAt(15, 10));
      closeSheet();
      recordMealAt(todayAt(23, 10));
      closeSheet();
      var intervalGood = mealMomentReview('lunch', todayAt(11, 30), {
        createdAt: todayAt(8, 0).toISOString()
      });
      var intervalShort = mealMomentReview('lunch', todayAt(11, 30), {
        createdAt: todayAt(10, 45).toISOString()
      });
      var backfillDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      openMealBackfill();
      byId('meal-backfill-date').value = mealDateKey(backfillDay);
      byId('meal-backfill-time').value = '18:00';
      saveMealBackfill();
      var backfillTitle = byId('sheet').querySelector('h3').textContent.trim();
      closeSheet();
      var stored = JSON.parse(localStorage.getItem('meals_app_v1'));
      var rowCount = byId('meal-list').querySelectorAll('.meal-entry').length;
      var typeStripCount = byId('meal-type-strip').querySelectorAll('.meal-type-chip').length;
      var extraBox = byId('meal-extra-box');
      var extraCount = byId('meal-extra-list').querySelectorAll('.meal-entry').length;
      var deleteButton = !!byId('meal-list').querySelector('[data-action="deleteMealRecord"]');
      var homeCopy = byId('home-meal-copy').textContent.trim();
      var timerText = byId('meal-next-timer').textContent.trim();
      var todayGrade = mealDayGrade(todayAt(12, 0));
      mealCalendarOffset = 0;
      renderMealCalendar();
      var todayCell = byId('meal-calendar-grid').querySelector('.meal-cal-day.today');
      var calendarRedX = !!todayCell.querySelector('.meal-cal-status.red') &&
        !todayCell.querySelector('.meal-cal-status.none');
      var calendarLateDot = !!todayCell.querySelector('.meal-cal-late');
      var savedRecords = mealData.records.slice();
      var fake = function(type, regular, date){
        return { type: type, regular: regular, date: date, createdAt: date + 'T12:00:00.000Z' };
      };
      mealData.records = [fake('breakfast', true, '2026-11-01'), fake('lunch', true, '2026-11-01'), fake('dinner', true, '2026-11-01')];
      var gradeGreen = mealDayGrade(new Date(2026, 10, 1)).grade;
      mealData.records = [fake('breakfast', true, '2026-11-02'), fake('lunch', true, '2026-11-02'), fake('dinner', false, '2026-11-02')];
      var gradeYellow = mealDayGrade(new Date(2026, 10, 2)).grade;
      mealData.records = [fake('breakfast', false, '2026-11-03'), fake('tea', false, '2026-11-03')];
      var gradeNone = mealDayGrade(new Date(2026, 10, 3)).grade;
      mealData.records = savedRecords;
      goPage(0);
      var homeCards = Array.prototype.map.call(document.querySelector('.home-grid').querySelectorAll('.home-card'), function(card){
        return Math.round(card.getBoundingClientRect().height);
      });
      var allHomeCardsEqual = new Set(homeCards).size === 1;
      return {
        active: active,
        pagerLabel: pagerLabel,
        classifications: classifications,
        regularWindows: regularWindows,
        nextLunchType: nextLunch.type,
        nextLunchRemain: nextLunch.target.getTime() - new Date(2026, 10, 9, 10, 0).getTime(),
        nextBreakfastTomorrow: nextBreakfast.tomorrow && nextBreakfast.type === 'breakfast',
        sheetTitle: sheetTitle,
        hasEvaluation: hasEvaluation,
        hasTip: hasTip,
        gapMentioned: gapMentioned,
        intervalGoodGap: intervalGood.gapMinutes,
        intervalGoodTitle: intervalGood.title,
        intervalShortGap: intervalShort.gapMinutes,
        intervalShortTitle: intervalShort.title,
        backfillTitle: backfillTitle,
        storedRecords: stored.records.length,
        rowCount: rowCount,
        typeStripCount: typeStripCount,
        extraBoxHidden: extraBox.hidden,
        extraBoxOpen: extraBox.open,
        extraCount: extraCount,
        deleteButton: deleteButton,
        homeCopy: homeCopy,
        timerText: timerText,
        todayGrade: todayGrade.grade,
        todayLate: todayGrade.late,
        calendarRedX: calendarRedX,
        calendarLateDot: calendarLateDot,
        gradeGreen: gradeGreen,
        gradeYellow: gradeYellow,
        gradeNone: gradeNone,
        allHomeCardsEqual: allHomeCardsEqual
      };
    })()`);
    assert.equal(meals.active, true);
    assert.equal(meals.pagerLabel, '饭');
    assert.deepEqual(meals.classifications, {
      breakfast: 'breakfast',
      lunch: 'lunch',
      tea: 'tea',
      dinner: 'dinner',
      late: 'late'
    });
    assert.deepEqual(meals.regularWindows, {
      breakfastStart: true,
      breakfastEnd: true,
      breakfastLate: false,
      lunchStart: true,
      lunchEnd: true,
      lunchLate: false,
      dinnerStart: true,
      dinnerEnd: true,
      dinnerLate: false
    });
    assert.equal(meals.nextLunchType, 'lunch');
    assert.equal(meals.nextLunchRemain, 1.5 * 3600000);
    assert.equal(meals.nextBreakfastTomorrow, true);
    assert.equal(meals.sheetTitle, '午餐 · 12:05');
    assert.equal(meals.hasEvaluation, true);
    assert.equal(meals.hasTip, true);
    assert.equal(meals.gapMentioned, true);
    assert.equal(meals.intervalGoodGap, 210);
    assert.equal(meals.intervalGoodTitle, '吃得规律');
    assert.equal(meals.intervalShortGap, 45);
    assert.equal(meals.intervalShortTitle, '时间刚好，间隔略近');
    assert.equal(meals.backfillTitle, '补记 · 晚餐 · 18:00');
    assert.equal(meals.storedRecords, 4);
    assert.equal(meals.rowCount, 1);
    assert.equal(meals.typeStripCount, 3);
    assert.equal(meals.extraBoxHidden, false);
    assert.equal(meals.extraBoxOpen, false);
    assert.equal(meals.extraCount, 2);
    assert.equal(meals.deleteButton, true);
    assert.equal(meals.homeCopy, '今天 3 顿 · 最近 夜宵');
    assert.match(meals.timerText, /^\d{2}:\d{2}:\d{2}$/);
    assert.equal(meals.todayGrade, 'red');
    assert.equal(meals.todayLate, true);
    assert.equal(meals.calendarRedX, true);
    assert.equal(meals.calendarLateDot, true);
    assert.equal(meals.gradeGreen, 'green');
    assert.equal(meals.gradeYellow, 'yellow');
    assert.equal(meals.gradeNone, 'none');
    assert.equal(meals.allHomeCardsEqual, true);

    const settingsPage = await evaluate(cdp, `(function(){
      var originalNative = window.AppNative;
      var calls = 0;
      var cleanupCalls = 0;
      window.AppNative = {
        checkForUpdates: function(){ calls++; },
        cleanupOldBackups: function(keep){ cleanupCalls++; return keep === 2 ? 2 : -1; }
      };
      byId('btn-app-settings').click();
      var opened = byId('p-settings').classList.contains('on') &&
        document.body.dataset.page === 'settings';
      var dataActions = byId('p-settings').querySelectorAll('[data-action="exportAppBackup"], [data-action="chooseAppBackup"]').length;
      var cleanupButton = byId('p-settings').querySelector('[data-action="requestCleanupOldBackups"]');
      cleanupButton.click();
      var cleanupConfirmOpened = byId('sheet').classList.contains('on');
      document.querySelector('[data-action="resolveAppConfirm"][data-args="[true]"]').click();
      byId('p-settings').querySelector('[data-action="openAboutSheet"]').click();
      var aboutOpened = byId('sheet').classList.contains('on');
      var changelogCount = byId('sheet').querySelectorAll('.changelog-entry').length;
      var aboutVersion = byId('sheet').querySelector('.about-current b').textContent.trim();
      var updateBackupExposed = typeof window.exportUpdateBackup === 'function';
      closeSheet();
      byId('p-settings').querySelector('[data-action="checkAppUpdate"]').click();
      var handledBack = handleBackNavigation();
      var returnedHome = !settingsOpen && page === 0 && byId('p-home').classList.contains('on');
      window.AppNative = originalNative;
      return {
        opened: opened,
        dataActions: dataActions,
        cleanupButton: !!cleanupButton,
        cleanupConfirmOpened: cleanupConfirmOpened,
        cleanupCalls: cleanupCalls,
        aboutOpened: aboutOpened,
        changelogCount: changelogCount,
        aboutVersion: aboutVersion,
        updateBackupExposed: updateBackupExposed,
        updateCalls: calls,
        handledBack: handledBack,
        returnedHome: returnedHome
      };
    })()`);
    assert.deepEqual(settingsPage, {
      opened: true,
      dataActions: 2,
      cleanupButton: true,
      cleanupConfirmOpened: true,
      cleanupCalls: 1,
      aboutOpened: true,
      changelogCount: 53,
      aboutVersion: '5.9.14',
      updateBackupExposed: true,
      updateCalls: 1,
      handledBack: true,
      returnedHome: true
    });

    const visitStats = await evaluate(cdp, `(function(){
      var originalNative = window.AppNative;
      window.AppNative = {
        getAppVisitStats: function(){ return '{"total":128,"today":3}'; }
      };
      renderVisitStats();
      var text = byId('home-visit-count').textContent.trim();
      var copyText = byId('home-visit-copy').textContent.trim();
      var copySpecial = byId('home-visit-copy').classList.contains('special');
      var visible = !byId('home-visit-stats').hidden;
      window.AppNative = {
        getAppVisitStats: function(){ return '{"total":1000,"today":3}'; }
      };
      renderVisitStats();
      var specialText = byId('home-visit-copy').textContent.trim();
      var specialClass = byId('home-visit-copy').classList.contains('special');
      window.AppNative = originalNative;
      renderVisitStats();
      return {
        text: text,
        copyText: copyText,
        copySpecial: copySpecial,
        specialText: specialText,
        specialClass: specialClass,
        yBankSize: Object.keys(VISIT_Y_COPY).length,
        yAllFive: Object.keys(VISIT_Y_COPY).every(function(key){
          return VISIT_Y_COPY[key].length === 5;
        }),
        visible: visible,
        previewVisible: !byId('home-visit-stats').hidden,
        previewHasText: byId('home-visit-count').textContent.indexOf('此间相逢 ') === 0
      };
    })()`);
    assert.equal(visitStats.text, '此间相逢 128 次 · 今日 3 次');
    assert.ok(visitStats.copyText.length > 0);
    assert.equal(visitStats.copySpecial, false);
    assert.ok(visitStats.specialText.indexOf('一千不是尽头') >= 0);
    assert.equal(visitStats.specialClass, true);
    assert.equal(visitStats.yBankSize, 20);
    assert.equal(visitStats.yAllFive, true);
    assert.equal(visitStats.visible, true);
    assert.equal(visitStats.previewVisible, true);
    assert.equal(visitStats.previewHasText, true);

    const quitRecord = await evaluate(cdp, `(function(){
      var original = JSON.parse(JSON.stringify(S));
      var now = Date.now();
      S.quitDate = now - 5 * 86400000;
      S.quitHistory = [{
        startedAt: now - 30 * 86400000,
        endedAt: now - 20 * 86400000,
        durationMs: 10 * 86400000
      }];
      renderQuit();
      var historical = byId('quit-record').textContent;
      S.quitHistory = [{
        startedAt: now - 10 * 86400000,
        endedAt: now - 8 * 86400000,
        durationMs: 2 * 86400000
      }];
      renderQuit();
      var currentLongest = byId('quit-record').textContent;
      S.quitHistory = [];
      renderQuit();
      var firstJourney = byId('quit-record').textContent;
      S = original;
      saveS();
      renderQuit();
      return {
        historical: historical,
        currentLongest: currentLongest,
        firstJourney: firstJourney
      };
    })()`);
    assert.ok(quitRecord.historical.indexOf('最久 10 天') >= 0);
    assert.ok(quitRecord.historical.indexOf('上次破戒') < 0);
    assert.ok(/\d{4}\.\d{2}\.\d{2}/.test(quitRecord.historical));
    assert.ok(quitRecord.currentLongest.indexOf('你第一次走这么远') >= 0);
    assert.ok(quitRecord.firstJourney.indexOf('你第一次走这么远') >= 0);

    const workout = await evaluate(cdp, `(function(){
      startWorkoutFromPlan('plan_default');
      var active = activeWorkout();
      if (!active) return { error: 'workout did not start' };
      active.startAt = Date.now() - 5000;
      ['back', 'chest', 'legs'].forEach(function(id){
        for (var i = 0; i < 4; i++) completeWorkoutSet(id);
      });
      ['run', 'hill'].forEach(function(id){
        startTimedExercise(id);
        completeTimedExercise(id);
      });
      var last = fit.sessions[fit.sessions.length - 1];
      openWorkoutPlan();
      var planList = byId('plan-list');
      var planRows = planList ? planList.querySelectorAll('.plan-row') : [];
      var planNames = Array.prototype.map.call(planRows, function(row){
        return row.querySelector('.plan-name').textContent.trim();
      });
      var planListHeight = planList ? planList.getBoundingClientRect().height : 0;
      closeSheet();
      return {
        activeEnded: fit.activeSessionId === null,
        ended: !!last.endAt,
        setCount: last.sets.filter(function(r){ return r.kind === 'set'; }).length,
        durationCount: last.sets.filter(function(r){ return r.kind === 'duration'; }).length,
        elapsedRecorded: last.sets.every(function(r){ return r.elapsed > 0; }),
        stored: !!JSON.parse(localStorage.getItem('fitness_app_v1')).sessions.length,
        planRows: planRows.length,
        planNames: planNames,
        planListHeight: planListHeight
      };
    })()`);
    assert.equal(workout.error, undefined);
    assert.equal(workout.activeEnded, true);
    assert.equal(workout.ended, true);
    assert.equal(workout.setCount, 12);
    assert.equal(workout.durationCount, 2);
    assert.equal(workout.elapsedRecorded, true);
    assert.equal(workout.stored, true);
    assert.ok(workout.planRows >= 5);
    assert.ok(workout.planListHeight > 0);
    assert.ok(workout.planNames.some(function(name){ return name.indexOf('背') === 0; }));

    const calendarDots = await evaluate(cdp, `(function(){
      var sample = document.createElement('button');
      sample.className = 'fit-day trained cheat today';
      sample.textContent = '1';
      byId('cal-grid').appendChild(sample);
      var box = getComputedStyle(sample);
      var blue = getComputedStyle(sample, '::before');
      var yellow = getComputedStyle(sample, '::after');
      var result = {
        transparent: box.backgroundColor === 'rgba(0, 0, 0, 0)',
        todayBorder: box.borderTopColor,
        blueDot: blue.backgroundColor,
        yellowDot: yellow.backgroundColor
      };
      sample.remove();
      return result;
    })()`);
    assert.equal(calendarDots.transparent, true);
    assert.equal(calendarDots.blueDot, 'rgb(95, 158, 199)');
    assert.equal(calendarDots.yellowDot, 'rgb(226, 179, 75)');
    assert.notEqual(calendarDots.todayBorder, 'rgba(0, 0, 0, 0)');

    const todo = await evaluate(cdp, `(function(){
      var today = wTodayStr();
      var yesterday = new Date(Date.now() - 86400000);
      var tomorrow = new Date(Date.now() + 86400000);
      var overdueDate = yesterday.getFullYear() + '-' + pad2(yesterday.getMonth() + 1) + '-' + pad2(yesterday.getDate());
      var futureDate = tomorrow.getFullYear() + '-' + pad2(tomorrow.getMonth() + 1) + '-' + pad2(tomorrow.getDate());
      todoData.items = [
        { id: 'overdue', title: '逾期一次', repeat: 'once', date: overdueDate, createdDate: overdueDate, done: false, doneDates: {} },
        { id: 'pastDone', title: '昨天完成', repeat: 'once', date: overdueDate, createdDate: overdueDate, done: true, doneDates: {} },
        { id: 'expiredCustom', title: '结束的自定义', repeat: 'custom', dates: [overdueDate], createdDate: overdueDate, done: false, doneDates: {} },
        { id: 'futureOnce', title: '未来一次', repeat: 'once', date: futureDate, createdDate: today, done: false, doneDates: {} },
        { id: 'daily', title: '每天一次', repeat: 'daily', createdDate: overdueDate, done: false, doneDates: {} }
      ];
      saveTodoState();
      var before = todosForDate(today).map(function(item){ return item.id; }).sort();
      toggleTodo('daily');
      var after = todosForDate(today).map(function(item){ return item.id; }).sort();
      var completedToday = todosForDate(today).some(function(item){
        return item.id === 'daily' && todoIsDone(item, today);
      });
      renderTodoPage();
      var initialArchived = todoArchivedItems().map(function(item){ return item.id; }).sort();
      restoreTodo('overdue');
      var restored = todoData.items.some(function(item){ return item.id === 'overdue' && item.date === today; });
      permanentDeleteTodo('pastDone');
      document.querySelector('[data-action="resolveAppConfirm"][data-args="[true]"]').click();
      var permanentRemoved = !todoData.archived.some(function(item){ return item.id === 'pastDone'; });
      deleteTodo('overdue');
      document.querySelector('[data-action="resolveAppConfirm"][data-args="[true]"]').click();
      byId('btn-todo-menu').click();
      var todoMenuOpened = byId('sheet').classList.contains('on') &&
        !!byId('sheet').querySelector('[data-action="openReminderSettings"]');
      var todoBottomReminderRemoved = !byId('p-todo').querySelector('.todo-reminder');
      closeSheet();
      return {
        before: before,
        after: after,
        completedToday: completedToday,
        archived: initialArchived,
        restored: restored,
        permanentRemoved: permanentRemoved,
        finalArchived: todoArchivedItems().map(function(item){ return item.id; }).sort(),
        archiveCollapsed: byId('todo-archive-box').open === false,
        archiveCount: byId('todo-archive-count').textContent,
        todoMenuOpened: todoMenuOpened,
        todoBottomReminderRemoved: todoBottomReminderRemoved
      };
    })()`);
    assert.deepEqual(todo.before, ['daily']);
    assert.deepEqual(todo.after, ['daily']);
    assert.equal(todo.completedToday, true);
    assert.deepEqual(todo.archived, ['expiredCustom', 'overdue', 'pastDone']);
    assert.equal(todo.restored, true);
    assert.equal(todo.permanentRemoved, true);
    assert.deepEqual(todo.finalArchived, ['expiredCustom', 'overdue']);
    assert.equal(todo.archiveCollapsed, true);
    assert.equal(todo.archiveCount, '2 项');
    assert.equal(todo.todoMenuOpened, true);
    assert.equal(todo.todoBottomReminderRemoved, true);

    const todoEdit = await evaluate(cdp, `(function(){
      var today = wTodayStr();
      var beforeCount = todoData.items.length;
      var editButtonsRemoved = byId('todo-list').querySelectorAll('.todo-edit').length === 0;
      var clickableRows = byId('todo-list').querySelectorAll('.todo-item[data-action="editTodo"]').length;
      var archiveEditable = byId('todo-archive-list').querySelectorAll('[data-action="editTodo"]').length > 0;
      document.querySelector('.todo-item[data-action="editTodo"]').click();
      byId('todo-name').value = '每天一次（已编辑）';
      saveTodoItem();
      var edited = todoData.items.filter(function(item){ return item.id === 'daily'; })[0];
      return {
        count: todoData.items.length,
        beforeCount: beforeCount,
        title: edited && edited.title,
        completionPreserved: !!(edited && edited.doneDates && edited.doneDates[today]),
        sheetClosed: !byId('sheet').classList.contains('on'),
        editingCleared: editingTodoId === null,
        editButtonsRemoved: editButtonsRemoved,
        clickableRows: clickableRows,
        archiveEditable: archiveEditable
      };
    })()`);
    assert.equal(todoEdit.count, todoEdit.beforeCount);
    assert.equal(todoEdit.title, '每天一次（已编辑）');
    assert.equal(todoEdit.completionPreserved, true);
    assert.equal(todoEdit.sheetClosed, true);
    assert.equal(todoEdit.editingCleared, true);
    assert.equal(todoEdit.editButtonsRemoved, true);
    assert.ok(todoEdit.clickableRows > 0);
    assert.equal(todoEdit.archiveEditable, false);

    const reminders = await evaluate(cdp, `(function(){
      reminderData = reminderDefaultState();
      saveReminderState();
      function add(mode){
        openReminderForm();
        byId('reminder-title').value = '提醒-' + mode;
        setReminderMode(mode);
        byId('reminder-time').value = '09:37';
        if (mode === 'once') {
          var tomorrow = new Date(Date.now() + 86400000);
          byId('reminder-date').value = tomorrow.getFullYear() + '-' + pad2(tomorrow.getMonth() + 1) + '-' + pad2(tomorrow.getDate());
        }
        if (mode === 'weekly') setReminderWeekday(new Date().getDay());
        if (mode === 'monthly') byId('reminder-month-day').value = '15';
        if (mode === 'yearly') {
          byId('reminder-year-month').value = '10';
          refreshReminderYearDays();
          byId('reminder-year-day').value = '20';
        }
        saveReminder();
      }
      add('once');
      add('daily');
      add('weekly');
      add('monthly');
      add('yearly');
      var weekly = reminderData.items.filter(function(item){ return item.mode === 'weekly'; })[0];
      var reminderEditButtonsRemoved = byId('reminder-list').querySelectorAll('.reminder-edit').length === 0;
      var weeklyRow = byId('reminder-list').querySelector('[data-drag-id="' + weekly.id + '"]');
      weeklyRow.click();
      byId('reminder-title').value = '提醒-每周（已编辑）';
      saveReminder();
      var edited = reminderItemById(weekly.id);
      var dailyItem = reminderData.items.filter(function(item){ return item.mode === 'daily'; })[0];
      var rows = reminderSortedItems();
      byId('btn-reminder-menu').click();
      var reminderMenuOpened = byId('sheet').classList.contains('on') &&
        !!byId('sheet').querySelector('[data-action="toggleReminderHomeNotice"]');
      var reminderBottomSettingsRemoved = !byId('p-reminder').querySelector('.reminder-settings');
      closeSheet();
      var savedNoticeItems = reminderData.items.slice();
      var tomorrow = new Date(Date.now() + 86400000);
      var tomorrowText = tomorrow.getFullYear() + '-' + pad2(tomorrow.getMonth() + 1) + '-' + pad2(tomorrow.getDate());
      reminderData.homeNoticeDismissedDate = '';
      reminderData.items = [{
        id: 'future_notice', title: '明天提醒', mode: 'once', time: '09:00',
        date: tomorrowText, createdAt: new Date().toISOString()
      }];
      renderHomeNotice();
      var futureNoticeHidden = byId('home-notice').hidden;
      reminderData.items = [{
        id: 'due_notice', title: '已到点提醒', mode: 'daily', time: '00:00',
        createdAt: new Date().toISOString()
      }];
      renderHomeNotice();
      var homeNoticeVisible = !byId('home-notice').hidden;
      var dueKey = reminderOccurrenceKey(reminderData.items[0], new Date());
      reminderData.handledOccurrences[dueKey] = true;
      renderHomeNotice();
      var handledNoticeHidden = byId('home-notice').hidden;
      delete reminderData.handledOccurrences[dueKey];
      renderHomeNotice();
      document.querySelector('.home-notice-close').click();
      var dismissedToday = byId('home-notice').hidden &&
        reminderData.homeNoticeDismissedDate === wTodayStr();
      reminderData.homeNoticeDismissedDate = '2000-01-01';
      renderHomeNotice();
      var returnedNextCycle = !byId('home-notice').hidden;
      toggleReminderHomeNotice();
      var homeNoticeHidden = byId('home-notice').hidden;
      var savedOff = JSON.parse(localStorage.getItem(RKEY)).homeNoticeEnabled === false;
      toggleReminderHomeNotice();
      reminderData.items = savedNoticeItems;
      renderReminderPage();
      var yesterday = new Date(Date.now() - 86400000);
      reminderData.items.push({
        id: 'completed_once',
        title: '已经结束',
        mode: 'once',
        time: '08:00',
        date: yesterday.getFullYear() + '-' + pad2(yesterday.getMonth() + 1) + '-' + pad2(yesterday.getDate()),
        createdAt: new Date().toISOString()
      });
      renderReminderPage();
      var autoArchived = reminderData.archived.some(function(item){ return item.id === 'completed_once'; });
      deleteReminder(edited.id);
      document.querySelector('[data-action="resolveAppConfirm"][data-args="[true]"]').click();
      var manuallyArchived = reminderData.archived.some(function(item){ return item.id === edited.id; });
      restoreReminder(edited.id);
      var restored = reminderData.items.some(function(item){ return item.id === edited.id; });
      var oldOnceDate = '2001-02-03';
      var oldOnce = {
        id: 'restore_old_once', title: '旧的一次提醒', mode: 'once', time: '09:00',
        date: oldOnceDate, createdAt: new Date().toISOString(),
        archivedAt: Date.now(), archiveReason: 'completed'
      };
      reminderData.archived.push(oldOnce);
      restoreReminder(oldOnce.id);
      var restoredOldOnce = reminderData.items.filter(function(item){
        return item.id === oldOnce.id;
      })[0];
      var oldOnceDateUnchanged = !!restoredOldOnce && restoredOldOnce.date === oldOnceDate;
      var oldOnceStaysActive = !!restoredOldOnce && restoredOldOnce.restoredPastOnce === true;
      if (restoredOldOnce) {
        reminderData.items = reminderData.items.filter(function(item){ return item.id !== oldOnce.id; });
      }
      reminderData.archived.push({
        id: 'archive_temp', title: '临时归档', mode: 'daily', time: '09:00',
        createdAt: new Date().toISOString(), archivedAt: Date.now(), archiveReason: 'deleted'
      });
      permanentDeleteReminder('archive_temp');
      document.querySelector('[data-action="resolveAppConfirm"][data-args="[true]"]').click();
      var permanentlyRemoved = !reminderData.archived.some(function(item){ return item.id === 'archive_temp'; });
      var activeGroupLabels = Array.prototype.map.call(
        byId('reminder-list').querySelectorAll('.reminder-group-head span'),
        function(node){ return node.textContent.replace(/[▸▾]/g, '').trim(); }
      );
      var archiveGroupLabels = Array.prototype.map.call(
        byId('reminder-archive-list').querySelectorAll('.reminder-group-head span'),
        function(node){ return node.textContent.replace(/[▸▾]/g, '').trim(); }
      );
      toggleReminderGroup('active', 'daily');
      var activeGroupCollapsed = reminderData.groupCollapsed.active.daily === true &&
        byId('reminder-list').querySelectorAll('.reminder-group.collapsed').length === 1;
      toggleReminderGroup('active', 'daily');
      toggleReminderGroup('archived', 'once');
      var archiveGroupCollapsed = reminderData.groupCollapsed.archived.once === true;
      toggleReminderGroup('archived', 'once');
      reminderData.items.push({
        id: 'confirm_once', title: '确认完成测试', mode: 'once', time: '12:00',
        date: '2099-01-01', createdAt: new Date().toISOString()
      });
      var originalNativeForConfirm = window.AppNative;
      window.AppNative = {
        consumeConfirmedReminderIds: function(){ return '["confirm_once"]'; }
      };
      applyConfirmedReminders();
      var confirmedArchived = reminderData.archived.some(function(item){
        return item.id === 'confirm_once' && item.archiveReason === 'completed';
      });
      reminderData.archived = reminderData.archived.filter(function(item){ return item.id !== 'confirm_once'; });
      window.AppNative = originalNativeForConfirm;
      saveReminderState(false);
      renderReminderPage();
      return {
        count: reminderData.items.length,
        modes: reminderData.items.map(function(item){ return item.mode; }).sort(),
        title: edited && edited.title,
        dailyRule: dailyItem && reminderRuleText(dailyItem),
        allHaveNext: rows.every(function(row){ return !!row.next; }),
        orderValid: rows.every(function(row, index){
          return index === 0 || rows[index - 1].ts <= row.ts;
        }),
        stored: JSON.parse(localStorage.getItem(RKEY)).items.length,
        futureNoticeHidden: futureNoticeHidden,
        homeNoticeVisible: homeNoticeVisible,
        handledNoticeHidden: handledNoticeHidden,
        dismissedToday: dismissedToday,
        returnedNextCycle: returnedNextCycle,
        homeNoticeHidden: homeNoticeHidden,
        savedOff: savedOff,
        compactCards: document.querySelectorAll('.home-grid .home-card.compact').length,
        autoArchived: autoArchived,
        manuallyArchived: manuallyArchived,
        restored: restored,
        oldOnceDateUnchanged: oldOnceDateUnchanged,
        oldOnceStaysActive: oldOnceStaysActive,
        permanentlyRemoved: permanentlyRemoved,
        archiveCount: byId('reminder-archive-count').textContent,
        activeGroupLabels: activeGroupLabels,
        archiveGroupLabels: archiveGroupLabels,
        activeGroupCollapsed: activeGroupCollapsed,
        archiveGroupCollapsed: archiveGroupCollapsed,
        confirmedArchived: confirmedArchived,
        reminderMenuOpened: reminderMenuOpened,
        reminderBottomSettingsRemoved: reminderBottomSettingsRemoved,
        reminderEditButtonsRemoved: reminderEditButtonsRemoved,
        reminderRowEditable: !!weeklyRow && weeklyRow.getAttribute('data-action') === 'editReminder',
        reminderArchiveEditable: byId('reminder-archive-list').querySelectorAll('[data-action="editReminder"]').length > 0
      };
    })()`);
    assert.equal(reminders.count, 5);
    assert.deepEqual(reminders.modes, ['daily', 'monthly', 'once', 'weekly', 'yearly']);
    assert.equal(reminders.title, '提醒-每周（已编辑）');
    assert.equal(reminders.dailyRule, '每天');
    assert.equal(reminders.allHaveNext, true);
    assert.equal(reminders.orderValid, true);
    assert.equal(reminders.stored, 5);
    assert.equal(reminders.futureNoticeHidden, true);
    assert.equal(reminders.homeNoticeVisible, true);
    assert.equal(reminders.handledNoticeHidden, true);
    assert.equal(reminders.dismissedToday, true);
    assert.equal(reminders.returnedNextCycle, true);
    assert.equal(reminders.homeNoticeHidden, true);
    assert.equal(reminders.savedOff, true);
    assert.equal(reminders.compactCards, 0);
    assert.equal(reminders.autoArchived, true);
    assert.equal(reminders.manuallyArchived, true);
    assert.equal(reminders.restored, true);
    assert.equal(reminders.oldOnceDateUnchanged, true);
    assert.equal(reminders.oldOnceStaysActive, true);
    assert.equal(reminders.permanentlyRemoved, true);
    assert.equal(reminders.archiveCount, '1 条');
    assert.deepEqual(reminders.activeGroupLabels, ['仅一次', '每天', '每周', '每月', '每年']);
    assert.deepEqual(reminders.archiveGroupLabels, ['仅一次']);
    assert.equal(reminders.activeGroupCollapsed, true);
    assert.equal(reminders.archiveGroupCollapsed, true);
    assert.equal(reminders.confirmedArchived, true);
    assert.equal(reminders.reminderMenuOpened, true);
    assert.equal(reminders.reminderBottomSettingsRemoved, true);
    assert.equal(reminders.reminderEditButtonsRemoved, true);
    assert.equal(reminders.reminderRowEditable, true);
    assert.equal(reminders.reminderArchiveEditable, false);

    const notificationDialog = await evaluate(cdp, `(function(){
      reminderData.items.push({
        id: 'dialog_once', title: '通知正文提醒', mode: 'once', time: '12:00',
        date: '2099-01-01', createdAt: new Date().toISOString()
      });
      renderReminderPage();
      openNotificationActionDialog('standalone', 'dialog_once', '通知正文提醒', 777);
      var opened = byId('sheet').classList.contains('on') &&
        byId('sheet').querySelector('.snooze-title').textContent === '通知正文提醒';
      var snoozeAction = byId('sheet').querySelector('[data-action="openSnoozeDialog"]');
      snoozeAction.click();
      var snoozeOpened = !!byId('snooze-minutes');
      closeSheet();
      openNotificationActionDialog('standalone', 'dialog_once', '通知正文提醒', 777);
      confirmNotificationAction('standalone', 'dialog_once', 777);
      var archived = reminderData.archived.some(function(item){
        return item.id === 'dialog_once' && item.archiveReason === 'completed';
      });
      reminderData.archived = reminderData.archived.filter(function(item){
        return item.id !== 'dialog_once';
      });
      saveReminderState(false);
      renderReminderPage();
      return { opened: opened, snoozeOpened: snoozeOpened, archived: archived, closed: !byId('sheet').classList.contains('on') };
    })()`);
    assert.deepEqual(notificationDialog, {
      opened: true,
      snoozeOpened: true,
      archived: true,
      closed: true
    });

    const dragActions = await evaluate(cdp, `(function(){
      todoData.items.push({
        id: 'drag_todo', title: '拖拽待办', repeat: 'once', date: wTodayStr(),
        createdDate: wTodayStr(), done: false, doneDates: {}
      });
      applyDragGestureAction('todo', 'active', 'drag_todo', 'left');
      var todoArchived = todoData.archived.some(function(item){ return item.id === 'drag_todo'; });
      applyDragGestureAction('todo', 'archive', 'drag_todo', 'right');
      var todoRestored = todoData.items.some(function(item){ return item.id === 'drag_todo'; });
      applyDragGestureAction('todo', 'active', 'drag_todo', 'left');
      applyDragGestureAction('todo', 'archive', 'drag_todo', 'left');
      document.querySelector('[data-action="resolveAppConfirm"][data-args="[true]"]').click();
      var todoDeleted = !todoData.archived.some(function(item){ return item.id === 'drag_todo'; });

      reminderData.items.push({
        id: 'drag_reminder', title: '拖拽提醒', mode: 'daily', time: '09:00',
        createdAt: new Date().toISOString()
      });
      applyDragGestureAction('reminder', 'active', 'drag_reminder', 'left');
      var reminderArchived = reminderData.archived.some(function(item){ return item.id === 'drag_reminder'; });
      applyDragGestureAction('reminder', 'archive', 'drag_reminder', 'right');
      var reminderRestored = reminderData.items.some(function(item){ return item.id === 'drag_reminder'; });
      applyDragGestureAction('reminder', 'active', 'drag_reminder', 'left');
      applyDragGestureAction('reminder', 'archive', 'drag_reminder', 'left');
      document.querySelector('[data-action="resolveAppConfirm"][data-args="[true]"]').click();
      var reminderDeleted = !reminderData.archived.some(function(item){ return item.id === 'drag_reminder'; });
      return {
        todoArchived: todoArchived,
        todoRestored: todoRestored,
        todoDeleted: todoDeleted,
        reminderArchived: reminderArchived,
        reminderRestored: reminderRestored,
        reminderDeleted: reminderDeleted,
        activeHint: dragHintFor('todo', 'active', 'left'),
        restoreHint: dragHintFor('reminder', 'archive', 'right'),
        deleteHint: dragHintFor('reminder', 'archive', 'left')
      };
    })()`);
    assert.deepEqual(dragActions, {
      todoArchived: true,
      todoRestored: true,
      todoDeleted: true,
      reminderArchived: true,
      reminderRestored: true,
      reminderDeleted: true,
      activeHint: '松开归档',
      restoreHint: '松开移回',
      deleteHint: '松开彻底删除'
    });

    const customTomorrow = new Date(Date.now() + 86400000);
    const customTomorrowStr = customTomorrow.getFullYear() + '-' +
      String(customTomorrow.getMonth() + 1).padStart(2, '0') + '-' +
      String(customTomorrow.getDate()).padStart(2, '0');
    const conversions = await evaluate(cdp, `(function(){
      todoData.items.push({
        id: 'convert_todo_src', title: '转换待办', repeat: 'daily',
        createdDate: wTodayStr(), done: false, doneDates: {}
      });
      convertTodoToReminder('convert_todo_src');
      var todoArchived = todoData.archived.some(function(item){
        return item.id === 'convert_todo_src' && item.archiveReason === 'converted';
      });
      var createdReminder = reminderData.items.filter(function(item){ return item.title === '转换待办'; })[0];
      var reminderCreated = !!createdReminder;
      if (createdReminder) reminderData.items = reminderData.items.filter(function(item){ return item.id !== createdReminder.id; });
      todoData.archived = todoData.archived.filter(function(item){ return item.id !== 'convert_todo_src'; });

      reminderData.items.push({
        id: 'convert_reminder_src', title: '转换提醒', mode: 'daily', time: '09:00',
        createdAt: new Date().toISOString()
      });
      convertReminderToTodo('convert_reminder_src');
      var reminderArchived = reminderData.archived.some(function(item){
        return item.id === 'convert_reminder_src' && item.archiveReason === 'converted';
      });
      var createdTodo = todoData.items.filter(function(item){ return item.title === '转换提醒'; })[0];
      var todoCreated = !!createdTodo;
      if (createdTodo) todoData.items = todoData.items.filter(function(item){ return item.id !== createdTodo.id; });
      reminderData.archived = reminderData.archived.filter(function(item){ return item.id !== 'convert_reminder_src'; });
      var tomorrow = new Date(Date.now() + 86400000);
      var dayAfter = new Date(Date.now() + 172800000);
      var futureOne = tomorrow.getFullYear() + '-' + pad2(tomorrow.getMonth() + 1) + '-' + pad2(tomorrow.getDate());
      var futureTwo = dayAfter.getFullYear() + '-' + pad2(dayAfter.getMonth() + 1) + '-' + pad2(dayAfter.getDate());
      todoData.items.push({
        id: 'convert_custom_src', title: '多日期待办', repeat: 'custom',
        dates: [futureOne, futureTwo], createdDate: wTodayStr(), done: false, doneDates: {}
      });
      var beforeCustom = reminderData.items.length;
      convertTodoToReminder('convert_custom_src');
      var customCreatedCount = reminderData.items.length - beforeCustom;
      var customCreatedReminder = reminderData.items.filter(function(item){
        return item.title === '多日期待办';
      })[0];
      if (customCreatedReminder) {
        reminderData.items = reminderData.items.filter(function(item){
          return item.id !== customCreatedReminder.id;
        });
      }
      todoData.archived = todoData.archived.filter(function(item){
        return item.id !== 'convert_custom_src';
      });
      saveTodoState();
      saveReminderState(false);
      renderTodoPage();
      renderReminderPage();
      return {
        todoArchived: todoArchived,
        reminderCreated: reminderCreated,
        reminderArchived: reminderArchived,
        todoCreated: todoCreated,
        customCreatedCount: customCreatedCount,
        customCreatedMode: customCreatedReminder && customCreatedReminder.mode,
        customCreatedDate: customCreatedReminder && customCreatedReminder.date
      };
    })()`);
    assert.deepEqual(conversions, {
      todoArchived: true,
      reminderCreated: true,
      reminderArchived: true,
      todoCreated: true,
      customCreatedCount: 1,
      customCreatedMode: 'once',
      customCreatedDate: customTomorrowStr
    });

    const typography = await evaluate(cdp, `(function(){
      var size = function(selector){ return getComputedStyle(document.querySelector(selector)).fontSize; };
      var savedRecords = wd.todayRecords;
      wd.todayRecords = [{ time: '08:00', amount: 200 }];
      renderWater();
      var waterRecord = size('.ramt');
      wd.todayRecords = savedRecords;
      renderWater();
      return {
        waterBody: size('#water-hero-sub'),
        fitBody: size('.fit-desc'),
        todoBody: size('.todo-sub'),
        reminderBody: size('.reminder-sub'),
        todoCard: size('.todo-copy b'),
        reminderCard: size('.reminder-copy b'),
        homeCardLabel: size('.home-card b'),
        pageTitle: size('.fit-title'),
        waterQuick: size('.qbtn'),
        waterInput: size('#w-input'),
        waterRecord: waterRecord,
        waterFont: getComputedStyle(document.querySelector('.qbtn')).fontFamily,
        commonFont: getComputedStyle(document.querySelector('.todo-add')).fontFamily,
        todoTitleWrap: getComputedStyle(document.querySelector('.todo-copy b')).whiteSpace,
        reminderTitleWrap: getComputedStyle(document.querySelector('.reminder-copy b')).whiteSpace
      };
    })()`);
    assert.equal(typography.waterBody, '13px');
    assert.equal(typography.fitBody, '13px');
    assert.equal(typography.todoBody, '13px');
    assert.equal(typography.reminderBody, '13px');
    assert.equal(typography.todoCard, '14px');
    assert.equal(typography.reminderCard, '14px');
    assert.equal(typography.homeCardLabel, '16px');
    assert.equal(typography.pageTitle, '27px');
    assert.equal(typography.waterQuick, '13px');
    assert.equal(typography.waterInput, '14px');
    assert.equal(typography.waterRecord, '13px');
    assert.equal(typography.waterFont, typography.commonFont);
    assert.equal(typography.todoTitleWrap, 'normal');
    assert.equal(typography.reminderTitleWrap, 'normal');

    const snooze = await evaluate(cdp, `(function(){
      var originalNative = window.AppNative;
      var calls = [];
      window.AppNative = {
        scheduleSnoozeNotification: function(type, id, title, minutes){
          calls.push({ type: type, id: id, title: title, minutes: minutes });
          return true;
        }
      };
      openSnoozeDialog('todo', 'todo_daily', '今晚的待办');
      byId('snooze-minutes').value = '17';
      saveSnooze();
      reminderData.items.push({
        id: 'snooze_once', title: '测试提醒', mode: 'once', time: '09:00',
        date: '2099-01-01', createdAt: new Date().toISOString()
      });
      var occurrenceKey = 'snooze_once|2099-01-01|09:00';
      openSnoozeDialog('standalone', 'snooze_once', '测试提醒', occurrenceKey);
      byId('snooze-minutes').value = '30';
      saveSnooze();
      var snoozedArchived = reminderData.archived.some(function(item){
        return item.id === 'snooze_once' && item.archiveReason === 'snoozed';
      });
      reminderData.archived = reminderData.archived.filter(function(item){
        return item.id !== 'snooze_once';
      });
      saveReminderState(false);
      renderReminderPage();
      window.AppNative = originalNative;
      return {
        calls: calls,
        sheetClosed: !byId('sheet').classList.contains('on'),
        occurrenceHandled: reminderData.handledOccurrences[occurrenceKey] === true,
        snoozedArchived: snoozedArchived
      };
    })()`);
    assert.deepEqual(snooze.calls, [
      { type: 'todo', id: 'todo_daily', title: '今晚的待办', minutes: 17 },
      { type: 'standalone', id: 'snooze_once', title: '测试提醒', minutes: 30 }
    ]);
    assert.equal(snooze.sheetClosed, true);
    assert.equal(snooze.occurrenceHandled, true);
    assert.equal(snooze.snoozedArchived, true);

    const csv = fs.readFileSync(csvPath, 'utf8');
    const ledger = await evaluate(cdp, `(function(){
      ledgerData = ledgerDefaultState();
      saveLedgerState();
      var first = importLedgerCsvText(${JSON.stringify(csv)});
      var second = importLedgerCsvText(${JSON.stringify(csv)});
      var total = 0, count = 0, childCount = 0;
      ledgerData.books.forEach(function(book){
        if (book.parentId) childCount++;
        book.records.forEach(function(record){ total += record.amount; count++; });
      });
      var parentIds = ledgerData.books.filter(function(book){
        return ledgerData.books.some(function(child){ return child.parentId === book.id; });
      }).map(function(book){ return book.id; });
      var rootCount = ledgerData.books.filter(function(book){ return !book.parentId; }).length;
      var visibleRows = byId('ledger-tree').querySelectorAll('.ledger-tree-row').length;
      var initialRecordRows = byId('ledger-list').querySelectorAll('.ledger-record').length;
      var recentAboveAdd = !!(byId('ledger-record-box').compareDocumentPosition(document.querySelector('.ledger-actions')) & Node.DOCUMENT_POSITION_FOLLOWING);
      var searchBelowAdd = !!(document.querySelector('.ledger-actions').compareDocumentPosition(document.querySelector('.ledger-search-box')) & Node.DOCUMENT_POSITION_FOLLOWING);
      var eventTreeDefaultCollapsed = byId('ledger-tree').hidden &&
        byId('ledger-tree-head').getAttribute('aria-expanded') === 'false';
      byId('ledger-tree-head').click();
      var eventTreeCanOpen = !byId('ledger-tree').hidden;
      byId('ledger-tree-head').click();
      var eventTreeCanClose = byId('ledger-tree').hidden;
      var recordHead = byId('ledger-record-box').querySelector('.ledger-record-head');
      recordHead.click();
      var expandedRecordRows = byId('ledger-list').querySelectorAll('.ledger-record').length;
      recordHead.click();
      var hiddenRecordRows = byId('ledger-list').querySelectorAll('.ledger-record').length;
      recordHead.click();
      var previewRecordRowsAgain = byId('ledger-list').querySelectorAll('.ledger-record').length;
      var eventFont = getComputedStyle(byId('ledger-tree').querySelector('.ledger-tree-select')).fontSize;
      var monthFont = getComputedStyle(byId('ledger-month-list').querySelector('.ledger-month-row b')).fontSize;
      var pieSegments = Math.max(0, byId('ledger-category-pie').querySelectorAll('circle').length - 1);
      var categoryRows = byId('ledger-category-list').querySelectorAll('.ledger-category-row').length;
      var eventMonths = byId('ledger-event-month-list').querySelectorAll('.ledger-event-month-row').length;
      var recordEditButtonsRemoved = byId('ledger-list').querySelectorAll('button[data-action="editLedgerRecord"]').length === 0;
      var recordRowsEditable = byId('ledger-list').querySelectorAll('.ledger-record[data-action="editLedgerRecord"]').length > 0;
      var recordDeleteButtons = byId('ledger-list').querySelectorAll('[data-action="deleteLedgerRecord"]').length > 0;
      openLedgerMonthReport('2026-09');
      var reportHasPie = byId('sheet').querySelectorAll('.ledger-pie').length === 1;
      closeSheet();
      editLedgerTag('路费');
      byId('ledger-tag-edit').value = '交通';
      saveLedgerTagEdit();
      var editedTag = ledgerData.tags.indexOf('交通') >= 0 && ledgerData.tags.indexOf('路费') < 0;
      var recordsRenamed = ledgerAllEntries().some(function(entry){ return entry.record.tag === '交通'; });
      deleteLedgerTag('交通');
      document.querySelector('[data-action="resolveAppConfirm"][data-args="[true]"]').click();
      var deletedTag = ledgerData.tags.indexOf('交通') < 0;
      var recordsPreserved = ledgerAllEntries().some(function(entry){ return entry.record.tag === '交通'; });
      closeSheet();
      var searchCounts = {};
      ['2026-09', '交通', '高铁', '305.00'].forEach(function(query){
        ledgerSearchQuery = query;
        if (byId('ledger-search')) byId('ledger-search').value = query;
        renderLedgerPage();
        searchCounts[query] = byId('ledger-list').querySelectorAll('.ledger-record').length;
      });
      var searchRows = byId('ledger-list').querySelectorAll('.ledger-record').length;
      var searchCountText = byId('ledger-record-count').textContent;
      ledgerSearchQuery = '';
      if (byId('ledger-search')) byId('ledger-search').value = '';
      renderLedgerPage();
      openLedgerSettingsPage();
      var settingsOpened = byId('p-ledger-settings').classList.contains('on') &&
        document.body.dataset.page === 'ledger-settings';
      var settingsPage = byId('p-ledger-settings');
      var settingsGroupFlex = getComputedStyle(settingsPage.querySelector('.settings-group')).flexShrink;
      var settingsOverflow = getComputedStyle(settingsPage).overflowY;
      var settingsChildButton = !!settingsPage.querySelector('[data-action="openLedgerChildBookSheet"]');
      var settingsScrollable = settingsPage.scrollHeight > settingsPage.clientHeight;
      settingsPage.scrollTop = 60;
      var settingsScrollWorks = settingsPage.scrollTop > 0;
      settingsPage.scrollTop = 0;
      renameCurrentLedgerEvent();
      byId('ledger-event-name-edit').value = '旅行';
      saveLedgerEventName();
      var renamedRoot = !!currentLedgerBook() && currentLedgerBook().name === '旅行';
      var rootId = ledgerRootBook(currentLedgerBook()).id;
      archiveCurrentLedgerEvent();
      document.querySelector('[data-action="resolveAppConfirm"][data-args="[true]"]').click();
      var archivedEvent = archivedLedgerRoots().some(function(book){ return book.id === rootId; });
      var archiveButtonShown = !!byId('ledger-settings-archive').querySelector('[data-action="restoreLedgerEvent"]');
      restoreLedgerEvent(rootId);
      var restoredEvent = currentLedgerBook() && currentLedgerBook().id === rootId;
      var childBook = ledgerData.books.filter(function(book){ return !!book.parentId; })[0];
      ledgerData.selectedId = childBook.id;
      archiveCurrentLedgerEvent();
      document.querySelector('[data-action="resolveAppConfirm"][data-args="[true]"]').click();
      var childArchived = ledgerIsArchived(childBook) &&
        archivedLedgerRoots().some(function(book){ return book.id === childBook.id; });
      var parentSelectedAfterChildArchive = currentLedgerBook() &&
        currentLedgerBook().id === childBook.parentId;
      restoreLedgerEvent(childBook.id);
      var childRestored = !ledgerIsArchived(childBook) &&
        currentLedgerBook() && currentLedgerBook().id === childBook.id;
      var allExportCount = buildLedgerCsv(true).count;
      closeLedgerSettingsPage();
      return {
        first: first,
        second: second,
        total: Math.round(total * 100) / 100,
        count: count,
        childCount: childCount,
        allCollapsed: parentIds.every(function(id){ return ledgerCollapsed[id] === true; }),
        visibleRows: visibleRows,
        rootCount: rootCount,
        initialRecordRows: initialRecordRows,
        recentAboveAdd: recentAboveAdd,
        searchBelowAdd: searchBelowAdd,
        eventTreeDefaultCollapsed: eventTreeDefaultCollapsed,
        eventTreeCanOpen: eventTreeCanOpen,
        eventTreeCanClose: eventTreeCanClose,
        expandedRecordRows: expandedRecordRows,
        hiddenRecordRows: hiddenRecordRows,
        previewRecordRowsAgain: previewRecordRowsAgain,
        eventFont: eventFont,
        monthFont: monthFont,
        pieSegments: pieSegments,
        categoryRows: categoryRows,
        eventMonths: eventMonths,
        recordEditButtonsRemoved: recordEditButtonsRemoved,
        recordRowsEditable: recordRowsEditable,
        recordDeleteButtons: recordDeleteButtons,
        reportHasPie: reportHasPie,
        editedTag: editedTag,
        recordsRenamed: recordsRenamed,
        deletedTag: deletedTag,
        recordsPreserved: recordsPreserved,
        searchRows: searchRows,
        searchCounts: searchCounts,
        searchCountText: searchCountText,
        settingsOpened: settingsOpened,
        settingsGroupFlex: settingsGroupFlex,
        settingsOverflow: settingsOverflow,
        settingsChildButton: settingsChildButton,
        settingsScrollable: settingsScrollable,
        settingsScrollWorks: settingsScrollWorks,
        renamedRoot: renamedRoot,
        archivedEvent: archivedEvent,
        archiveButtonShown: archiveButtonShown,
        restoredEvent: restoredEvent,
        childArchived: childArchived,
        parentSelectedAfterChildArchive: parentSelectedAfterChildArchive,
        childRestored: childRestored,
        allExportCount: allExportCount
      };
    })()`);
    assert.equal(ledger.first.imported, 118);
    assert.equal(ledger.first.skipped, 0);
    assert.equal(ledger.second.imported, 0);
    assert.equal(ledger.second.skipped, 118);
    assert.equal(ledger.total, 12449.6);
    assert.equal(ledger.count, 118);
    assert.equal(ledger.childCount, 10);
    assert.equal(ledger.allCollapsed, true);
    assert.equal(ledger.visibleRows, ledger.rootCount);
    assert.equal(ledger.initialRecordRows, 3);
    assert.equal(ledger.recentAboveAdd, true);
    assert.equal(ledger.searchBelowAdd, true);
    assert.equal(ledger.eventTreeDefaultCollapsed, true);
    assert.equal(ledger.eventTreeCanOpen, true);
    assert.equal(ledger.eventTreeCanClose, true);
    assert.ok(ledger.expandedRecordRows > 3);
    assert.equal(ledger.hiddenRecordRows, 0);
    assert.equal(ledger.previewRecordRowsAgain, 3);
    assert.equal(ledger.eventFont, '13px');
    assert.equal(ledger.monthFont, '13px');
    assert.ok(ledger.pieSegments > 0);
    assert.ok(ledger.categoryRows > 0);
    assert.ok(ledger.eventMonths > 0);
    assert.equal(ledger.recordEditButtonsRemoved, true);
    assert.equal(ledger.recordRowsEditable, true);
    assert.equal(ledger.recordDeleteButtons, true);
    assert.equal(ledger.reportHasPie, true);
    assert.equal(ledger.editedTag, true);
    assert.equal(ledger.recordsRenamed, true);
    assert.equal(ledger.deletedTag, true);
    assert.equal(ledger.recordsPreserved, true);
    assert.ok(ledger.searchRows > 0);
    assert.ok(ledger.searchRows < ledger.count);
    assert.ok(ledger.searchCounts['2026-09'] > 0);
    assert.ok(ledger.searchCounts['交通'] > 0);
    assert.ok(ledger.searchCounts['高铁'] > 0);
    assert.ok(ledger.searchCounts['305.00'] > 0);
    assert.ok(ledger.searchCountText.indexOf('/ 118') >= 0);
    assert.equal(ledger.settingsOpened, true);
    assert.equal(ledger.settingsGroupFlex, '0');
    assert.equal(ledger.settingsOverflow, 'auto');
    assert.equal(ledger.settingsChildButton, true);
    assert.equal(ledger.settingsScrollable, true);
    assert.equal(ledger.settingsScrollWorks, true);
    assert.equal(ledger.renamedRoot, true);
    assert.equal(ledger.archivedEvent, true);
    assert.equal(ledger.archiveButtonShown, true);
    assert.equal(ledger.restoredEvent, true);
    assert.equal(ledger.childArchived, true);
    assert.equal(ledger.parentSelectedAfterChildArchive, true);
    assert.equal(ledger.childRestored, true);
    assert.equal(ledger.allExportCount, 118);

    await evaluate(cdp, `(function(){
      S.quitDate = Date.now() - 86400000;
      saveS();
      wd.dailyGoal = 2345;
      wd.todayRecords = [{ time: '08:00', amount: 300 }];
      wSave();
      saveWorkout();
      saveTodoState();
      saveReminderState();
      saveLedgerState();
      saveMealState();
      var backup = appBackupPayload();
      backup.data.water.dailyGoal = 2600;
      receiveAppBackup(JSON.stringify(backup));
      document.querySelector('[data-action="resolveAppConfirm"][data-args="[true]"]').click();
      return true;
    })()`);
    await delay(500);
    await waitForApp(cdp);
    const restored = await evaluate(cdp, `(function(){
      var water = JSON.parse(localStorage.getItem('water_tracker_data'));
      var fitness = JSON.parse(localStorage.getItem('fitness_app_v1'));
      var todo = JSON.parse(localStorage.getItem('todo_app_v1'));
      var reminders = JSON.parse(localStorage.getItem('reminder_app_v1'));
      var ledger = JSON.parse(localStorage.getItem('ledger_app_v1'));
      var meals = JSON.parse(localStorage.getItem('meals_app_v1'));
      var quit = JSON.parse(localStorage.getItem('quit_app_v1'));
      var previous = JSON.parse(localStorage.getItem('bu_pre_restore_v1'));
      return {
        waterGoal: water.dailyGoal,
        fitnessSessions: fitness.sessions.length,
        todoItems: todo.items.length,
        todoArchived: todo.archived.length,
        reminderItems: reminders.items.length,
        reminderArchived: reminders.archived.length,
        ledgerRecords: ledger.books.reduce(function(sum, book){ return sum + book.records.length; }, 0),
        mealRecords: meals.records.length,
        quitDate: quit.quitDate,
        previousGoal: previous.data.water.dailyGoal,
        previousReminders: previous.data.reminders.items.length,
        previousMeals: previous.data.meals.records.length,
        previousReminderArchived: previous.data.reminders.archived.length,
        previousTodoArchived: previous.data.todo.archived.length
      };
    })()`);
    assert.equal(restored.waterGoal, 2600);
    assert.equal(restored.fitnessSessions, 1);
    assert.equal(restored.todoItems, 2);
    assert.equal(restored.todoArchived, 2);
    assert.equal(restored.reminderItems, 5);
    assert.equal(restored.reminderArchived, 1);
    assert.equal(restored.ledgerRecords, 118);
    assert.equal(restored.mealRecords, 4);
    assert.ok(restored.quitDate > 0);
    assert.equal(restored.previousGoal, 2345);
    assert.equal(restored.previousReminders, 5);
    assert.equal(restored.previousMeals, 4);
    assert.equal(restored.previousReminderArchived, 1);
    assert.equal(restored.previousTodoArchived, 2);

    const legacyQuit = Date.now() - 48 * 3600000;
    await evaluate(cdp, `(function(){
      localStorage.removeItem(AKEY);
      localStorage.removeItem(LKEY);
      localStorage.setItem(QKEY, JSON.stringify({ registration: { quitDate: ${legacyQuit} } }));
      localStorage.setItem(LOLDKEY, JSON.stringify({
        events: [{
          id: 'legacy_event',
          name: '旧账本',
          records: [{ id: 'legacy_record', amount: 12.5, tag: '旧分类', date: '2026-10-01', note: '迁移测试' }]
        }]
      }));
      return true;
    })()`);
    await cdp.call('Page.reload', { ignoreCache: true });
    await waitForApp(cdp);
    await delay(300);
    const migrations = await evaluate(cdp, `(function(){
      var currentLedger = JSON.parse(localStorage.getItem(LKEY));
      return {
        quitDate: JSON.parse(localStorage.getItem(AKEY)).quitDate,
        quitSchema: JSON.parse(localStorage.getItem(AKEY)).schemaVersion,
        ledgerMigrated: !!(currentLedger && currentLedger.migrated),
        ledgerRecords: currentLedger.books.reduce(function(sum, book){ return sum + book.records.length; }, 0),
        oldLedgerPreserved: !!localStorage.getItem(LOLDKEY),
        oldQuitPreserved: !!localStorage.getItem(QKEY)
      };
    })()`);
    assert.equal(migrations.quitDate, legacyQuit);
    assert.equal(migrations.quitSchema, 2);
    assert.equal(migrations.ledgerMigrated, true);
    assert.equal(migrations.ledgerRecords, 1);
    assert.equal(migrations.oldLedgerPreserved, true);
    assert.equal(migrations.oldQuitPreserved, true);

    console.log('APP TESTS OK');
    console.log('navigation, meals, workout, todo, reminders, ledger CSV, backup restore, legacy migration');
  } finally {
    if (cdp) cdp.close();
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore'
      });
    } else {
      child.kill('SIGKILL');
    }
    await delay(800);
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
    } catch (error) {
      if (process.env.BU_TEST_DEBUG) console.error('Profile cleanup skipped:', error.message);
    }
  }
}

run().then(
  () => process.exit(0),
  error => {
    console.error(error.stack || error);
    process.exit(1);
  }
);
