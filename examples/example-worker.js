#!/usr/bin/env node

var argv = require('yargs')
    .usage('Usage: beanworker --id=[ID] --config=[config.yml]')
    .default('id', 'defaultID')
    .demand(['config'])
    .argv;

var FiveBeans = require('../index');

var runner = new FiveBeans.runner(argv.id, argv.config);
runner.go();
