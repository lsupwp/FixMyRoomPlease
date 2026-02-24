const express = require('express');

const router = express.Router();

// Home page route
router.get('/', (req, res) => {
  res.render('tenant/home', { title: 'Home', error: null });
});

module.exports = router;