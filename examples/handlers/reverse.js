(function() {

function work(payload, callback)
{
	console.log(reverseString(payload));
	callback('success');
}

function reverseString(input)
{
	var letters = input.split('');
	letters.reverse();
	return letters.join('');
}

exports.type = 'reverse';
exports.work = work;

}).call(this);


