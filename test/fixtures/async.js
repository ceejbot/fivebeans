module.exports = function()
{
	function AsyncHandler()
	{
		this.type = 'longasync';
	}

	AsyncHandler.prototype.timer = null;

	AsyncHandler.prototype.work = function(payload, callback)
	{
		function finish()
		{
			callback('success');
		}

		this.timeout = setTimeout(finish, 5000);
	};

	var handler = new AsyncHandler();
	return handler;
};
