const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const jsDir = path.join(__dirname, '..', 'js');
let files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).map(f => ({ name: f, full: path.join(jsDir, f) }));

// Incluir recursivamente submódulos como js/wind/
const windDir = path.join(jsDir, 'wind');
if (fs.existsSync(windDir)) {
  const windFiles = fs.readdirSync(windDir).filter(f => f.endsWith('.js')).map(f => ({
    name: 'wind/' + f,
    full: path.join(windDir, f)
  }));
  files = files.concat(windFiles);
}

let errors = 0;
files.forEach(item => {
  try {
    execSync(`node -c "${item.full}"`);
    console.log(`OK: ${item.name}`);
  } catch (err) {
    console.error(`ERROR in ${item.name}:`, err.message);
    errors++;
  }
});

if (errors === 0) {
  console.log(`\nALL ${files.length} JS MODULES PASSED SYNTAX CHECK SUCCESSFULLY!`);
} else {
  console.error(`\nFAILED: ${errors} file(s) have syntax errors.`);
  process.exit(1);
}
