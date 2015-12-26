'use strict';

var that;

that = function (opt, cb) {
    var Dredd = require('dredd')
      , dredd = new Dredd(opt);
    dredd.run(cb);
};

exports = module.exports = that;