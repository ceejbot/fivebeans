module.exports = function(logger)
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
	if (logger) handler.logger = logger;
	return handler;
};
