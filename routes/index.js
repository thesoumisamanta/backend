const express = require('express');
const router = express.Router();
const v1Router = require('./v1');

// Mount production versioned routes: /api/v1/...
router.use('/v1', v1Router);

// Backward compatibility mount for unversioned requests: /api/...
router.use('/', v1Router);

module.exports = router;
