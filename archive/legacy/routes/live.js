var express = require('express');
var router = express.Router();
const path = require('path');

/* GET home page. */
router.get('/', function (req, res, next) {
  res.sendFile(path.join(__dirname + '/../views/live.html'));
});

/* GET live page with note ID */
router.get('/:noteId', function (req, res, next) {
  res.sendFile(path.join(__dirname + '/../views/live.html'));
});

/* GET live page with compound paths (e.g., nprofile/live/event-id) */
router.get('/:nprofile/live/:eventId', function (req, res, next) {
  res.sendFile(path.join(__dirname + '/../views/live.html'));
});

/* Catch-all route for any other live path structure */
router.get('/*', function (req, res, next) {
  res.sendFile(path.join(__dirname + '/../views/live.html'));
});

module.exports = router;
