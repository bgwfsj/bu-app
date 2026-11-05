/* ============================================================
   8.8 稍后提醒
   ============================================================ */
var snoozeDraft = null;

function openSnoozeDialog(type, id, title){
  if ((type !== 'todo' && type !== 'standalone') || !id || !title) return;
  snoozeDraft = { type: type, id: String(id), title: String(title) };
  openSheet(
    '<h3>稍后提醒</h3>' +
    '<p>输入分钟后再次提醒。原来的待办或提醒周期不会改变。</p>' +
    '<div class="snooze-title">' + escHtml(snoozeDraft.title) + '</div>' +
    '<label class="todo-form-label">稍后多久</label>' +
    '<div class="snooze-input-wrap"><input class="todo-form-input" id="snooze-minutes" type="number" inputmode="numeric" min="1" max="1440" step="1" value="10"><span>分钟后</span></div>' +
    '<div class="row"><button class="ghost"' + actionAttrs('closeSheet') + '>取消</button>' +
    '<button class="primary"' + actionAttrs('saveSnooze') + '>稍后提醒</button></div>'
  );
  var input = byId('snooze-minutes');
  if (input) {
    input.addEventListener('keydown', function(e){
      if (e.key === 'Enter') {
        e.preventDefault();
        saveSnooze();
      }
    });
    input.focus();
    input.select();
  }
}

function saveSnooze(){
  if (!snoozeDraft) return;
  var minutes = parseInt(byId('snooze-minutes').value, 10);
  if (isNaN(minutes) || minutes < 1 || minutes > 1440) {
    toast('请输入 1 到 1440 分钟');
    return;
  }
  if (!window.AppNative || !window.AppNative.scheduleSnoozeNotification) {
    closeSheet();
    toast('网页预览不能安排稍后提醒');
    return;
  }
  var scheduled = window.AppNative.scheduleSnoozeNotification(
    snoozeDraft.type,
    snoozeDraft.id,
    snoozeDraft.title,
    minutes
  );
  if (!scheduled) {
    toast('安排稍后提醒失败，请检查通知权限');
    return;
  }
  closeSheet();
  toast(minutes + ' 分钟后再次提醒');
  snoozeDraft = null;
}
