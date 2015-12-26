'use strict';

var _ = require('lodash')
  , aglio = require('gulp-aglio')
  , chalk = require('chalk')
  , checkstyleReporter = require('gulp-jshint-checkstyle-reporter')
  , concat = require('gulp-concat')
  , debug = require('gulp-debug')
  , del = require('del')
  , Dredd = require('dredd')
  , glob = require('glob-all')
  , gulp = require('gulp')
  , gulpif = require('gulp-if')
  , gutil = require('gulp-util')
  , istanbul = require('gulp-istanbul')
  , jshint = require('gulp-jshint')
  , jsoncombine = require('gulp-jsoncombine')
  , jsonFormat = require('gulp-json-format')
  , licenseFinder = require('gulp-license-finder')
  , minimist = require('minimist')
  , mkdirp = require('mkdirp')
  , mocha = require('gulp-mocha')
  , notify = require('gulp-notify')
  , p = require('hw-promise')
  , path = require('path')
  , replace = require('gulp-replace')
  , shell = require('gulp-shell')
  , fs = p.promisifyAll(require('fs'))
  , request = p.promisify(require('request'), {multiArgs: true})
  , f = require('util').format.bind(null)
  , pkg = require('./package')
  , jsdocCmdPath = require.resolve('jsdoc/jsdoc.js')
  , jsdocInkDocstrap = require.resolve('ink-docstrap')
  , $, cmdOpt, taskSpecs, config, ciMode;

process.env['NODE_ENV'] = 'test';
ciMode = !!process.env['JENKINS_URL'];

function log(newLine) {
  var args = Array.prototype.slice.call(arguments);
  if (typeof args[0] === 'boolean') {
    args.shift();
  }
  process.stdout.write(f.apply(null, args));
  if (newLine !== false) {
    process.stdout.write('\n');
  }
}

function toRelativePath(file, baseDir) {
  if (Array.isArray(file)) {
    return file.map(function (file) {
      return toRelativePath(file);
    });
  } else {
    return path.relative(baseDir || __dirname, file);
  }
}

function toArray(s, sep, format) {
  return s.split(sep || ',').map(function (item) {
    return f(format || '%s', item.trim());
  });
}

function rm(src) {
  return del([src], {dryRun: cmdOpt['dry-run']})
    .then(function (files) {
      if (cmdOpt.verbose) {
        gutil.log(files && files.length ? $.yellow(f('Files and folders deleted :', toRelativePath(files).join(', '))) : $.yellow(f('Nothing deleted')));
      }
    });
}

cmdOpt = minimist(process.argv.slice(2), {
  string: ['include', 'transaction', 'log-level'],
  boolean: ['log-body', 'dry-run', 'verbose', 'color'],
  default: {color: true},
  alias: {
    i: 'include',
    t: 'transaction',
    l: 'log-body',
    d: 'dry-run',
    v: 'verbose',
    n: 'notify'
  }
});

if (cmdOpt['dry-run'] || cmdOpt['log-body']) {
  cmdOpt.verbose = true;
}
if (cmdOpt['log-level']) {
  process.env['HW_LOG_LEVEL'] = cmdOpt['log-level'];
}
$ = new chalk.constructor({enabled: cmdOpt.color});
process.env['HW_LOG_COLORS'] = cmdOpt.color;

config = {
  distDir: 'dist',
  reportDir: 'dist/reports',
  testReportDir: 'dist/reports/test',
  dreddTestReportDir: 'dist/reports/dredd-test',
  assetsDir: 'assets',
  files: {
    allJs: [
      '**/*.js',
      '!**/deprecated/**', '!**/*.deprecated.js',
      '!dist/**',
      '!etc/**',
      '!lib_old/**',
      '!node_modules/**',
      '!tmp/**'
    ]
  },
  apidoc: {
    mdDocs: '_header root roles users apis resources routes apps subscriptions payment-card activations invoices schemas dbstore jobs config server version'
  },
  dredd: {
    server: 'http://localhost:3102',
    options: {
      level: 'info'
    }
  },
  notifier: ciMode || !cmdOpt.notify ? null : {
    onLast: true,
    title: f('%s/%s - Gulp notification', pkg.name, pkg.version),
    message: 'Done',
    icon: path.join(__dirname, 'assets/laposte.ico'),
    sound: false
  },
  test: {
    src: [
      'spec/*Spec.js',
      '!**/deprecated/**', '!**/*.deprecated.js',
      '!spec/clusterSpec.js'
    ]
  }
};

_.merge(config, {
  apiary: {
    server: 'https://api.apiary.io/blueprint/publish/lpapim',
    token: 'cc950451206288231ea0dcb3e0d958b6'
  },
  apidoc: {
    src: toArray(config.apidoc.mdDocs, ' ', 'doc/api/admin/%s.md'),
    privatePattern: /(<!--private-begin-->\n)([\s\S]*)(\n<!--private-end-->[\n]?)/g,
    schemaPattern: /(\+ Response 200.*[\n]{2,}[ ]{4}.*\+ Body.*[\n]{2,})(([ ]{8}.*[\n])*)/g
  },
  dredd: {
    options: {
      server: 'node lib/admin-server',
      hookfiles: 'test/dredd/hooks/*',
      sorted: true,
      color: cmdOpt.color,
      reporter: ciMode ? 'junit' : '',
      path: cmdOpt.include ?
        toArray(cmdOpt.include, ',', path.join(config.distDir, 'aglio/doc/api/admin/%s.md')) :
        path.join(config.distDir, 'aglio/lpapim-admin.apib')
    },
    custom: {
      hooks: {verbose: cmdOpt.verbose}
    },
    coverage: {
      src: config.test.src,
      instrument: {
        pattern: [
          'config/**/*.js',
          'lib/**/*.js',
          '!**/deprecated/**', '!**/*.deprecated.js',
          '!lib/admin-cluster.js', '!lib/api-cluster.js', '!lib/services/cluster.js'
        ],
        options: {
          includeUntested: true
        }
      },
      reporters: ['text', 'html', 'lcov'],
      reporter: {
        options: {
          html: {
            file: 'coverage.html',
            dir: path.join(config.reportDir, 'dredd-coverage/html')
          },
          lcov: {
            file: 'lcov.info',
            dir: path.join(config.reportDir, 'dredd-coverage/lcov')
          }
        }
      }
    }
  },
  dreddNames: {
    server: config.dredd.server,
    options: {
      path: 'doc/api/admin/*.md',
      names: true,
      sorted: true,
      color: cmdOpt.color,
      level: config.dredd.options.level
    }
  },
  jsdoc: {
    src: [
      'config/**/*.js',
      'lib/**/*.js',
      'spec/*.js',
      'test/**/*.js',
      '!**/deprecated/**', '!**/*.deprecated.js',
      'README.md'
    ],
    assets: [path.join(config.assetsDir, '**')],
    themePath: path.join(jsdocInkDocstrap, '..'),
    dest: path.join(config.distDir, 'jsdoc'),
    configDest: path.join(config.distDir, 'jsdoc.json'),
    config: {
      tags: {
        allowUnknownTags: true
      },
      plugins: [
        'plugins/markdown'
        //,path.join(require.resolve('jsdoc-i18n-plugin'), '..')
      ],
      templates: {
        cleverLinks: false,
        monospaceLinks: false,
        dateFormat: 'DD/MM/YYYY',
        outputSourceFiles: false,
        outputSourcePath: true,
        systemName: 'LP-APIM',
        footer: '<style>section.tutorial-section > header > ul {display: none;}</style>',
        copyright: 'Copyright © 2015 La Poste / Branche Numérique / Direction Technique.',
        navType: 'vertical',
        theme: 'cerulean',
        linenums: true,
        collapseSymbols: false,
        inverseNav: true,
        protocol: 'html://',
        methodHeadingReturns: false,
        syntaxTheme: 'dark',
        sort: 'longname',
        logoFile: path.join(config.assetsDir, 'laposte.ico')
      },
      markdown: {
        parser: 'gfm',
        hardwrap: true
      },
      opts: {
        encoding: 'utf8',
        tutorials: './doc/tutorials'
      },
      i18n: {
        locale: 'fr_FR',
        directory: 'doc/locales',
        srcDir: '.',
        extension: '.json'
      }
    }
  },
  jshint: {
    src: config.files.allJs,
    reporter: ciMode ? 'checkstyle' : 'jshint-stylish',
    checkStyleReporter: {
      filename: 'jshint/checkstyle.xml'
    }
  },
  kibana: {
    src: 'etc/kibana/*.json'
  },
  test: {
    options: {
      reporter: ciMode ? 'spec-xunit-file' : 'spec',
      grep: cmdOpt.transaction
    },
    coverage: {
      src: config.test.src,
      instrument: {
        pattern: [
          'config/**/*.js',
          'lib/**/*.js',
          '!**/deprecated/**', '!**/*.deprecated.js',
          '!lib/admin-cluster.js', '!lib/api-cluster.js', '!lib/services/cluster.js'
        ],
        options: {
          includeUntested: true
        }
      },
      reporters: ['text', 'html', 'lcov'],
      reporter: {
        options: {
          html: {
            file: 'coverage.html',
            dir: path.join(config.reportDir, 'test-coverage/html')
          },
          lcov: {
            file: 'lcov.info',
            dir: path.join(config.reportDir, 'test-coverage/lcov')
          }
        }
      }
    }
  }
});

if (ciMode) {
  process.env['XUNIT_FILE'] = 'dist/reports/test/junit.xml';
  config.test.coverage.reporters.push('cobertura');
  config.test.coverage.reporter.options.cobertura = {
    dir: path.join(config.reportDir, 'test-coverage/cobertura'),
    file: 'coverage.xml'
  };
  config.dredd.reporter = 'junit';
  config.dredd.options.output = path.join(config.dreddTestReportDir, 'junit.xml');
  config.dredd.coverage.reporters.push('cobertura');
  config.dredd.coverage.reporter.options.cobertura = {
    dir: path.join(config.reportDir, 'dredd-coverage/cobertura'),
    file: 'coverage.xml'
  };
}

taskSpecs = {
  default: {
    deps: 'help'
  },
  apidoc: {
    default: {
      desc: 'Build aglio and apiary apidocs',
      deps: ['aglio', 'apiary']
    },
    aglio: {
      default: {
        desc: 'Build aglio apidoc',
        deps: 'apib',
        config: {
          src: path.join(config.distDir, 'aglio', 'lpapim-admin.apib')
        },
        task: function (t) {
          var dest;
          dest = path.join(config.distDir, 'aglio', 'lpapim-admin.html');
          return gulp.src(t.config.src)
            .pipe(aglio({template: 'default'}))
            .pipe(gulp.dest(path.dirname(dest)));
        }
      },
      apib: {
        default: {
          desc: 'Build aglio apiblueprint doc',
          deps: 'files',
          config: {
            src: toArray(config.apidoc.mdDocs, ' ', path.join(config.distDir, 'aglio/doc/api/admin/%s.md'))
          },
          task: function (t) {
            return gulp.src(t.config.src)
              .pipe(concat('lpapim-admin.apib'))
              .pipe(gulp.dest(path.join(config.distDir, 'aglio')));
          }
        },
        files: {
          default: {
            desc: 'Build aglio apiblueprint files',
            deps: '/mkdir',
            config: {
              src: config.apidoc.src
            },
            task: function (t) {
              return gulp.src(t.config.src)
                .pipe(gulpif(cmdOpt.verbose, debug({title: 'aglio/apib/files'})))
                .pipe(replace(config.apidoc.privatePattern, '$2'))
                .pipe(gulp.dest(path.join(config.distDir, 'aglio/doc/api/admin')));
            }
          },
          clean: {
            desc: 'Clean aglio apiblueprint files',
            config: {
              src: path.join(config.distDir, 'aglio/doc/api/admin/**/*'),
              continueOnDryRun: true
            },
            task: function (t) {
              return rm(t.config.src);
            }
          }
        }
      }
    },
    apiary: {
      default: {
        desc: 'Build apiary apidoc',
        deps: 'apib'
      },
      apib: {
        default: {
          desc: 'Build apiary apiblueprint doc',
          deps: 'files',
          config: {
            src: toArray(config.apidoc.mdDocs, ' ', path.join(config.distDir, 'apiary/doc/api/admin/%s.md'))
          },
          task: function (t) {
            return gulp.src(t.config.src)
              .pipe(concat('lpapim-admin.apib'))
              .pipe(gulp.dest(path.join(config.distDir, 'apiary')));
          }
        },
        files: {
          default: {
            desc: 'Build apiary apiblueprint files',
            deps: '/mkdir',
            config: {
              src: config.apidoc.src
            },
            task: function (t) {
              return gulp.src(t.config.src)
                .pipe(gulpif(cmdOpt.verbose, debug({title: 'apiary/apib/files'})))
                .pipe(replace(config.apidoc.privatePattern, ''))
                .pipe(gulp.dest(path.join(config.distDir, 'apiary/doc/api/admin')));
            }
          },
          clean: {
            desc: 'Clean apiary apiblueprint files',
            config: {
              src: path.join(config.distDir, 'apiary/doc/api/admin/**/*'),
              continueOnDryRun: true
            },
            task: function (t) {
              return rm(t.config.src);
            }
          }
        }
      },
      publish: {
        desc: 'Publish apiary apidoc',
        deps: '.',
        config: {src: path.join(config.distDir, 'apiary', 'lpapim-admin.apib'), continueOnDryRun: true},
        task: function (t) {
          return p.do(
            fs.readFileAsync.bind(null, t.config.src, 'utf8'),
            function (data) {
              var opt = {
                method: 'post',
                url: config.apiary.server,
                headers: {
                  'Authentication': f('Token %s', config.apiary.token)
                },
                json: true,
                body: {code: data}
              };
              if (cmdOpt['dry-run'] || cmdOpt.verbose) {
                gutil.log($.yellow(f('Http request :', _.extend(_.omit(opt, 'body'), {body: {code: data.substring(0, 10) + '...'}}))));
                if (cmdOpt['dry-run']) {
                  return;
                }
              }
              return request(opt).spread(function (res, body) {
                if (!body) {
                  return;
                }
                if (body.error) {
                  throw new Error(body.message);
                }
                if (body.message) {
                  gutil.log(body.message);
                }
                return body.message;
              });
            });
        }
      }
    },
    publish: {
      deps: 'apiary/publish'
    }
  },
  clean: {
    desc: 'Clean all generated files',
    config: {src: path.join(config.distDir, '**/*'), continueOnDryRun: true},
    task: function (t) {
      return rm(t.config.src);
    }
  },
  coverage: {
    default: {
      desc: 'Run istanbul test coverage',
      deps: 'prepare',
      config: {src: cmdOpt.include ? toArray(cmdOpt.include, ',', 'spec/%sSpec.js') : config.test.coverage.src},
      task: function (t) {
        return gulp.src(t.config.src, {read: false})
          .pipe(mocha(config.test.options))
          .pipe(istanbul.writeReports({
            dir: config.reportDir,
            reporters: config.test.coverage.reporters,
            reportOpts: config.test.coverage.reporter.options
          }))
          .pipe(gulp.dest(config.reportDir));
      }
    },
    prepare: {
      desc: 'Prepare for test coverage',
      config: {src: config.test.coverage.instrument.pattern},
      task: function (t) {
        return gulp.src(t.config.src)
          .pipe(istanbul(config.test.coverage.instrument.options))
          .pipe(istanbul.hookRequire());
      }
    }
  },
  dredd: {
    default: {
      desc: 'Run dredd api tests',
      config: {continueOnDryRun: true},
      deps: ['/mkdir', '/apidoc/aglio', 'prepare'],
      task: function () {
        var serverConfig, adminServer, dredd;
        _.extend(config.dredd.options, _.pick(config.dredd, ['reporter']));
        if (cmdOpt.transaction) {
          config.dredd.options.only = toArray(cmdOpt.transaction);
        }
        if (cmdOpt['log-body']) {
          config.dredd.options.header = ['X-Dredd-Log-Body: true'];
        }
        if (cmdOpt.verbose) {
          gutil.log($.yellow(f('dredd config :', config.dredd)));
        }
        if (cmdOpt['dry-run']) {
          gutil.log($.yellow(f('Execute dredd with config :\n', JSON.stringify(config.dredd, null, 2))));
          return;
        }
        dredd = new Dredd(config.dredd);
        gutil.log('starting API server... ');
        serverConfig = require('./config');
        serverConfig.log.level = 'error';
        adminServer = require('./lib/admin-server');
        return p.do(
          function () {
            return adminServer.start();
          },
          function () {
            gutil.log('started.');
            gutil.log('starting API tests');
            return p.fromCallback(dredd.run.bind(dredd));
          },
          function (stats) {
            gutil.log($.bold(f('API tests report : %s tests, %s skipped', stats.tests, stats.skipped)));
            gutil.log($[stats.passes ? 'green' : 'red'](f('%s passes, ', stats.passes)));
            gutil.log($[!stats.failures ? 'green' : 'red'](f('%s failures, ', stats.failures)));
            gutil.log($[!stats.errors && stats.passes ? 'green' : 'red'](f('%s errors, ', stats.errors)));
            gutil.log('took %sms', stats.duration);
          },
          function () {
            return new p.fromNode(function (done) {
              gulp.src(config.dredd.options.output)
                .pipe(istanbul.writeReports({
                  reporters: config.dredd.coverage.reporters,
                  reportOpts: config.dredd.coverage.reporter.options
                }))
                .on('finish', function () {
                  done.apply(null, arguments);
                });
            });
          })
          .catch(function (err) {
            gutil.log(err);
            throw new Error(err.message);
          })
          .finally(function () {
            return adminServer.stop()
              .then(function () {
                gutil.log('API server stopped.');
              });
          });
      }
    },
    names: {
      desc: 'List dredd transaction names',
      task: function (t, cb) {
        var dredd = new Dredd(config.dreddNames);
        dredd.run(cb);
      }
    },
    prepare: {
      desc: 'Prepare for dredd coverage',
      config: {src: config.dredd.coverage.instrument.pattern},
      task: function (t) {
        return gulp.src(t.config.src)
          .pipe(istanbul(config.dredd.coverage.instrument.options))
          .pipe(istanbul.hookRequire());
      }
    }
  },
  help: {
    desc: 'Show tasks descriptions',
    task: function () {
      var l = 0, tasks;
      log();
      log($.bold('Usage'));
      log('  gulp %s', $.cyan('task'));
      log();
      log($.bold('Tasks'));
      tasks = [];
      _.forIn(taskSpecs, function (taskSpec, taskSpecName) {
        var task = _.omit(taskSpec, 'task');
        l = Math.max(taskSpecName.length, l);
        task.name = taskSpecName;
        task.providesFn = typeof taskSpec.task === 'function';
        tasks.push(task);
      });
      tasks.forEach(function (task) {
        log(false, '  %s : %s', $.cyan(_.padRight(task.name, l)), task.desc);
        if (task.deps) {
          log(false, ' %s', $.yellow(f('[%s]', task.deps.join(', '))));
        }
        log(false, ' ');
        if (task.config) {
          log(false, '%s', $.yellow.bold(f('\u2692 ')));
        }
        if (task.providesFn) {
          log(false, '%s', $.green(f('\u0192 ')));
        }
        log();
      });
      log();
    }
  },
  /** Generates the project sources documentation with rendering of README.md as welcome page */
  jsdoc: {
    default: {
      desc: 'Generates javascript documentation of the sources',
      deps: 'prepare',
      config: {src: config.jsdoc.src},
      task: function (t, cb) {
        glob(t.config.src, function (err, files) {
          var jsdocCmdArgs, jsdocCmd;
          if (err) {
            return cb(err);
          }
          jsdocCmdArgs = [
            jsdocCmdPath,
            '-P', './package.json',
            '-d', config.jsdoc.dest
          ];
          if (config.jsdoc.config) {
            jsdocCmdArgs = jsdocCmdArgs.concat(['-c', config.jsdoc.configDest]);
          }
          if (config.jsdoc.themePath) {
            jsdocCmdArgs = jsdocCmdArgs.concat(['-t', config.jsdoc.themePath]);
          }
          jsdocCmdArgs.push(files.join(' '));
          jsdocCmd = jsdocCmdArgs.join(' ');
          shell.task(jsdocCmd, {verbose: cmdOpt.verbose})(function (err) {
            var destFile, stream;
            if (err) {
              return cb(err);
            }
            destFile = path.join(config.jsdoc.dest, pkg.name, pkg.version, 'index.html');
            stream = gulp.src(config.jsdoc.assets)
              .pipe(gulp.dest(path.join(destFile, '..', 'assets')))
              .pipe(gulpif(!!config.notifier, notify(_.defaults({
                  onLast: true,
                  message: f('JSDoc generated %s', destFile)
                }, config.notifier)
              )))
              .on('finish', function () {
                gutil.log('JSDoc generated : %s', $.cyan('xdg-open ' + destFile));
                cb.apply(null, arguments);
              });
          });
        });
      }
    },
    prepare: {
      desc: 'Generates JSDoc configuration',
      task: function (t, cb) {
        fs.writeFile(config.jsdoc.configDest, JSON.stringify(config.jsdoc.config, null, 2), cb);
      }
    }
  },
  kibana: {
    desc: 'Build kibana config file',
    config: {src: config.kibana.src},
    task: function () {
      return gulp.src(config.kibana.src)
        .pipe(jsoncombine('kibana-all.json', function (data) {
          return new Buffer(JSON.stringify(data));
        }))
        .pipe(jsonFormat(2))
        .pipe(gulp.dest(config.distDir));
    }
  },
  licenses: {
    desc: 'Find licenses in node project and dependencies',
    task: function () {
      var dest = path.join(config.distDir, 'licenses.csv');
      return licenseFinder(path.basename(dest),
        {
          csv: true,
          depth: 1
        })
        .once('finish', function () {
          if (cmdOpt.verbose) {
            gutil.log($.yellow(f('Created license report : %s', dest)));
          }
          this.emit('end');
        })
        .pipe(gulp.dest(path.dirname(dest)));
    }
  },
  lint: {
    desc: 'Detect errors and potential problems in code',
    config: {src: config.jshint.src},
    task: function (t) {
      var checkstyle = config.jshint.reporter === 'checkstyle';
      return gulp.src(t.config.src)
        .pipe(jshint(config.jshint.options))
        .pipe(checkstyle ? checkstyleReporter(config.jshint.checkStyleReporter) : jshint.reporter(config.jshint.reporter))
        .pipe(gulpif(checkstyle, gulp.dest(config.reportDir)))
        .pipe(gulpif(!!config.notifier, notify(_.defaults({
          onLast: true,
          message: 'Lint done'
        }, config.notifier))));
    }
  },
  mkdir: {
    desc: 'Create dir to generate build files',
    config: {src: [config.distDir, config.reportDir, config.testReportDir, config.dreddTestReportDir]},
    task: function (t) {
      return p.each(t.config.src, function (dir) {
        return p.fromNode(mkdirp.bind(mkdirp, dir))
          .then(function (dir) {
            if (cmdOpt.verbose) {
              gutil.log(dir ? $.yellow(f('Directory created :', toRelativePath(dir))) : $.yellow(f('Nothing created')));
            }
          });
      });
    }
  },
  test: {
    desc: 'Run mocha specs',
    deps: 'mkdir',
    config: {src: cmdOpt.include ? toArray(cmdOpt.include, ',', 'spec/%sSpec.js') : config.test.src},
    task: function (t) {
      return gulp.src(t.config.src, {read: false})
        .pipe(mocha(config.test.options));
    }
  }
};

function initTasks() {
  function taskSpecTransformer(baseNs) {
    return function (result, taskSpec, taskSpecName) {
      var ns, item;

      function isTaskGroup() {
        return !Object.keys(_.pick(taskSpec, ['deps', 'task', 'desc'])).length;
      }

      function dryRun() {
        if (cmdOpt['dry-run']) {
          if (_.get(item, 'config.src')) {
            return gulp.src(item.config.src)
              .pipe(debug({title: ns}));
          }
          return true;
        }
      }

      ns = baseNs ? (taskSpecName === (_.get(config, 'taskSpecs.defaultGroupTask') || 'default') ? baseNs : path.join(baseNs, taskSpecName)) : taskSpecName;
      if (isTaskGroup()) {
        _.transform(taskSpec, taskSpecTransformer(ns), result);
        return;
      }
      item = result[ns] = {};
      if (taskSpec.desc) {
        item.desc = typeof taskSpec.desc === 'function' ? taskSpec.desc(taskSpecName, taskSpec) : taskSpec.desc;
      }
      if (taskSpec.deps) {
        item.deps = [];
        (Array.isArray(taskSpec.deps) ? taskSpec.deps : [taskSpec.deps]).forEach(function (dep) {
          if (dep.indexOf('/') === 0) {
            item.deps.push(dep.substring(1));
          } else {
            item.deps.push(baseNs ? path.join(baseNs, dep) : dep);
          }
        });
      }
      if (typeof taskSpec.task === 'function') {
        item.task = function (cb) {
          if (dryRun(item.config)) {
            if (!_.get(item, 'config.continueOnDryRun')) {
              return cb();
            }
          }
          return taskSpec.task.call(this, _.omit(item, 'task'), function (err, data) {
            if (cmdOpt.verbose && data) {
              gutil.log($.yellow('Task result :', data));
            }
            cb(err);
          });
        };
      }
      if (taskSpec.config) {
        item.config = taskSpec.config;
      }
    };
  }

  function registerTasks() {
    _.forIn(taskSpecs, function (taskSpec, taskSpecName) {
      var args = [taskSpecName];
      if (!taskSpec.desc && taskSpec.deps.length === 1) {
        taskSpec.desc = taskSpecs[_.first(taskSpec.deps)].desc;
      }
      if (taskSpec.deps) {
        args.push(taskSpec.deps);
      }
      if (taskSpec.task) {
        args.push(taskSpec.task);
      }
      gulp.task.apply(gulp, args);
    });
  }

  taskSpecs = _.transform(taskSpecs, taskSpecTransformer(), {});
  registerTasks();
}

initTasks();