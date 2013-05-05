module.exports = function()
{
	function StringReverser()
	{
		this.type = 'reverse';
	}

	StringReverser.prototype.work = function(payload, callback)
	{
		console.log(this.reverseString(payload));
		callback('success');
	};

	StringReverser.prototype.reverseString = function(input)
	{
		var letters = input.split('');
		letters.reverse();
		return letters.join('');
	};

	var handler = new StringReverser();
	return handler;
};
