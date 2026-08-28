const express = require('express');
const router = express.Router();
const {
  getTermsAndConditions,
  getPrivacyPolicy,
  getAppInfo
} = require('../../controllers/legalController');

// Public Legal & App Info endpoints
router.get('/terms', getTermsAndConditions);
router.get('/privacy', getPrivacyPolicy);
router.get('/about', getAppInfo);

module.exports = router;
