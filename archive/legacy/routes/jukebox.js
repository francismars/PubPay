var express = require('express');
var router = express.Router();
const path = require('path');

/* GET jukebox page. */
router.get('/', function (req, res, next) {
  res.sendFile(path.join(__dirname + '/../views/jukebox.html'));
});

module.exports = router;
