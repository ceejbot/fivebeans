var fivebeans = require('../index');

var host = 'localhost';
var port = 11300;
var tube = 'example-tube';

var job1 =
{
	type: 'reverse',
	payload: 'a man a plan a canal panama'
};

var job2 =
{
	type: 'emitkeys',
	payload:
	{
		one: 'bloop',
		two: 'blooop',
		three: 'bloooop',
		four: 'blooooop'
	}
};

var joblist =
[
	{ type: 'reverse', payload: 'madam, I\'m Adam' },
	{ type: 'reverse', payload: 'satan oscillate my metallic sonatas' },
	{ type: 'reverse', payload: 'able was I ere I saw Elba' }
];

var doneEmittingJobs = function()
{
	console.log('We reached our completion callback. Now closing down.');
	emitter.end();
	process.exit(0);
};

var continuer = function(err, jobid)
{
	console.log('emitted job id: ' + jobid);
	if (joblist.length === 0)
		return doneEmittingJobs();

	emitter.put(0, 0, 60, JSON.stringify(['testtube', joblist.shift()]), continuer);
};

var emitter = new fivebeans.client(host, port);
emitter.on('connect', function()
{
	emitter.use('testtube', function(err, tname)
	{
		console.log("using " + tname);
		emitter.put(0, 0, 60, JSON.stringify(['testtube', job1]), function(err, jobid)
		{
			console.log('queued a string reverse job in testtube: ' + jobid);
			emitter.put(0, 0, 60, JSON.stringify(['testtube', job2]), function(err, jobid)
			{
				console.log('queued a key emitter job in testtube: ' + jobid);

				// And an example of submitting jobs in a loop.
				emitter.put(0, 0, 60, JSON.stringify(['testtube', joblist.shift()]), continuer);
			});
		});
	});
});

emitter.connect();
