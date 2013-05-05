module.exports = function()
{
	function EmitKeysHandler()
	{
		this.type = 'emitkeys';
	}

	// This is an extremely silly kind of job.
	EmitKeysHandler.prototype.work = function(payload, callback)
	{
		var keys = Object.keys(payload);
		for (var i = 0; i < keys.length; i++)
			console.log(keys[i]);
		callback('success');
	};

	var handler = new EmitKeysHandler();
	return handler;
};
