/* ============================================================
   8.7 记账
   ============================================================ */
function ledgerDefaultState(){
  return {
    books: [{ id: 'book_daily', name: '日常账本', parentId: null, records: [] }],
    selectedId: 'book_daily',
    tags: DEFAULT_LEDGER_TAGS.slice(),
    migrated: false
  };
}

function normalizeLedgerState(data){
  var out = ledgerDefaultState(), seenBooks = {}, seenTags = {};
  out.tags = [];
  each(Array.isArray(data && data.tags) ? data.tags : DEFAULT_LEDGER_TAGS, function(tag){
    var name = typeof tag === 'string' ? tag : (tag && tag.name);
    name = String(name || '').trim();
    if (!name || seenTags[name]) return;
    seenTags[name] = true;
    out.tags.push(name);
  });
  if (!out.tags.length) out.tags = DEFAULT_LEDGER_TAGS.slice();

  var sourceBooks = Array.isArray(data && data.books) ? data.books :
    (Array.isArray(data && data.events) ? data.events : []);
  out.books = [];
  each(sourceBooks, function(book){
    if (!book || !book.name) return;
    var id = String(book.id || ('book_' + out.books.length));
    if (seenBooks[id]) id += '_' + out.books.length;
    seenBooks[id] = true;
    var records = Array.isArray(book.records) ? book.records.map(function(r){
      var amount = Number(r && r.amount);
      if (!(amount > 0)) return null;
      return {
        id: String((r && r.id) || ('record_' + Math.random().toString(36).slice(2))),
        amount: Math.round(amount * 100) / 100,
        tag: String((r && r.tag) || '未分类'),
        date: String((r && r.date) || wTodayStr()),
        note: String((r && r.note) || ''),
        createdAt: (r && r.createdAt) ? String(r.createdAt) : ''
      };
    }).filter(Boolean) : [];
    out.books.push({
      id: id,
      name: String(book.name),
      parentId: book.parentId ? String(book.parentId) : null,
      records: records
    });
  });
  if (!out.books.length) out.books = ledgerDefaultState().books;
  var byId = {};
  each(out.books, function(book){ byId[book.id] = book; });
  each(out.books, function(book){
    if (!book.parentId) return;
    if (book.parentId === book.id || !byId[book.parentId]) {
      book.parentId = null;
      return;
    }
    var seen = {}, cur = book;
    while (cur && cur.parentId) {
      if (seen[cur.id]) { book.parentId = null; break; }
      seen[cur.id] = true;
      cur = byId[cur.parentId];
    }
  });
  var selectedId = data && data.selectedId;
  out.selectedId = out.books.some(function(b){ return b.id === selectedId; }) ? selectedId : out.books[0].id;
  return out;
}

function loadLedgerState(){
  var current = storeGet(LKEY, null);
  var old = current ? null : storeGet(LOLDKEY, null);
  ledgerData = normalizeLedgerState(current || old);
  ledgerData.migrated = !current && !!old;
  saveLedgerState();
}

function saveLedgerState(){ ledgerData.schemaVersion = 2; storeSet(LKEY, ledgerData); }

function currentLedgerBook(){
  for (var i = 0; i < ledgerData.books.length; i++) {
    if (ledgerData.books[i].id === ledgerData.selectedId) return ledgerData.books[i];
  }
  return ledgerData.books[0];
}

function ledgerBookById(id){
  for (var i = 0; i < ledgerData.books.length; i++) if (ledgerData.books[i].id === id) return ledgerData.books[i];
  return null;
}

function ledgerChildBooks(id){
  return ledgerData.books.filter(function(book){ return book.parentId === id; });
}

function ledgerBookDepth(book){
  var depth = 0, seen = {}, cur = book;
  while (cur && cur.parentId && !seen[cur.id] && depth < 20) {
    seen[cur.id] = true;
    cur = ledgerBookById(cur.parentId);
    depth++;
  }
  return depth;
}

function ledgerBookPath(book){
  var parts = [], seen = {}, cur = book;
  while (cur && !seen[cur.id] && parts.length < 20) {
    seen[cur.id] = true;
    parts.unshift(cur.name);
    cur = cur.parentId ? ledgerBookById(cur.parentId) : null;
  }
  return parts.join(' / ');
}

function ledgerOrderedBooks(){
  var out = [], seen = {};
  function walk(parentId, depth) {
    each(ledgerData.books, function(book){
      if ((book.parentId || null) !== parentId || seen[book.id]) return;
      seen[book.id] = true;
      out.push({ book: book, depth: depth });
      walk(book.id, depth + 1);
    });
  }
  walk(null, 0);
  each(ledgerData.books, function(book){
    if (!seen[book.id]) out.push({ book: book, depth: 0 });
  });
  return out;
}

function ledgerSubtreeBooks(id){
  var result = [], seen = {};
  function add(bookId){
    var book = ledgerBookById(bookId);
    if (!book || seen[book.id]) return;
    seen[book.id] = true;
    result.push(book);
    each(ledgerData.books, function(child){
      if (child.parentId === book.id) add(child.id);
    });
  }
  add(id);
  return result;
}

function ledgerRecordOwner(id){
  for (var i = 0; i < ledgerData.books.length; i++) {
    for (var j = 0; j < ledgerData.books[i].records.length; j++) {
      if (ledgerData.books[i].records[j].id === id) return { book: ledgerData.books[i], record: ledgerData.books[i].records[j] };
    }
  }
  return null;
}

function ledgerRootBook(book){
  var current = book, guard = {};
  while (current && current.parentId && !guard[current.id]) {
    guard[current.id] = true;
    current = ledgerBookById(current.parentId);
  }
  return current || book;
}

function ledgerAllEntries(){
  var entries = [];
  each(ledgerData.books, function(owner){
    each(owner.records, function(record){ entries.push({ owner: owner, record: record }); });
  });
  return entries;
}

function ledgerMonthLabel(key){
  var p = key.split('-');
  return p[0] + ' 年 ' + parseInt(p[1], 10) + ' 月';
}

function openLedgerMonthReport(key){
  var entries = ledgerAllEntries().filter(function(entry){
    return String(entry.record.date).slice(0, 7) === key;
  }).sort(function(a, b){
    var at = a.record.createdAt ? new Date(a.record.createdAt).getTime() : 0;
    var bt = b.record.createdAt ? new Date(b.record.createdAt).getTime() : 0;
    return String(b.record.date).localeCompare(String(a.record.date)) || bt - at;
  });
  var total = 0, groups = {}, rootIds = {};
  each(entries, function(entry){
    total += entry.record.amount;
    var root = ledgerRootBook(entry.owner);
    if (!root) return;
    rootIds[root.id] = true;
    groups[root.id] = groups[root.id] || { name: root.name, total: 0, count: 0 };
    groups[root.id].total += entry.record.amount;
    groups[root.id].count++;
  });
  var groupRows = Object.keys(groups).map(function(id){ return groups[id]; })
    .sort(function(a, b){ return b.total - a.total; })
    .map(function(group){
      return '<div class="ledger-report-check"><span>' + escHtml(group.name) + ' · ' + group.count +
        ' 笔</span><span>' + ledgerMoney(group.total) + '</span></div>';
    }).join('');
  var recordRows = entries.map(function(entry){
    return '<div class="ledger-report-record"><span class="date">' +
      escHtml(String(entry.record.date).slice(5)) + '</span><span class="path">' +
      escHtml(ledgerBookPath(entry.owner)) + ' · ' + escHtml(entry.record.note || entry.record.tag) +
      '</span><span class="money">' + ledgerMoney(entry.record.amount) + '</span></div>';
  }).join('');
  openSheet(
    '<h3>' + ledgerMonthLabel(key) + '支出</h3>' +
    '<div class="ledger-report-total"><span>' + entries.length + ' 笔 · ' +
      Object.keys(rootIds).length + ' 个根事件</span><b>' + ledgerMoney(total) + '</b></div>' +
    groupRows +
    '<div class="ledger-report-records">' + recordRows + '</div>' +
    '<div class="row"><button class="ghost" style="flex:1"' + actionAttrs('closeSheet') + '>关闭</button></div>'
  );
}

function renderLedgerMonths(){
  if (!ledgerData || !byId('ledger-month-list')) return;
  var months = {};
  each(ledgerAllEntries(), function(entry){
    var key = String(entry.record.date).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) return;
    months[key] = months[key] || { total: 0, count: 0, roots: {} };
    months[key].total += entry.record.amount;
    months[key].count++;
    months[key].roots[ledgerRootBook(entry.owner).id] = true;
  });
  var keys = Object.keys(months).sort().reverse();
  setTxt('ledger-months-total', keys.length + ' 个月');
  var currentMonth = new Date().getFullYear() + '-' + pad2(new Date().getMonth() + 1);
  byId('ledger-month-list').innerHTML = keys.length ? keys.map(function(key){
    var item = months[key];
    return '<button class="ledger-month-row' + (key === currentMonth ? ' current' : '') +
      '"' + actionAttrs('openLedgerMonthReport', [key]) + '><span><b>' + ledgerMonthLabel(key) +
      '</b><small>' + Object.keys(item.roots).length + ' 个根事件 · ' + item.count + ' 笔</small></span>' +
      '<strong>' + ledgerMoney(item.total) + '</strong></button>';
  }).join('') : '<div class="ledger-empty" style="padding:14px">还没有可统计的月份</div>';
}

function ledgerMonthTotalForBook(id){
  var prefix = new Date().getFullYear() + '-' + pad2(new Date().getMonth() + 1);
  var total = 0;
  each(ledgerSubtreeBooks(id), function(book){
    each(book.records, function(record){
      if (String(record.date).indexOf(prefix) === 0) total += record.amount;
    });
  });
  return total;
}

function ledgerTreeHtml(parentId, depth){
  var html = '';
  each(ledgerData.books, function(book){
    if ((book.parentId || null) !== (parentId || null)) return;
    var children = ledgerChildBooks(book.id);
    var collapsed = !!ledgerCollapsed[book.id];
    html += '<div class="ledger-tree-row' + (book.id === ledgerData.selectedId ? ' current' : '') +
      '" style="--depth:' + depth + '">' +
      (children.length ? '<button class="ledger-tree-toggle" type="button"' +
        actionAttrs('toggleLedgerNode', [book.id]) + '>' + (collapsed ? '▸' : '▾') + '</button>' : '<span class="ledger-tree-toggle"></span>') +
      '<button class="ledger-tree-select" type="button"' + actionAttrs('selectLedgerBook', [book.id]) + '>' +
      (depth ? '<span class="ledger-tree-guide">↳</span>' : '') +
      '<span class="name">' + escHtml(book.name) + '</span>' +
      (book.id === ledgerData.selectedId ? '<span class="kind">当前</span>' :
        (children.length ? '<span class="kind">' + children.length + ' 项</span>' : '')) +
      '<span class="amount">' + ledgerMoney(ledgerMonthTotalForBook(book.id)) + '</span></button></div>';
    if (!collapsed) html += ledgerTreeHtml(book.id, depth + 1);
  });
  return html;
}

function toggleLedgerNode(id){
  ledgerCollapsed[id] = !ledgerCollapsed[id];
  renderLedgerPage();
}

function ledgerMoney(value){
  return '¥' + (Number(value) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ledgerRecordTime(record){
  if (!record.createdAt) return '旧记录 · 时间未记录';
  var d = new Date(record.createdAt);
  if (isNaN(d.getTime())) return '旧记录 · 时间未记录';
  return '记录于 ' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) + ' ' +
    pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

function renderLedgerPage(){
  if (!ledgerData) return;
  var book = currentLedgerBook();
  var subtree = ledgerSubtreeBooks(book.id);
  var entries = [];
  each(subtree, function(owner){
    each(owner.records, function(record){ entries.push({ owner: owner, record: record }); });
  });
  var now = new Date();
  var monthPrefix = now.getFullYear() + '-' + pad2(now.getMonth() + 1);
  var today = wTodayStr();
  var monthTotal = 0, todayTotal = 0, bookTotal = 0, monthCount = 0;
  each(entries, function(entry){
    var r = entry.record;
    bookTotal += r.amount;
    if (String(r.date).indexOf(monthPrefix) === 0) { monthTotal += r.amount; monthCount++; }
    if (r.date === today) todayTotal += r.amount;
  });
  setTxt('ledger-month-total', monthTotal.toFixed(2));
  setTxt('ledger-summary', monthCount + ' 笔记录 · ' + book.name +
    (subtree.length > 1 ? '（含 ' + (subtree.length - 1) + ' 个子事件）' : ''));
  setTxt('ledger-today-total', ledgerMoney(todayTotal));
  setTxt('ledger-book-total', ledgerMoney(bookTotal));
  setTxt('ledger-branch-path', ledgerBookPath(book));
  renderLedgerMonths();

  byId('ledger-tree-summary').textContent = ledgerBookPath(book) + ' · ' + ledgerData.books.length + ' 个事件';
  byId('ledger-tree').innerHTML = ledgerTreeHtml(null, 0);

  var records = entries.slice().sort(function(a, b){
    var at = a.record.createdAt ? new Date(a.record.createdAt).getTime() : 0;
    var bt = b.record.createdAt ? new Date(b.record.createdAt).getTime() : 0;
    return String(b.record.date).localeCompare(String(a.record.date)) || bt - at;
  });
  setTxt('ledger-record-count', records.length + ' 笔');
  byId('ledger-list').innerHTML = records.length ? records.map(function(entry){
    var r = entry.record;
    var owner = entry.owner.id !== book.id ? ' · ' + escHtml(entry.owner.name) : '';
    return '<div class="ledger-record">' +
      '<span class="ledger-cat">' + escHtml((r.tag || '未分类').slice(0, 2)) + '</span>' +
      '<span class="ledger-main"><b>' + escHtml(r.note || r.tag) + '</b><span>' +
      workoutDateLabel(r.date) + ' · ' + ledgerRecordTime(r) + owner + '</span></span>' +
      '<span class="ledger-amount"><b>' + ledgerMoney(r.amount) + '</b>' +
      '<span><button' + actionAttrs('editLedgerRecord', [r.id]) + '>编辑</button>' +
      '<button' + actionAttrs('deleteLedgerRecord', [r.id]) + '>删除</button></span></span></div>';
  }).join('') : '<div class="ledger-empty">这个事件还没有记录<br>点击“记一笔”开始</div>';
  renderDashboard();
}

function selectLedgerBook(id){
  ledgerData.selectedId = id;
  saveLedgerState();
  renderLedgerPage();
}

function openLedgerBookSheet(parentId){
  ledgerNewParentId = parentId || null;
  var parent = ledgerNewParentId ? ledgerBookById(ledgerNewParentId) : null;
  openSheet(
    '<h3>' + (parent ? '新建子事件' : '新建根事件') + '</h3>' +
    '<p>' + (parent ? '子事件挂在「' + escHtml(parent.name) + '」下面，金额会汇总到父事件。' : '例如旅行、装修、日常，每笔记录都会归入当前事件。') + '</p>' +
    '<input class="todo-form-input" id="ledger-book-name" maxlength="16" placeholder="' + (parent ? '子事件名称' : '根事件名称') + '">' +
    '<div class="row"><button class="ghost"' + actionAttrs('closeSheet') + '>取消</button>' +
    '<button class="primary"' + actionAttrs('saveLedgerBook') + '>创建</button></div>'
  );
}

function saveLedgerBook(){
  var name = byId('ledger-book-name').value.trim();
  if (!name) { toast('请输入事件名称'); return; }
  var id = 'book_' + Date.now().toString(36);
  ledgerData.books.push({ id: id, name: name, parentId: ledgerNewParentId || null, records: [] });
  if (ledgerNewParentId) delete ledgerCollapsed[ledgerNewParentId];
  ledgerData.selectedId = id;
  saveLedgerState();
  closeSheet();
  renderLedgerPage();
  toast(ledgerNewParentId ? '子事件已创建' : '根事件已创建');
  ledgerNewParentId = null;
}

function renderLedgerTags(){
  var box = byId('ledger-tags');
  if (!box) return;
  box.innerHTML = ledgerData.tags.map(function(tag){
    return '<button type="button" class="ledger-tag' + (tag === ledgerPickedTag ? ' on' : '') +
      '"' + actionAttrs('pickLedgerTag', [tag]) + '>' + escHtml(tag) + '</button>';
  }).join('');
}

function pickLedgerTag(tag){
  ledgerPickedTag = ledgerPickedTag === tag ? '' : tag;
  renderLedgerTags();
}

function openLedgerRecord(recordId){
  var book = currentLedgerBook(), record = null;
  if (recordId) {
    var owner = ledgerRecordOwner(recordId);
    if (!owner) return;
    book = owner.book;
    record = owner.record;
  }
  editingLedgerRecordId = recordId || null;
  editingLedgerBookId = record ? book.id : null;
  ledgerPickedTag = record ? record.tag : (ledgerPickedTag || (ledgerData.tags[0] || ''));
  var now = new Date();
  openSheet(
    '<h3>' + (record ? '修改记录' : '记一笔') + '</h3>' +
    '<p>' + escHtml(book.name) + ' · 保存时自动记录当前时间</p>' +
    '<div class="ledger-form-money"><span>¥</span><input id="ledger-amount" inputmode="decimal" placeholder="0.00" value="' + (record ? record.amount : '') + '"></div>' +
    '<label class="todo-form-label">分类</label><div class="ledger-tag-list" id="ledger-tags"></div>' +
    '<input class="ledger-tag-input" id="ledger-new-tag" maxlength="12" placeholder="或输入一个新分类">' +
    '<label class="todo-form-label">日期</label><input class="todo-form-input" type="date" id="ledger-date" value="' + (record ? record.date : wTodayStr()) + '">' +
    '<label class="todo-form-label">备注</label><input class="todo-form-input" id="ledger-note" maxlength="60" placeholder="可不填" value="' + escHtml(record ? record.note : '') + '">' +
    '<div class="ledger-current-time">记录时间：' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds()) + (record ? '（修改时保留原记录时间）' : '') + '</div>' +
    '<div class="row"><button class="ghost"' + actionAttrs('closeSheet') + '>取消</button>' +
    '<button class="primary"' + actionAttrs('saveLedgerRecord') + '>' + (record ? '保存修改' : '保存这笔') + '</button></div>'
  );
  renderLedgerTags();
  byId('ledger-amount').focus();
}

function saveLedgerRecord(){
  var amount = Math.round((parseFloat(byId('ledger-amount').value) || 0) * 100) / 100;
  if (!(amount > 0)) { toast('请输入正确金额'); return; }
  var book = editingLedgerBookId ? ledgerBookById(editingLedgerBookId) : currentLedgerBook();
  if (!book) book = currentLedgerBook();
  var customTag = byId('ledger-new-tag').value.trim();
  var tag = customTag || ledgerPickedTag || '未分类';
  var date = byId('ledger-date').value || wTodayStr();
  var note = byId('ledger-note').value.trim();
  if (ledgerData.tags.indexOf(tag) < 0) ledgerData.tags.push(tag);

  if (editingLedgerRecordId) {
    each(book.records, function(r){
      if (r.id === editingLedgerRecordId) {
        r.amount = amount; r.tag = tag; r.date = date; r.note = note;
      }
    });
  } else {
    book.records.push({
      id: 'record_' + Date.now().toString(36),
      amount: amount,
      tag: tag,
      date: date,
      note: note,
      createdAt: new Date().toISOString()
    });
  }
  ledgerPickedTag = tag;
  saveLedgerState();
  closeSheet();
  renderLedgerPage();
  toast(editingLedgerRecordId ? '记录已修改' : '已记下 ' + ledgerMoney(amount));
  editingLedgerRecordId = null;
  editingLedgerBookId = null;
}

function editLedgerRecord(id){ openLedgerRecord(id); }

function deleteLedgerRecord(id){
  appConfirm('删除这笔记录？', function(){
    var owner = ledgerRecordOwner(id);
    if (!owner) return;
    owner.book.records = owner.book.records.filter(function(r){ return r.id !== id; });
    saveLedgerState();
    renderLedgerPage();
    toast('记录已删除');
  }, { title: '删除记录' });
}

function parseCsvRows(text){
  text = String(text || '').replace(/^\uFEFF/, '');
  var rows = [], row = [], field = '', quoted = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i), next = text.charAt(i + 1);
    if (quoted) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field);
      if (row.some(function(v){ return String(v).trim() !== ''; })) rows.push(row);
      row = []; field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  row.push(field);
  if (row.some(function(v){ return String(v).trim() !== ''; })) rows.push(row);
  return rows;
}

function ledgerFindChild(parentId, name){
  for (var i = 0; i < ledgerData.books.length; i++) {
    var book = ledgerData.books[i];
    if ((book.parentId || null) === (parentId || null) && book.name === name) return book;
  }
  return null;
}

function ensureLedgerPath(pathText){
  var parts = String(pathText || '').split('/').map(function(v){ return v.trim(); }).filter(Boolean);
  if (!parts.length) parts = ['导入账本'];
  var parentId = null, book = null;
  each(parts, function(name){
    book = ledgerFindChild(parentId, name);
    if (!book) {
      book = { id: 'book_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6), name: name, parentId: parentId, records: [] };
      ledgerData.books.push(book);
    }
    parentId = book.id;
  });
  return book;
}

function ledgerRecordSignature(pathText, date, tag, amount, note){
  return [pathText, date, tag, Number(amount).toFixed(2), note || ''].join('\u001f');
}

function importLedgerCsvText(text){
  var rows = parseCsvRows(text);
  if (rows.length < 2) throw new Error('CSV 没有可导入的数据');
  var header = rows[0].map(function(v){ return String(v).trim(); });
  var pos = {
    event: header.indexOf('事件'),
    date: header.indexOf('日期'),
    tag: header.indexOf('分类'),
    amount: header.indexOf('金额'),
    note: header.indexOf('备注'),
    recordedAt: header.indexOf('记录时间')
  };
  if (pos.event < 0 || pos.date < 0 || pos.amount < 0) throw new Error('CSV 缺少事件、日期或金额列');

  var existing = {};
  each(ledgerData.books, function(book){
    each(book.records, function(record){
      var sig = ledgerRecordSignature(ledgerBookPath(book), record.date, record.tag, record.amount, record.note);
      existing[sig] = (existing[sig] || 0) + 1;
    });
  });
  var seen = {}, imported = 0, skipped = 0, firstBook = null;
  for (var r = 1; r < rows.length; r++) {
    var row = rows[r];
    var pathText = String(row[pos.event] || '').trim();
    var date = String(row[pos.date] || '').trim();
    var amount = Math.round(Number(String(row[pos.amount] || '').replace(/[^\d.\-]/g, '')) * 100) / 100;
    var tag = String(pos.tag >= 0 ? (row[pos.tag] || '未分类') : '未分类').trim() || '未分类';
    var note = String(pos.note >= 0 ? (row[pos.note] || '') : '').trim();
    if (!pathText || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !(amount > 0)) continue;
    var sig = ledgerRecordSignature(pathText, date, tag, amount, note);
    seen[sig] = (seen[sig] || 0) + 1;
    if (seen[sig] <= (existing[sig] || 0)) { skipped++; continue; }
    var book = ensureLedgerPath(pathText);
    if (!firstBook) firstBook = book;
    book.records.push({
      id: 'record_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6),
      amount: amount,
      tag: tag,
      date: date,
      note: note,
      createdAt: pos.recordedAt >= 0 ? String(row[pos.recordedAt] || '').trim() : '',
      imported: true
    });
    if (ledgerData.tags.indexOf(tag) < 0) ledgerData.tags.push(tag);
    imported++;
  }
  if (!imported && !skipped) throw new Error('没有找到有效的账目记录');
  if (firstBook) {
    var selected = firstBook;
    while (selected.parentId) selected = ledgerBookById(selected.parentId) || selected;
    ledgerData.selectedId = selected.id;
  }
  saveLedgerState();
  renderLedgerPage();
  return { imported: imported, skipped: skipped, total: rows.length - 1 };
}

function showLedgerImportResult(result){
  openSheet(
    '<h3>导入完成</h3>' +
    '<p>新导入 ' + result.imported + ' 笔，跳过已有 ' + result.skipped + ' 笔。' +
    '如果原文件包含“事件 / 子事件”路径，已自动重建对应层级。</p>' +
    '<div class="row"><button class="primary" style="flex:1"' + actionAttrs('closeSheet') + '>完成</button></div>'
  );
}

function receiveImportedCsv(text){
  try {
    showLedgerImportResult(importLedgerCsvText(text));
  } catch (e) {
    toast('导入失败：' + e.message);
  }
}

function chooseLedgerCsv(){
  if (byId('sheet').classList.contains('on')) closeSheet();
  if (window.AppNative && window.AppNative.pickCsvFile) {
    window.AppNative.pickCsvFile();
    return;
  }
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,text/csv';
  input.onchange = function(){
    var file = input.files && input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(){ receiveImportedCsv(String(reader.result || '')); };
    reader.onerror = function(){ toast('读取 CSV 失败'); };
    reader.readAsText(file, 'utf-8');
  };
  input.click();
}

function csvCell(value){
  var text = String(value == null ? '' : value);
  return '"' + text.replace(/"/g, '""') + '"';
}

function weekdayText(date){
  var d = todoDateObject(date);
  return '星期' + '日一二三四五六'.charAt(d.getDay());
}

function buildLedgerCsv(){
  var book = currentLedgerBook();
  var entries = [];
  each(ledgerSubtreeBooks(book.id), function(owner){
    each(owner.records, function(record){
      entries.push({
        book: owner, record: record,
        createdAt: record.createdAt ? new Date(record.createdAt).getTime() : 0
      });
    });
  });
  entries.sort(function(a, b){
    return String(a.record.date).localeCompare(String(b.record.date)) ||
      a.createdAt - b.createdAt ||
      String(a.record.id).localeCompare(String(b.record.id));
  });
  var lines = [['事件','日期','星期','分类','金额','备注','记录时间'].join(',')];
  each(entries, function(entry){
    var r = entry.record;
    lines.push([
      csvCell(ledgerBookPath(entry.book).split(' / ').join(' / ')),
      csvCell(r.date),
      csvCell(weekdayText(r.date)),
      csvCell(r.tag),
      Number(r.amount).toFixed(2),
      csvCell(r.note || ''),
      csvCell(r.createdAt || '')
    ].join(','));
  });
  return { csv: '\uFEFF' + lines.join('\r\n'), count: entries.length, book: book };
}

function exportLedgerCsv(){
  if (byId('sheet').classList.contains('on')) closeSheet();
  var data = buildLedgerCsv();
  var filename = '事件账本-' + data.book.name + '-' + wTodayStr() + '.csv';
  if (window.AppNative && window.AppNative.saveFile) {
    try {
      var bytes = new TextEncoder().encode(data.csv), binary = '';
      for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      window.AppNative.saveFile(filename, btoa(binary), 'text/csv');
      toast('已导出 ' + data.count + ' 笔到下载目录');
    } catch (e) {
      toast('导出失败');
    }
    return;
  }
  var blob = new Blob([data.csv], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(url); }, 5000);
  toast('已导出 ' + data.count + ' 笔');
}

function deleteCurrentLedgerEvent(){
  var book = currentLedgerBook();
  if (!book) return;
  var subtree = ledgerSubtreeBooks(book.id);
  var ids = subtree.map(function(item){ return item.id; });
  var recordCount = subtree.reduce(function(total, item){ return total + item.records.length; }, 0);
  var parentId = book.parentId;
  appConfirm(
    '将删除「' + ledgerBookPath(book) + '」以及全部 ' + subtree.length +
    ' 个事件层级、' + recordCount + ' 笔账目。删除后不能恢复。',
    function(){
      ledgerData.books = ledgerData.books.filter(function(item){ return ids.indexOf(item.id) < 0; });
      each(ids, function(id){ delete ledgerCollapsed[id]; });
      if (!ledgerData.books.length) {
        ledgerData.books = ledgerDefaultState().books;
        ledgerData.selectedId = ledgerData.books[0].id;
      } else {
        var parent = parentId ? ledgerBookById(parentId) : null;
        ledgerData.selectedId = parent ? parent.id : ledgerData.books[0].id;
      }
      saveLedgerState();
      renderLedgerPage();
      toast('事件已删除');
    },
    { title: '删除整个事件分支', confirmLabel: '删除事件', onCancel: openLedgerMenu }
  );
}

function openLedgerMenu(){
  openSheet(
    '<h3>事件与数据</h3>' +
    '<p>新建事件，或导入、导出当前事件树的数据。</p>' +
    '<button class="primary" style="width:100%;margin-bottom:8px"' + actionAttrs('openLedgerBookSheet') + '>＋ 新建根事件</button>' +
    '<button class="ghost" style="width:100%;margin-bottom:8px"' + actionAttrs('chooseLedgerCsv') + '>导入 CSV</button>' +
    '<button class="ghost" style="width:100%;margin-bottom:8px"' + actionAttrs('exportLedgerCsv') + '>导出当前事件及子事件 CSV</button>' +
    '<button class="danger" style="width:100%;margin-bottom:8px"' + actionAttrs('deleteCurrentLedgerEvent') + '>删除当前事件及子事件</button>' +
    '<div class="row"><button class="ghost" style="flex:1"' + actionAttrs('closeSheet') + '>关闭</button></div>'
  );
}

function initLedger(){
  loadLedgerState();
  byId('btn-ledger-add').addEventListener('click', function(){ openLedgerRecord(); });
  byId('btn-ledger-new-book').addEventListener('click', openLedgerMenu);
  byId('btn-ledger-add-child').addEventListener('click', function(){ openLedgerBookSheet(currentLedgerBook().id); });
  renderLedgerPage();
}
