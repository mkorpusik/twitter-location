// npm install express rem
var rem = require('rem')
  , express = require('express')
  , path = require('path')

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

app.post('/search', loginRequired, function (req, res) {

  console.log("req.body", req.body);
  var keyword = req.body.keyword;
  // var tweets = [];
  var tweets_dict = {};


  // search for tweets created near Boston
  req.api('search/tweets').get({
    q: keyword,
    geocode: '42.3583,-71.0603,25mi',
    until: '2013-03-10'
  }, function (err, stream) {
    var tweets = [];
    var location = 'Boston, MA';
    // res.write('\nTweets near Boston, MA');
    for (var i in stream.statuses) {
      tweets.push(stream.statuses[i].text + '\n');
      // res.write('\n' + stream.statuses[i].user.name + '\n');
      // res.write(stream.statuses[i].text + '\n');
    }
  tweets_dict[location] = tweets;
  // res.render('tweets', { tweets:tweets_dict, title: 'Tweets' })
    // search for tweets created near SF
    req.api('search/tweets').get({
      q: keyword,
      geocode: '37.775,-122.4183,25mi',
      until: '2013-03-10'
    }, function (err, stream) {
      var tweets = [];
      var location = 'San Francisco, CA';
      // res.write('\nTweets near San Francisco, CA');
      for (var i in stream.statuses) {
        tweets.push(stream.statuses[i].text + '\n');
        // res.write('\n' + stream.statuses[i].user.name + '\n');
        // res.write(stream.statuses[i].text + '\n');
      }
    tweets_dict[location] = tweets;
    // res.render('tweets', { tweets:tweets_dict, title: 'Tweets' })
      // search for tweets created near NY
      req.api('search/tweets').get({
        q: keyword,
        geocode: '40.7142,-74.0064,25mi',
        until: '2013-03-10'
      }, function (err, stream) {
        var tweets = [];
        var location = 'New York, NY';
        // res.write('\nTweets near New York, NY');
        for (var i in stream.statuses) {
          tweets.push(stream.statuses[i].text + '\n');
          // res.write('\n' + stream.statuses[i].user.name + '\n');
          // res.write(stream.statuses[i].text + '\n');
        }
      tweets_dict[location] = tweets;
      res.render('tweets', { tweets:tweets_dict, title: 'Tweets' })
      });
    });
  }); 

})

app.get('/', loginRequired, function(req, res){
  res.render('index', { title: 'Search for Tweets by Keyword' })
});
  

