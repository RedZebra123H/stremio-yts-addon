const { serveHTTP } = require('stremio-addon-sdk');
const addonInterface = require('./addon');
const { startAutoRefresh } = require('./lib/trackers');

const PORT = process.env.PORT || 7000;

// Pull the latest tracker list now, then refresh periodically.
startAutoRefresh();

serveHTTP(addonInterface, { port: PORT });

console.log(`\nYTS Magnets addon is running.`);
console.log(`Install URL:  http://127.0.0.1:${PORT}/manifest.json`);
console.log(`In Stremio:   paste that URL into the search/addons box to install.\n`);
