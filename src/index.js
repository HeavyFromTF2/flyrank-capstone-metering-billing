require('dotenv').config();

const express = require('express');
const app = express();

// Webhook route MUST be registered before express.json(),
// because it needs the raw body for signature verification before the json
app.use('/', require('./routes/webhooks'));

app.use(express.json());
app.use('/', require('./routes/generate'));
app.use('/', require('./routes/checkout')); 

const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

