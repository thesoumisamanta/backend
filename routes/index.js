const express = require('express');
const router = express.Router();
const v1Router = require('./v1');

// Mount strict versioned API routes under /v1 ONLY
router.use('/v1', v1Router);

module.exports = router;
