A straightforward and (nearly) complete [beanstalkd](http://kr.github.com/beanstalkd/) client for node.js, along with a more opinionated beanstalkd jobs worker & runner.

## FiveBeansClient

Heavily inspired by [node-beanstalk-client](https://github.com/benlund/node-beanstalk-client), which is a perfectly usable client but somewhat dusty. I wanted more complete support of the beanstalkd protocol in a project written in plain javascript.

All client method names are the same case & spelling as the beanstalk text command, with hyphens replaced by underscore. The single exception is "delete", which is renamed to "destroy".

For complete details on the beanstalkd commands, see [its protocol documentation](https://github.com/kr/beanstalkd/blob/master/doc/protocol.txt).

### Creating a client

```javascript
var fivebeans = require('fivebeans');
var client = new fivebeans.client('10.0.1.1', 11300);
```

The constructor takes two arguments: 

__host__: The address of the beanstalkd server. Defaults to `127.0.0.1`.  
__port__: Port to connect to. Defaults to `11300`.

### Producing jobs

#### use

`client.use(tube, function(err, tubename) {});`

Use the specified tube. Reponds with the name of the tube being used.

#### list_tube_used

`client.list_tube_used(function(err, tubename) {});`

Responds with the name of the tube currently being used by the client.

#### put

`client.put(priority, delay, ttr, payload, function(err, jobid) {});`

Submit a job with the specified priority (smaller integers are higher priority), delay in seconds, and allowed time-to-run in seconds. The payload contains the job data the server will return to clients reserving jobs; it can be either a Buffer object or a string. No processing is done on the data. Responds with the id of the newly-created job.

#### peek_ready

`client.peek_ready(function(err, jobid, payload) {});`

Peek at the data for the job at the top of the ready queue of the tube currently in use. Responds with the job id and payload of the next job, or 'NOT_FOUND' if there are no qualifying jobs in the tube. The payload is a Buffer object.

#### peek_delayed

`client.peek_delayed(function(err, jobid, payload) {});`

Peek at the data for the delayed job with the shortest delay in the tube currently in use. Responds with the job id and payload of the next job, or 'NOT_FOUND' if there are no qualifying jobs in the tube. The payload is a Buffer object.

#### peek_buried

`client.peek_buried(function(err, jobid, payload) {});`

Peek at the data for the next buried job in the tube currently in use. Responds with the job id and payload of the next job, or 'NOT_FOUND' if there are no qualifying jobs in the tube. The payload is a Buffer object.

### Consuming jobs

#### watch

`client.watch(tube, function(err, numwatched) {});`

Watch the named tube. Responds with the number of tubes currently watched by the client.

#### ignore

`client.ignore(tube, function(err, numwatched) {});`

Ignore the named tube. Responds with the number of tubes currently watched by the client.

#### list_tubes_watched

`client.list_tubes_watched(function(err, tubelist) {});`

Responds with an array containing the names of the tubes currently watched by the client.

#### reserve

`client.reserve(function(err, jobid, payload) {});`

Reserve a job. Responds with the id and the job data. The payload is a Buffer object.

#### reserve_with_timeout

`client.reserve_with_timeout(seconds, function(err, jobid, payload) {});`

Reserve a job, waiting the specified number of seconds before timing out. *err* contains the string "TIMED_OUT" if the specified time elapsed before a job became available. Payload is a buffer.

#### touch

`client.touch(jobid, function(err) {});`

Inform the server that the client is still processing a job, thus requesting more time to work on it. 

#### destroy

`client.destroy(jobid, function(err) {});`

Delete the specified job. Responds with null if successful, a string error otherwise. This is the only method not named identically to its beanstalkd counterpart, because delete is a reserved word in Javascript.

#### release

`client.release(jobid, priority, delay, function(err) {});`

Release the specified job and assign it the given priority and delay (in seconds). Responds with null if successful, a string error otherwise. 

#### bury

`client.bury(jobid, priority, function(err) {});`

Bury the specified job and assign it the given priority. Responds with null if successful, a string error otherwise. 

#### kick

`client.kick(maxToKick, function(err, numkicked) {});`

Kick at most *maxToKick* delayed and buried jobs back into the active queue. Responds with the number of jobs kicked.

### Server statistics

#### peek

`client.peek(id, function(err, jobid, payload) {});`

Peek at the data for the specified job. Payload is a Buffer object.

#### pause_tube

`client.pause_tube(tubename, delay, function(err) {});`

Pause the named tube for the given number of seconds. No new jobs may be reserved from the tube while it is paused.

#### list_tubes

`client.list_tubes(function(err, tubenames) {});`

List all the existing tubes. Responds with an array of tube names.

#### stats_job

`client.stats_job(jobid, function(err, response) {});`

Request statistics for the specified job. Responds with a hash containing information about the job. See the beanstalkd documentation for a complete list of stats.

#### stats_tube

`client.stats_tube(tubename, function(err, response) {});`

Request statistics for the specified tube. Responds with a hash containing information about the tube. See the beanstalkd documentation for a complete list of stats.

#### stats

`client.stats(function(err, response) {});`

Request statistics for the beanstalkd server. Responds with a hash containing information about the server. See the beanstalkd documentation for a complete list of stats.

## FiveBeansWorker

Inspired by [node-beanstalk-worker](https://github.com/benlund/node-beanstalk-worker)
but updated & rewritten to work with jobs queued by [Stalker](https://github.com/kr/stalker). 

The worker pulls jobs off the queue & passes them to matching handlers. It deletes successful jobs & requeues unsuccessful ones. It logs its actions to the console and to a file.

Each job must be a JSON list containing two items:

`[ tubename, jobdata ]`

This is for compatibility with the Stalker library, which wraps the job data this way.

The job data is a hash with two fields:

__type__: type string matching a handler  
__payload__: job data, in whatever format the job defines

The worker looks up a handler using the given type string and calls work() on the job payload.

Handler modules must export a single function that returns an object. The object must have a field called 'type' with a brief descriptive string. It must also expose a function called work() with this signature:

`work(jobdata, callback(action, delay))`

__jobdata__: job payload  
__action__: 'success' | 'release' | 'bury' | custom error message  
__delay__: time to delay if the job is released; otherwise unused

If the *action* is "success", the job is deleted. If it is "release", the job is released with the specified delay. If it is "bury", the job is buried. All other actions are treated as errors & the job is buried in response.

When the worker loads its handlers, it sets a `logger` field on each to its own logger object. Handlers may therefore call winston logging methods on `this.logger` in their work methods. 

Here's a simple handler example.

```javascript
module.exports = function()
{
    function EmitKeysHandler()
    {
        this.type = 'emitkeys';
    }

    EmitKeysHandler.prototype.work = function(payload, callback)
    {
        var keys = Object.keys(payload);
        for (var i = 0; i < keys.length; i++)
            this.logger.info(keys[i]);
        callback('success');
    }

    var handler = new EmitKeysHandler();
    return handler;
};
```

The [examples](fivebeans/examples) directory has another sample handler.


### API

`new FiveBeansWorker(options)`

Returns a new worker object. *options* is a hash containing the following keys:

__id__: how this worker should identify itself in logs   
__host__: beanstalkd host  
__port__: beanstalkd port  
__logdir__: directory for log files  
__handlers__: list of handler objects; see above

`start(tubelist, ignoreDefault)`

Connects the worker to the beanstalkd server & sets it watching the specified tubes. The second option controls whether to ignore the default tube.

### Example

```javascript

var beanworker = require('fivebeans').worker;
var options = {
	id: 'worker_4', 
	host: '127.0.0.1',
	port: 11300,
	logdir: "./logs",
	handlers: handlerList,
}
var worker = new beanworker(options);
worker.start(['high', 'medium', 'low'], true);
return worker;
```

## FiveBeansRunner

A wrapper that runs a single beanstalkd worker as a daemon. Responds to the USR2 signal by reloading the configuration and restarting the worker. Handles SIGINT, SIGHUP, and SIGQUIT by completing processing on the current job then stopping.

Example use:

```javascript
var fivebeans = require('fivebeans');
var runner = new fivebeans.runner('worker_id_1', '/path/to/config.yml');
runner.go();
```

### bin/beanworker

The above code plus [optimist](https://github.com/substack/node-optimist) wrapped in a node shell script for your convenience.

`bin/beanworker --id=[ID] --config=[config.yml]`

Creates a runner for a worker with the specified ID & configured with the specified yaml file.

### Configuration file

Here's an example yaml configuration:

```yaml
beanstalkd:
    host: "127.0.0.1"
    port: 11300
watch:
    - 'circle'
    - 'picadilly'
    - 'northern'
    - 'central'
handlers:
    - "./handlers/holborn.js"
    - "./handlers/greenpark.js"
    - "./handlers/knightsbridge.js"
logdir: "/path/to/log"
ignoreDefault: true
```

__beanstalkd__: where to connect  
__watch__: a list of tubes to watch.  
__handlers__: a list of handler files to require  
__logdir__: path to the directory for worker logs  
__ignoreDefault__: true if this worker should ignore the default tube

You may omit the __logdir__ line to suppress logging to a file.

If the handler paths don't start with `/` the current working directory will be prepended to them before they are required.

## TODO 

* Handle DEADLINE_SOON from the server.  

* Write proper unit tests for the worker/runner/handler interaction.

