import fs from 'fs';
import path from 'path';

const root = process.cwd();
const moveList = [];

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === '.next' || file === '.git') continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath);
    } else {
      const relPath = path.relative(root, fullPath).replace(/\\/g, '/');
      planMove(relPath);
    }
  }
}

function planMove(file) {
  // Ignore root config files
  if (!file.includes('/')) return;
  if (file.startsWith('prisma/')) return;
  if (file.startsWith('.vscode/')) return;
  if (file.startsWith('.agents/')) return;
  
  let newPath = file;
  
  // 1. src/app -> app/ (thin wrappers)
  if (file.startsWith('src/app/')) {
    newPath = file.replace(/^src\/app\//, 'app/');
  }
  
  // 2. backend/actions -> backend/api/actions
  if (file.startsWith('backend/actions/')) {
    newPath = file.replace(/^backend\/actions\//, 'backend/api/actions/');
  }
  
  // 3. backend/scripts -> backend/lib/scripts
  if (file.startsWith('backend/scripts/')) {
    newPath = file.replace(/^backend\/scripts\//, 'backend/lib/scripts/');
  }
  
  // 4. backend/services -> backend/lib/services
  if (file.startsWith('backend/services/')) {
    newPath = file.replace(/^backend\/services\//, 'backend/lib/services/');
  }
  
  if (file !== newPath) {
    moveList.push(`${file} -> ${newPath}`);
  }
}

walk(root);

fs.writeFileSync('move-plan.txt', moveList.join('\n'));
console.log(`Generated plan for ${moveList.length} files.`);
