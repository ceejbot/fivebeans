#!/usr/bin/env node

var fivebeans = require('../index');
var client = new fivebeans.client('127.0.0.1', 11300);

function clearAJob()
{
	client.peek_buried(function(err, jobid, payload)
	{
		if (err && err === 'NOT_FOUND')
		{
			console.log('done');
			process.exit(0);
		}
		else if (jobid)
		{
			console.log('nuking ' + jobid, payload.toString());
			client.destroy(jobid, clearAJob);
		}
		else
			console.log(err);
	});
}

client.on('connect', function handleConnect()
{
	client.use('testtube', function handleWatch(err, response)
	{
		if (err) throw(err);
		clearAJob();
	});
}).on('error', function(err)
{
	throw(err);
});

client.connect();
