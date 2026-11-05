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
      const dom = await evaluate(cdp, `['p-home','p-fitness','p-water','p-quit','p-todo','p-reminder','p-ledger'].map(function(id){
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
      goPage(6);
      moveByHorizontalSwipe(-1);
      var wrappedForward = page === 1;
      goPage(1);
      moveByHorizontalSwipe(1);
      var wrappedBackward = page === 6;
      goPage(4);
      moveByHorizontalSwipe(-1);
      var todoNext = page === 5 &&
        byId('page-pager').querySelector('button.on').textContent.trim() === '账';
      moveByHorizontalSwipe(-1);
      var ledgerNext = page === 6 &&
        byId('page-pager').querySelector('button.on').textContent.trim() === '醒';
      var pagerLabels = Array.prototype.map.call(
        byId('page-pager').querySelectorAll('button'),
        function(btn){ return btn.textContent.trim(); }
      );
      S.quitDate = Date.now() - 3600000;
      saveS();
      goPage(3);
      var breakRect = byId('btn-break').getBoundingClientRect();
      var pagerRect = byId('page-pager').getBoundingClientRect();
      var controlsSeparate = breakRect.bottom < pagerRect.top;
      var activeQuickLabel = byId('page-pager').querySelector('button.on').textContent.trim();
      goPage(4);
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
        activeQuickLabel: activeQuickLabel
      };
    })()`);
    assert.deepEqual(navigation, {
      homeLocked: true,
      wrappedForward: true,
      wrappedBackward: true,
      todoNext: true,
      ledgerNext: true,
      handledBack: true,
      pagerLabels: ['练', '水', '戒', '记', '账', '醒'],
      controlsSeparate: true,
      activeQuickLabel: '戒'
    });

    const settingsPage = await evaluate(cdp, `(function(){
      var originalNative = window.AppNative;
      var calls = 0;
      window.AppNative = { checkForUpdates: function(){ calls++; } };
      byId('btn-app-settings').click();
      var opened = byId('p-settings').classList.contains('on') &&
        document.body.dataset.page === 'settings';
      var dataActions = byId('p-settings').querySelectorAll('[data-action="exportAppBackup"], [data-action="chooseAppBackup"]').length;
      byId('p-settings').querySelector('[data-action="openAboutSheet"]').click();
      var aboutOpened = byId('sheet').classList.contains('on');
      var changelogCount = byId('sheet').querySelectorAll('.changelog-entry').length;
      var aboutVersion = byId('sheet').querySelector('.about-current b').textContent.trim();
      closeSheet();
      byId('p-settings').querySelector('[data-action="checkAppUpdate"]').click();
      var handledBack = handleBackNavigation();
      var returnedHome = !settingsOpen && page === 0 && byId('p-home').classList.contains('on');
      window.AppNative = originalNative;
      return {
        opened: opened,
        dataActions: dataActions,
        aboutOpened: aboutOpened,
        changelogCount: changelogCount,
        aboutVersion: aboutVersion,
        updateCalls: calls,
        handledBack: handledBack,
        returnedHome: returnedHome
      };
    })()`);
    assert.deepEqual(settingsPage, {
      opened: true,
      dataActions: 2,
      aboutOpened: true,
      changelogCount: 28,
      aboutVersion: '5.7',
      updateCalls: 1,
      handledBack: true,
      returnedHome: true
    });

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
      return {
        activeEnded: fit.activeSessionId === null,
        ended: !!last.endAt,
        setCount: last.sets.filter(function(r){ return r.kind === 'set'; }).length,
        durationCount: last.sets.filter(function(r){ return r.kind === 'duration'; }).length,
        elapsedRecorded: last.sets.every(function(r){ return r.elapsed > 0; }),
        stored: !!JSON.parse(localStorage.getItem('fitness_app_v1')).sessions.length
      };
    })()`);
    assert.equal(workout.error, undefined);
    assert.equal(workout.activeEnded, true);
    assert.equal(workout.ended, true);
    assert.equal(workout.setCount, 12);
    assert.equal(workout.durationCount, 2);
    assert.equal(workout.elapsedRecorded, true);
    assert.equal(workout.stored, true);

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
      return {
        before: before,
        after: after,
        completedToday: completedToday,
        archived: initialArchived,
        restored: restored,
        permanentRemoved: permanentRemoved,
        finalArchived: todoArchivedItems().map(function(item){ return item.id; }).sort(),
        archiveCollapsed: byId('todo-archive-box').open === false,
        archiveCount: byId('todo-archive-count').textContent
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

    const todoEdit = await evaluate(cdp, `(function(){
      var today = wTodayStr();
      var beforeCount = todoData.items.length;
      document.querySelector('.todo-edit[data-action="editTodo"]').click();
      byId('todo-name').value = '每天一次（已编辑）';
      saveTodoItem();
      var edited = todoData.items.filter(function(item){ return item.id === 'daily'; })[0];
      return {
        count: todoData.items.length,
        beforeCount: beforeCount,
        title: edited && edited.title,
        completionPreserved: !!(edited && edited.doneDates && edited.doneDates[today]),
        sheetClosed: !byId('sheet').classList.contains('on'),
        editingCleared: editingTodoId === null
      };
    })()`);
    assert.equal(todoEdit.count, todoEdit.beforeCount);
    assert.equal(todoEdit.title, '每天一次（已编辑）');
    assert.equal(todoEdit.completionPreserved, true);
    assert.equal(todoEdit.sheetClosed, true);
    assert.equal(todoEdit.editingCleared, true);

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
      editReminder(weekly.id);
      byId('reminder-title').value = '提醒-每周（已编辑）';
      saveReminder();
      var edited = reminderItemById(weekly.id);
      var dailyItem = reminderData.items.filter(function(item){ return item.mode === 'daily'; })[0];
      var rows = reminderSortedItems();
      var homeNoticeVisible = !byId('home-notice').hidden;
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
      reminderData.archived.push({
        id: 'archive_temp', title: '临时归档', mode: 'daily', time: '09:00',
        createdAt: new Date().toISOString(), archivedAt: Date.now(), archiveReason: 'deleted'
      });
      permanentDeleteReminder('archive_temp');
      document.querySelector('[data-action="resolveAppConfirm"][data-args="[true]"]').click();
      var permanentlyRemoved = !reminderData.archived.some(function(item){ return item.id === 'archive_temp'; });
      var activeGroupLabels = Array.prototype.map.call(
        byId('reminder-list').querySelectorAll('.reminder-group-head span'),
        function(node){ return node.textContent.trim(); }
      );
      var archiveGroupLabels = Array.prototype.map.call(
        byId('reminder-archive-list').querySelectorAll('.reminder-group-head span'),
        function(node){ return node.textContent.trim(); }
      );
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
        homeNoticeVisible: homeNoticeVisible,
        dismissedToday: dismissedToday,
        returnedNextCycle: returnedNextCycle,
        homeNoticeHidden: homeNoticeHidden,
        savedOff: savedOff,
        compactCards: document.querySelectorAll('.home-grid .home-card.compact').length,
        autoArchived: autoArchived,
        manuallyArchived: manuallyArchived,
        restored: restored,
        permanentlyRemoved: permanentlyRemoved,
        archiveCount: byId('reminder-archive-count').textContent,
        activeGroupLabels: activeGroupLabels,
        archiveGroupLabels: archiveGroupLabels
      };
    })()`);
    assert.equal(reminders.count, 5);
    assert.deepEqual(reminders.modes, ['daily', 'monthly', 'once', 'weekly', 'yearly']);
    assert.equal(reminders.title, '提醒-每周（已编辑）');
    assert.equal(reminders.dailyRule, '每天');
    assert.equal(reminders.allHaveNext, true);
    assert.equal(reminders.orderValid, true);
    assert.equal(reminders.stored, 5);
    assert.equal(reminders.homeNoticeVisible, true);
    assert.equal(reminders.dismissedToday, true);
    assert.equal(reminders.returnedNextCycle, true);
    assert.equal(reminders.homeNoticeHidden, true);
    assert.equal(reminders.savedOff, true);
    assert.equal(reminders.compactCards, 2);
    assert.equal(reminders.autoArchived, true);
    assert.equal(reminders.manuallyArchived, true);
    assert.equal(reminders.restored, true);
    assert.equal(reminders.permanentlyRemoved, true);
    assert.equal(reminders.archiveCount, '1 条');
    assert.deepEqual(reminders.activeGroupLabels, ['仅一次', '每天', '每周', '每月', '每年']);
    assert.deepEqual(reminders.archiveGroupLabels, ['仅一次']);

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
        commonFont: getComputedStyle(document.querySelector('.todo-add')).fontFamily
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
      openSnoozeDialog('standalone', 'reminder_1', '测试提醒');
      byId('snooze-minutes').value = '30';
      saveSnooze();
      window.AppNative = originalNative;
      return { calls: calls, sheetClosed: !byId('sheet').classList.contains('on') };
    })()`);
    assert.deepEqual(snooze.calls, [
      { type: 'todo', id: 'todo_daily', title: '今晚的待办', minutes: 17 },
      { type: 'standalone', id: 'reminder_1', title: '测试提醒', minutes: 30 }
    ]);
    assert.equal(snooze.sheetClosed, true);

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
      var eventFont = getComputedStyle(byId('ledger-tree').querySelector('.ledger-tree-select')).fontSize;
      var monthFont = getComputedStyle(byId('ledger-month-list').querySelector('.ledger-month-row b')).fontSize;
      var pieSegments = Math.max(0, byId('ledger-category-pie').querySelectorAll('circle').length - 1);
      var categoryRows = byId('ledger-category-list').querySelectorAll('.ledger-category-row').length;
      var eventMonths = byId('ledger-event-month-list').querySelectorAll('.ledger-event-month-row').length;
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
      return {
        first: first,
        second: second,
        total: Math.round(total * 100) / 100,
        count: count,
        childCount: childCount,
        allCollapsed: parentIds.every(function(id){ return ledgerCollapsed[id] === true; }),
        visibleRows: visibleRows,
        rootCount: rootCount,
        eventFont: eventFont,
        monthFont: monthFont,
        pieSegments: pieSegments,
        categoryRows: categoryRows,
        eventMonths: eventMonths,
        reportHasPie: reportHasPie,
        editedTag: editedTag,
        recordsRenamed: recordsRenamed,
        deletedTag: deletedTag,
        recordsPreserved: recordsPreserved
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
    assert.equal(ledger.eventFont, '13px');
    assert.equal(ledger.monthFont, '13px');
    assert.ok(ledger.pieSegments > 0);
    assert.ok(ledger.categoryRows > 0);
    assert.ok(ledger.eventMonths > 0);
    assert.equal(ledger.reportHasPie, true);
    assert.equal(ledger.editedTag, true);
    assert.equal(ledger.recordsRenamed, true);
    assert.equal(ledger.deletedTag, true);
    assert.equal(ledger.recordsPreserved, true);

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
        quitDate: quit.quitDate,
        previousGoal: previous.data.water.dailyGoal,
        previousReminders: previous.data.reminders.items.length,
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
    assert.ok(restored.quitDate > 0);
    assert.equal(restored.previousGoal, 2345);
    assert.equal(restored.previousReminders, 5);
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
    console.log('navigation, workout, todo, reminders, ledger CSV, backup restore, legacy migration');
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
