var mongoose = require('mongoose');
mongoose.connect(process.env.MONGOLAB_URI || 'mongodb://localhost/grapevine');

var locTweetsSchema = mongoose.Schema({
  keyword: String,
  tweets: [String],
  sentiments: [String],
  num_tweets: Number,
  avg_sentiment: Number,
  loc: [Number]
});

var LocTweets = mongoose.model('LocTweets', locTweetsSchema);

module.exports.LocTweets = LocTweets;
