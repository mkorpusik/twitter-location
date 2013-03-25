// npm install express rem
var rem = require('rem')
  , express = require('express')
  , path = require('path')
  , http = require("http")

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

var tweets_dict = {}; // global dictionary of tweets mapped to list of location & sentiment

function getMapInfo() {
  // populate dictionary of locations (lat/lon) mapped to # tweets & average sentiment
  var map_dict = {}; 
  var loc1 = 'Boston, MA';
  var loc2 = 'San Francisco, CA';
  var loc3 = 'New York, NY';
  var num1 = 0; // number tweets for loc1
  var num2 = 0;
  var num3 = 0;
  var sent1 = 0; // total sentiment for loc1
  var sent2 = 0;
  var sent3 = 0;

  // loop through all tweets
  for (var tweet in tweets_dict) {

    // increment num tweets & update sentiment for given location
    if (loc1 == tweets_dict[tweet][1]) {
      num1 += 1;
      sent1 += tweets_dict[tweet][0];
    } 
    else if (loc2 == tweets_dict[tweet][1]) {
      num2 += 1;
      sent2 += tweets_dict[tweet][0];
    }
    else if (loc3 == tweets_dict[tweet][1]) {
      num3 += 1;
      sent3 += tweets_dict[tweet][0];
    }
  }

  // assign values to map_dict
  map_dict['42.3583,-71.0603'] = [num1, sent1/num1];
  map_dict['37.775,-122.4183'] = [num2, sent2/num2];
  map_dict['40.7142,-74.0064'] = [num3, sent3/num3];

  return map_dict;
}

function getSentiment(tweet, location, render_page, res) {
  // calculates the sentiment of the tweet
  var url = 'http://www.sentiment140.com/api/classify?text='+encodeURIComponent(tweet);
  http.get(url, function(res2) {
    res2.setEncoding('utf8');
    res2.on('data', function (chunk) {
      var json = JSON.parse(chunk);
      var sentiment = json.results.polarity; // 0 = negative, 2 = neutral, 4 = positive
      // console.log(tweet, sentiment);
      // saves the tweet (along with sentiment and location) to the global tweets_dict
      tweets_dict[tweet + '\n'] = [sentiment, location];
  
      // if render_page is true (i.e. all tweets have been found), renders jade
      if (render_page) {
        var map_dict = getMapInfo();
        res.render('tweets', { tweets:tweets_dict, map_info:map_dict, title: 'tweets' })
      }
    });
  }).on('error', function(e) {
    console.log("Got error: " + e.message);
  });
}

app.post('/search', loginRequired, function (req, res) {
  console.log("req.body", req.body);
  var keyword = req.body.keyword;
  // searches for all tweets with keyword in Boston, SF, and NY
  tweets_dict = {}; // resets global tweet dict to be empty

  // search for tweets created near Boston
  req.api('search/tweets').get({
    q: keyword,
    count: 100,
    geocode: '42.3583,-71.0603,25mi',
    until: '2013-03-24'  // NOTE: this needs to be adjusted!!! if not recent enough, no tweets are returned
  }, function (err, stream) {
    var location = 'Boston, MA';
    for (var i in stream.statuses) {
      var tweet = stream.statuses[i].text;
      getSentiment(tweet, location, false, res);
    }

    // search for tweets created near SF
    req.api('search/tweets').get({
      q: keyword,
      count: 100,
      geocode: '37.775,-122.4183,25mi',
      until: '2013-03-24' // NOTE: this needs to be adjusted!!! if not recent enough, no tweets are returned
    }, function (err, stream) {
      var location = 'San Francisco, CA';
      for (var i in stream.statuses) {
        var tweet = stream.statuses[i].text;
        getSentiment(tweet, location, false, res);
      }

      // search for tweets created near NY
      req.api('search/tweets').get({
        q: keyword,
        count: 100,
        geocode: '40.7142,-74.0064,25mi',
        until: '2013-03-24'  // NOTE: this needs to be adjusted!!! if not recent enough, no tweets are returned
      }, function (err, stream) {
        var location = 'New York, NY';
        for (var i in stream.statuses) {
          var tweet = stream.statuses[i].text;
          // if processing last tweet in the stream, render results page
          if (i==stream.statuses.length-1) {
            getSentiment(tweet, location, true, res);
          } else {
            getSentiment(tweet, location, false, res);
          }
        }
      });
    });
  }); 

})

app.get('/', loginRequired, function(req, res){
  res.render('index', { title: 'Search for Tweets by Keyword' })
});
  
