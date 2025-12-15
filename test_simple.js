// Test minimal imports
console.log('1. Importing config...');
const cfg = await import('./config.js');
console.log('   ✅ config imported. ACCESS_TOKEN present:', !!cfg.ACCESS_TOKEN);

console.log('2. Importing database...');
const db = await import('./scripts/database.js');
console.log('   ✅ database imported');

console.log('3. Importing menu...');
const menu = await import('./scripts/menu.js');
console.log('   ✅ menu imported');

console.log('\n✅ All imports successful! App should run.');
