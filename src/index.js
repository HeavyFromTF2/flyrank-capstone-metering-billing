require('dotenv').config();

const express = require('express');
const app = express();

app.use(express.json());
app.use('/', require('./routes/generate'));

const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

