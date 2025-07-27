const express = require('express');
const logger = require('morgan');
const webhookRouter = require('./webhook'); // Assuming webhook.js will be moved to api/

const app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/webhook', webhookRouter); // Mount the webhook router at /webhook

// Handle root path for Vercel
app.get('/', (req, res) => {
  res.send('API is running!');
});

module.exports = app;