/*
 * Real entry point — starts the server. Split from app.js so tests can
 * import the app without this file's app.listen() opening a real port.
 */

const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});