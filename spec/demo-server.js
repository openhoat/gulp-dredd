'use strict';

var that = {
  start: function (opt, cb) {
    var http = require('http');
    if (typeof cb === 'undefined' && typeof opt === 'function') {
      cb = opt;
      opt = null;
    }
    opt = opt || {};
    that.server = http.createServer(function (req, res) {
      setTimeout(function () {
        console.log('req.url :', req.url);
        if (req.url === (opt.path || '/hello')) {
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({hello: 'world'}));
        } else {
          res.writeHead(404, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({
            code: 'NOT_FOUND',
            message: 'resource not found'
          }));
        }
      }, opt.latency || 1);
    });
    that.server.listen(opt.port || 3103, cb);
  },
  stop: function (cb) {
    if (!that.server) {
      return cb();
    }
    that.server.close(cb);
  }
};

exports = module.exports = that;