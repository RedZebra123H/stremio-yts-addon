const { serveHTTP } = require('stremio-addon-sdk');
const addonInterface = require('./addon');

const PORT = process.env.PORT || 7000;

serveHTTP(addonInterface, { port: PORT });

console.log(`\nYTS Magnets addon is running.`);
console.log(`Install URL:  http://127.0.0.1:${PORT}/manifest.json`);
console.log(`In Stremio:   paste that URL into the search/addons box to install.\n`);
