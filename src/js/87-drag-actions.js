/* ============================================================
   8.9 待办与提醒拖拽
   ============================================================ */
var dragGesture = null;

function resetDragGesture(clearTransform){
  if (!dragGesture) return;
  clearTimeout(dragGesture.timer);
  var row = dragGesture.row;
  if (row) {
    row.classList.remove('dragging', 'drag-holding', 'drag-left', 'drag-right');
    row.removeAttribute('data-drag-hint');
    if (clearTransform) row.style.transform = '';
  }
  dragGesture = null;
}

function dragHintFor(kind, state, direction){
  if (state === 'active') {
    return direction === 'left' ? '松开归档' : '';
  }
  if (direction === 'left') return '松开彻底删除';
  if (direction === 'right') return '松开移回';
  return '';
}

function applyDragGestureAction(kind, state, id, direction){
  if (!direction) return;
  if (kind === 'todo') {
    if (state === 'active' && direction === 'left') archiveTodoNow(id);
    if (state === 'archive' && direction === 'right') restoreTodo(id);
    if (state === 'archive' && direction === 'left') permanentDeleteTodo(id);
    return;
  }
  if (kind === 'reminder') {
    if (state === 'active' && direction === 'left') archiveReminderNow(id);
    if (state === 'archive' && direction === 'right') restoreReminder(id);
    if (state === 'archive' && direction === 'left') permanentDeleteReminder(id);
  }
}

function bindDragGestures(){
  var app = byId('app');
  if (!app || app._dragBound) return;
  app._dragBound = true;

  app.addEventListener('pointerdown', function(e){
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('button,input,select,textarea,a')) return;
    var row = e.target.closest('[data-drag-kind][data-drag-state][data-drag-id]');
    if (!row) return;
    resetDragGesture(true);
    dragGesture = {
      row: row,
      kind: row.getAttribute('data-drag-kind'),
      state: row.getAttribute('data-drag-state'),
      id: row.getAttribute('data-drag-id'),
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      activated: false,
      holding: false,
      timer: setTimeout(function(){
        if (!dragGesture || dragGesture.row !== row) return;
        dragGesture.holding = true;
        dragGesture.activated = true;
        row.classList.add('drag-holding');
        try { row.setPointerCapture(dragGesture.pointerId); } catch (error) {}
        if (navigator.vibrate) navigator.vibrate(10);
      }, 320)
    };
  });

  app.addEventListener('pointermove', function(e){
    if (!dragGesture || dragGesture.pointerId !== e.pointerId) return;
    var dx = e.clientX - dragGesture.startX;
    var dy = e.clientY - dragGesture.startY;
    if (!dragGesture.activated) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        resetDragGesture(true);
        return;
      }
      if (Math.abs(dx) < 7) return;
      dragGesture.activated = true;
      clearTimeout(dragGesture.timer);
      try { dragGesture.row.setPointerCapture(e.pointerId); } catch (error) {}
    }
    e.preventDefault();
    var limit = Math.max(76, window.innerWidth * 0.28);
    var shifted = Math.max(-limit, Math.min(limit, dx));
    var direction = shifted < -24 ? 'left' : (shifted > 24 ? 'right' : '');
    dragGesture.row.classList.add('dragging');
    dragGesture.row.classList.toggle('drag-left', direction === 'left');
    dragGesture.row.classList.toggle('drag-right', direction === 'right');
    dragGesture.row.style.transform = 'translateX(' + shifted + 'px)';
    var hint = dragHintFor(dragGesture.kind, dragGesture.state, direction);
    if (hint) dragGesture.row.setAttribute('data-drag-hint', hint);
    else dragGesture.row.removeAttribute('data-drag-hint');
  });

  function finish(e){
    if (!dragGesture || dragGesture.pointerId !== e.pointerId) return;
    var dx = e.clientX - dragGesture.startX;
    var kind = dragGesture.kind;
    var state = dragGesture.state;
    var id = dragGesture.id;
    var direction = dx <= -70 ? 'left' : (dx >= 70 ? 'right' : '');
    resetDragGesture(true);
    if (direction) applyDragGestureAction(kind, state, id, direction);
  }

  app.addEventListener('pointerup', finish);
  app.addEventListener('pointercancel', function(e){
    if (dragGesture && dragGesture.pointerId === e.pointerId) resetDragGesture(true);
  });
}
