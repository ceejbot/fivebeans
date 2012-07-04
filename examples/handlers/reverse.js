module.exports = function(logger)
{
	function StringReverser()
	{
		this.type = 'reverse';
	}

	StringReverser.prototype.work = function(payload, callback)
	{
		this.logger.info(this.reverseString(payload));
		callback('success');
	}

	StringReverser.prototype.reverseString = function(input)
	{
		var letters = input.split('');
		letters.reverse();
		this.logger.debug(letters);
		return letters.join('');
	}

	var handler = new StringReverser();
	if (logger) handler.logger = logger;
	return handler;
};
