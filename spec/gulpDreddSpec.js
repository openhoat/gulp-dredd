'use strict';

var path = require('path')
  , chai = require('chai')
  , expect = chai.expect
  , assert = chai.assert
  , gulpDredd = require('../lib/gulp-dredd');

describe('gulp dredd', function () {

  it('should return a dredd gulp task object', function () {
    expect(gulpDredd).to.be.a('function');
  });

  describe('dredd names', function () {

    it('should return dredd transaction names', function (cb) {
      var opt;
      opt = {
        server: 'http://localhost:3103',
        options: {
          server: 'node lib/admin-server',
          names: true,
          sorted: true,
          path: path.join(__dirname, 'demo-api-doc.apib')
        }
      };
      gulpDredd(opt, function (err, result) {
        if (err) {
          assert.fail(err, undefined, err.message);
        }
        expect(result).to.be.ok;
        expect(result).to.have.property('tests', 2);
        expect(result).to.have.property('failures', 0);
        expect(result).to.have.property('errors', 0);
        cb();
      });
    });

  });

  describe('API tests', function () {
    var demoServer=require('./demo-server');

    before(demoServer.start.bind(demoServer));

    after(demoServer.stop.bind(demoServer));

    it('should execute dredd API tests', function (cb) {
      var opt;
      opt = {
        server: 'http://localhost:3103',
        options: {
          server: 'node lib/admin-server',
          sorted: true,
          path: path.join(__dirname, 'demo-api-doc.apib')
        }
      };
      gulpDredd(opt, function (err, result) {
        if (err) {
          assert.fail(err, undefined, err.message);
        }
        expect(result).to.be.ok;
        expect(result).to.have.property('tests', 2);
        expect(result).to.have.property('failures', 0);
        expect(result).to.have.property('errors', 0);
        cb();
      });
    });

  });

});