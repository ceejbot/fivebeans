var fivebeans = require('../fivebeans');

var host = '10.0.0.14';
var port = 11300;
var tube = 'testtube';

var job1 = { 
	type: 'reverse',
	payload: 'a man a plan a canal panama'
};

var job2 = { 
	type: 'emitkeys',
	payload: {
		one: 'bloop',
		two: 'blooop',
		three: 'bloooop',
		four: 'blooooop'
	}
};

var emitter = new fivebeans.client(host, port);
emitter.connect(function(err)
{
	emitter.use('testtube', function(err, tname)
	{
		console.log("using "+tname);
		emitter.put(0, 0, 60, JSON.stringify(['testtube', job1]), function(err, jobid)
		{
			console.log('queued a string reverse job in testtube: '+jobid);
			emitter.put(0, 0, 60, JSON.stringify(['testtube', job2]), function(err, jobid)
			{
				console.log('queued a key emitter job in testtube: '+jobid);
				process.exit(0);
			});
		});
	});
});
