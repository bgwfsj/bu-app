import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = path.join(root, 'src', 'index.template.html');
const outputPath = path.join(root, 'quit-app.html');
const styleNames = [
  '00-base.css',
  '10-home.css',
  '15-settings.css',
  '20-todo.css',
  '25-reminder.css',
  '30-ledger.css',
  '40-fitness.css',
  '50-overlays.css',
  '60-clocks.css'
];
const scriptNames = [
  '00-core.js',
  '05-app-info.js',
  '10-quit-state.js',
  '20-clocks.js',
  '30-quit-settings.js',
  '40-navigation.js',
  '50-water.js',
  '60-fitness.js',
  '70-todo.js',
  '75-reminder.js',
  '80-ledger.js',
  '85-snooze.js',
  '90-boot.js'
];

function readAll(dir, names) {
  return names.map((name) => {
    const file = path.join(root, 'src', dir, name);
    if (!fs.existsSync(file)) throw new Error(`Missing source file: ${file}`);
    return `/* ${name} */\n${fs.readFileSync(file, 'utf8').trimEnd()}\n`;
  }).join('\n');
}

let html = fs.readFileSync(templatePath, 'utf8');
const styles = readAll('styles', styleNames);
const scripts = readAll('js', scriptNames);
if (scripts.includes('</script>')) throw new Error('A JS module contains a closing script tag');
html = html.replace('/* __APP_STYLES__ */', styles);
html = html.replace('/* __APP_SCRIPTS__ */', scripts);
fs.writeFileSync(outputPath, html);
console.log(`Built ${path.basename(outputPath)} (${html.length} chars)`);
