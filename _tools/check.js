const fs=require('fs'), path=require('path');
// 相对本文件定位，改名/移动目录都不用改这里
const p=path.join(__dirname,'..','quit-app.html');
const h=fs.readFileSync(p,'utf8');
const s=h.lastIndexOf('<script>')+8, e=h.lastIndexOf('</script>');
try {
  new Function(h.substring(s,e));
  console.log('JS OK');
} catch(x) {
  console.error('JS ERR:', x.message);
  process.exitCode = 1;
}
if (h.includes('__APP_STYLES__') || h.includes('__APP_SCRIPTS__')) {
  console.error('BUILD ERR: placeholders were not replaced');
  process.exitCode = 1;
}
if (/\son(?:click|change|input|submit)=/i.test(h)) {
  console.error('BUILD ERR: inline event handler found');
  process.exitCode = 1;
}
console.log('size', h.length);
