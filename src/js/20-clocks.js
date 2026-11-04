/* ============================================================
   5. 倒计时皮肤：竖版翻页 / 竖版灯管 / 涟漪 / 风迹 / 流光
   ============================================================ */
var VIEWS = ['flip-v', 'neon-v', 'round', 'enso', 'flow'];
var VIEW_NAMES = {
  'flip-v': '翻页 · 竖版',
  'neon-v': '灯管 · 竖版',
  'round': '涟漪',
  'enso': '风迹',
  'flow': '流光'
};
var flipLen = 0;

function buildFlip(dlen){
  flipLen = dlen;
  function cells(n){
    var h = '';
    for (var i = 0; i < n; i++) h += '<div class="fc"><span class="fnum">0</span></div>';
    return h;
  }
  var row = byId('fliprow');
  if (!row) return;
  var g = function(n, label){
    return '<div class="fgroup" style="flex:' + n + ' 1 0"><div class="fcells">' +
      cells(n) + '</div><i>' + label + '</i></div>';
  };
  row.innerHTML = g(dlen, '天') + g(2, '时') + g(2, '分') + g(2, '秒');
}

function setFlipCells(str){
  var cells = document.querySelectorAll('#fliprow .fc');
  if (cells.length !== str.length) return;
  for (var i = 0; i < cells.length; i++) {
    var c = cells[i];
    var ch = str.charAt(i);
    if (c.getAttribute('data-v') === ch) continue;
    c.setAttribute('data-v', ch);
    var n = c.querySelector('.fnum');
    if (n) n.textContent = ch;
    c.classList.remove('flipping');
    void c.offsetWidth;
    c.classList.add('flipping');
  }
}

function updateFlip(days, hh, mm, ss){
  var ds = String(days);
  var dlen = ds.length < 2 ? 2 : ds.length;
  if (dlen !== flipLen) buildFlip(dlen);
  while (ds.length < dlen) ds = '0' + ds;
  setFlipCells(ds + hh + mm + ss);
}

function setView(v){
  if (v === 'modern' || v === 'modern-v' || v === 'stack') v = 'round';
  if (v === 'flip') v = 'flip-v';
  if (v === 'neon') v = 'neon-v';
  if (v === 'seal') v = 'enso';
  if (v === 'horizon') v = 'flow';
  if (VIEWS.indexOf(v) < 0) v = 'round';
  S.view = v;
  saveS();
  var box = byId('clocks');
  if (box) box.setAttribute('data-view', v);
  if (v.indexOf('flip') === 0 && flipLen === 0) buildFlip(2);
  fitClock();
}

/* 按可用宽度给数字算最大字号：两点测量法，位数变多也不会溢出 */
function grpSum(el){
  var gs = el.querySelectorAll('.grp'), t = 0;
  for (var i = 0; i < gs.length; i++) t += gs[i].getBoundingClientRect().width;
  return t;
}
/* 时钟区可用的高度 = 页面内容区 - 顶栏 - 下方文字块 */
function vertHeight(){
  var page = document.getElementById('p-quit');
  var top = page && page.querySelector('.top');
  var tb = page && page.querySelector('.textblock');
  var sectionHead = page && page.querySelector('.section-hero');
  if (!page || !tb || !page.clientHeight) return 0;
  var cs = getComputedStyle(page);
  var padT = parseFloat(cs.paddingTop) || 0;
  var padB = parseFloat(cs.paddingBottom) || 0;
  var topH = top ? top.offsetHeight : 0;
  return page.clientHeight - padT - padB - topH - (sectionHead ? sectionHead.offsetHeight : 0) - tb.offsetHeight - 24;
}
/* 翻页竖排：格子尺寸跟着可用空间走 */
function fitFlipV(){
  var row = document.getElementById('fliprow');
  if (!row || !row.offsetParent) return;
  var availW = row.clientWidth;
  var availH = vertHeight();
  if (!availW) return;
  var maxN = 2, gs = row.querySelectorAll('.fgroup');
  for (var g = 0; g < gs.length; g++) {
    var c = gs[g].querySelectorAll('.fc').length;
    if (c > maxN) maxN = c;
  }
  var cellH = availH > 120 ? (availH - 21) / 4 : 44;
  cellH = Math.max(34, Math.min(cellH, 96));
  var fnum = Math.round(cellH * 0.6);
  var labW = Math.max(26, Math.round(fnum * 0.82));
  var cellW = (availW - 2 * labW - 11 - 3 * (maxN - 1)) / maxN;
  cellW = Math.max(24, Math.min(cellW, cellH * 0.82));
  row.style.setProperty('--fch', cellH.toFixed(1) + 'px');
  row.style.setProperty('--fcw', cellW.toFixed(1) + 'px');
  row.style.setProperty('--fnum', fnum + 'px');
  row.style.setProperty('--flabw', labW + 'px');
}
function fitClock(){
  var boxes = document.getElementById('clocks');
  var mode = (boxes && boxes.getAttribute('data-view')) || 'round';
  var vert = /-v$/.test(mode);
  if (mode === 'flip-v') { fitFlipV(); return; }
  var clks = document.querySelectorAll('.clocks .clock');
  for (var i = 0; i < clks.length; i++) {
    var el = clks[i];
    if (!el.offsetParent) continue;                 // 隐藏的皮肤跳过
    var host = el.parentElement;                    // 各自皮肤的内层容器
    var avail = host.clientWidth * (vert ? 0.99 : 0.985);
    if (!avail) continue;
    var isNeon = el.classList.contains('nclock');
    var maxFs, minFs, w1, w2;
    if (vert) {
      // 竖排：按“剩余高度”算字号，屏幕越高字越大
      var availH = vertHeight();
      var elD = document.getElementById('n-d');
      var dn = Math.max(2, String(elD ? elD.textContent : '0').length);
      var byH = availH > 80 ? (availH - 12) / 4.16 : 40;
      var byW = (host.clientWidth * 0.64) / (dn * 0.56);
      var vfs = Math.min(byH, byW, 96);
      if (vfs < 26) vfs = 26;
      el.style.setProperty('--fs', Math.round(vfs) + 'px');
      // 保险：万一仍然撑出滚动条（阶段列表收起时），逐步缩到不溢出
      var pg = document.getElementById('p-quit');
      var st = document.getElementById('stages');
      var guard = 0;
      while (st && !st.open && pg.scrollHeight > pg.clientHeight + 1 && guard < 8 && vfs > 30) {
        vfs -= 4; guard++;
        el.style.setProperty('--fs', Math.round(vfs) + 'px');
      }
      continue;
    }
    maxFs = isNeon ? 100 : 96; minFs = isNeon ? 26 : 28;
    el.style.setProperty('--fs', '40px');
    w1 = grpSum(el);
    el.style.setProperty('--fs', '80px');
    w2 = grpSum(el);
    if (!w1 || !w2 || w2 <= w1) continue;           // 量不到就保留 CSS 默认
    var slope = (w2 - w1) / 40;                     // 每 1px 字号增加多少宽度
    var fs = 40 + (avail - w1) / slope;
    if (fs < minFs) fs = minFs;
    if (fs > maxFs) fs = maxFs;
    el.style.setProperty('--fs', fs.toFixed(1) + 'px');
  }
}
window.addEventListener('resize', fitClock);
