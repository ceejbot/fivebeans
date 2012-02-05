(function() {

function work(payload, callback)
{
	for (var k in payload) if (payload.hasOwnProperty(k)) console.log(k);
	callback('success');
}

exports.type = 'emitkeys';
exports.work = work;

}).call(this);
