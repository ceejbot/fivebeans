#!/usr/bin/env ruby

require "stalker"

beanurl = "beanstalk://%s:%d" % ['127.0.0.1', 11300]
$beanstalk = Stalker.connect(beanurl)

Stalker.enqueue('testtube', {
	:type => 'reverse',
	:payload => "this is a string that should get reversed",
	}
)
puts "Queued a string reverse job using Stalker.enqueue."
