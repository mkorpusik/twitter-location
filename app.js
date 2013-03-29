// npm install express rem
var rem = require('rem')
  , express = require('express')
  , path = require('path')
  , http = require("http")
  , async = require('async')

// Mondodb variables
var models = require('./models');
var LocTweets = models.LocTweets;

/**
 * Express.
 */

var app = express();

app.configure(function () {
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.set('secret', process.env.SESSION_SECRET || 'terrible, terrible secret')
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser(app.get('secret')));
  app.use(express.session());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function () {
  app.set('host', 'localhost:' + app.get('port'));
  app.use(express.errorHandler());
});

app.configure('production', function () {
  app.set('host', process.env.HOST);
});

/**
 * Setup Twitter.
 */

var twitter = rem.connect('twitter.com').configure({
  key: process.env.TWITTER_KEY,
  secret: process.env.TWITTER_SECRET
});


var oauth = rem.oauth(twitter, 'http://' + app.get('host') + '/oauth/callback');

app.get('/login/', oauth.login());

app.use(oauth.middleware(function (req, res, next) {
  console.log("The user is now authenticated.");
  res.redirect('/');
}));

app.get('/logout/', oauth.logout(function (req, res) {
  res.redirect('/');
}));

// Save the user session as req.user.
app.all('/*', function (req, res, next) {
  req.api = oauth.session(req);
  next();
});

/**
 * Routes
 */

function loginRequired (req, res, next) {
  if (!req.api) {
    res.redirect('/login/');
  } else {
    next();
  }
}

// app.get('/', loginRequired, function (req, res) {
//   req.api('account/verify_credentials').get(function (err, profile) {
//     res.send('Hi ' + profile.screen_name + '! <form action="/status" method="post"><input name="status"><button>Post Status</button></form>');
//   });
// });

app.post('/status', loginRequired, function (req, res) {
  req.api('statuses/update').post({
    status: req.body.status
  }, function (err, json) {
    if (err) {
      res.json({error: err});
    } else {
      res.redirect('http://twitter.com/' + json.user.screen_name + '/status/' + json.id_str);
    }
  });
})

app.listen(app.get('port'), function () {
  console.log('Listening on http://' + app.get('host'))
});

/**
 * Streaming example
 */

var carrier = require('carrier');

app.get('/stream', loginRequired, function (req, res) {
  req.api.stream('statuses/filter').post({
    track: ['obama', 'usa']
  }, function (err, stream) {
    carrier.carry(stream, function (line) {
      var line = JSON.parse(line);
      res.write(line.text + '\n');
    });
  });
})

function getSentiment(tweet, location, callback, ready) {
  // calculates the sentiment of the tweet
  var url = 'http://www.sentiment140.com/api/classify?text='+encodeURIComponent(tweet);
  http.get(url, function(res2) {
    res2.setEncoding('utf8');
    res2.on('data', function (chunk) {
      var json = JSON.parse(chunk);
      var sentiment = json.results.polarity; // 0 = negative, 2 = neutral, 4 = positive
      // console.log(tweet, sentiment);

      // appends the sentiment to the global results dict for the given location
      results_dict[location][1].push(sentiment);

      // call callback when ready
      if (ready){
        callback(null);
      }
    });
  }).on('error', function(e) {
    console.log("Got error: " + e.message);
  });
}

function getTweets(index, req, keyword, callback) {
  // calls Twitter search API on keyword for the location at the given index in the global locations list
  req.api('search/tweets').get({
    q: keyword,
    count: 100,
    geocode: locations[index].toString() + ',25mi',
    until: '2013-03-26'  // NOTE: this needs to be adjusted!!! if not recent enough, no tweets are returned
  }, function (err, stream) {
    var location = locations[index];
    var tweets = []; // list of all tweets
    for (var i in stream.statuses) {
      var tweet = stream.statuses[i].text;
      tweets.push(tweet);

      // only call callback when done processing the last tweet
      if (i==stream.statuses.length-1){
        getSentiment(tweet, location, callback, true);
      }
      else {
        getSentiment(tweet, location, callback, false);
      }
    }
    results_dict[location][0] = tweets;
    results_dict[location][2] = tweets.length;
    results_dict[location][4] = location;
  });
}

var locations = [[42.3583,-71.0603], [37.775,-122.4183], [40.7142,-74.0064], //bos, ny, sf
        [34.0522, -118.2428], [41.85, -87.65], [29.7631, -95.3631]]; //la, chicago, houston
        // [39.9522, -75.1642], [33.5722, -112.0880], [29.4724, -98.5251], //philly, phoenix, san antonio
        // [32.8153, -117.1350], [32.7942, -96.7655], [30.3370, -81.6613]]; //sd, dallas, jacksonville
        // global list of locations
var results_dict = {} // global dict mapping loc to tweets list, sentiments list, # tweets, avg sentiment, & loc

app.post('/search', loginRequired, function (req, res) {
  var keyword = req.body.keyword;

  // re-initialize global results dict
  results_dict = {};
  for (var i in locations) {
    var location = locations[i];
    results_dict[location] = [[], [], 0, 0, []]; 
  } 

  // check whether keyword has already been saved to mongodb
  var exists =  LocTweets.find({"keyword":keyword}, function (err, docs) {
    // console.log(docs);

    // keyword has been searched already
    if (docs.length>0) {
      console.log("keyword has been searched already!");

      // populate resulst_dict
      for (var i in docs){
        var loc_dict = docs[i];
        var location = loc_dict.loc;
        results_dict[location][0] = loc_dict.tweets;
        results_dict[location][1] = loc_dict.sentiments;
        results_dict[location][2] = loc_dict.num_tweets;
        results_dict[location][3] = loc_dict.avg_sentiment;
        results_dict[location][4] = location;
      }

      // render jade with db info
      res.render('tweets', { tweets:results_dict, title: 'tweets' })
      return;
    }
    
    // call Twitter search API if keyword not in db yet
    else if (docs.length==0){
      console.log("new keyword");

      // searches for all tweets with keyword in Boston, SF, and NY
      async.parallel([

        // search for tweets created near Boston
        function(callback){
          getTweets(0, req, keyword, callback); // 0 is the index in global locations list for Boston's coordinates
        },

        // search for tweets created near SF
        function(callback){
          getTweets(1, req, keyword, callback);
        },

        // search for tweets created near NY
        function(callback){
          getTweets(2, req, keyword, callback);
        },
        function(callback){
          getTweets(3, req, keyword, callback);
        },
        function(callback){
          getTweets(4, req, keyword, callback);
        },
        function(callback){
          getTweets(5, req, keyword, callback);
        }
      ],

      //callback
      function(err){
    
        // calculate average sentiment for each location
        for (var location in results_dict) {
          var tweets = results_dict[location][0];
          var sentiments = results_dict[location][1];
          var num_tweets = results_dict[location][2];
          var sum_sentiments = 0;
          for (var i in sentiments) {
            var sentiment = sentiments[i];
            sum_sentiments += sentiment;
          }
          // add average sentiment to results dict
          var avg = sum_sentiments / num_tweets
          results_dict[location][3] = avg;

          // save each location's info to mongodb
          location = location.toString(); // location list must be formatted properly (list of floats)
          location = location.split(',');
          var locTweets = new LocTweets({ keyword: keyword, tweets: tweets, sentiments: sentiments, num_tweets: num_tweets, avg_sentiment: avg, loc: [parseFloat(location[0]), parseFloat(location[1])]});
          locTweets.save(function (err) {
            if (err)
              return console.log(err);
          });
        }

        // render jade file
        res.render('tweets', { tweets:results_dict, title: 'tweets' })
      });

    }

    if (err)
      return console.log(err);
  });

});

app.get('/', loginRequired, function(req, res){
  res.render('index', { title: 'Search for Tweets by Keyword' })
});

app.get('/test', function(req, res){
  res.render('index', {title: 'Title'})
});
  
