const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const jsDir = path.join(__dirname, '..', 'js');
const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));

let errors = 0;
files.forEach(f => {
  const full = path.join(jsDir, f);
  try {
    execSync(`node -c "${full}"`);
    console.log(`OK: ${f}`);
  } catch (err) {
    console.error(`ERROR in ${f}:`, err.message);
    errors++;
  }
});

if (errors === 0) {
  console.log(`\nALL ${files.length} JS MODULES PASSED SYNTAX CHECK SUCCESSFULLY!`);
} else {
  console.error(`\nFAILED: ${errors} file(s) have syntax errors.`);
  process.exit(1);
}
