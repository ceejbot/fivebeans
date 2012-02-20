(function() {

var logger;

function work(payload, callback)
{
	logger = this;
	this.info(reverseString(payload));
	callback('success');
}

function reverseString(input)
{
	var letters = input.split('');
	letters.reverse();
	logger.debug(letters);
	return letters.join('');
}

exports.type = 'reverse';
exports.work = work;

}).call(this);


