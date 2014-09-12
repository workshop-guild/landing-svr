#!/bin/env node
var fs = require('fs'),
    express = require('express'),
    http = require('http'),
    mongodb = require('mongodb').MongoClient,
    bodyParser = require('body-parser'),
    cookieParser = require('cookie-parser'),
    morgan = require('morgan'), // logging for express
    moment = require('moment'),
    multiparty = require('multiparty'),
    murmurhash = require('murmurhash'), // Generating user hash for url
    crypto = require('crypto'),
    cors = require('cors'), // https://www.npmjs.org/package/cors
    SERVER_ENV = require(__dirname + '/env.json');

var app = express();

app.use( cors() ); // allow *

var ipaddress = process.env.OPENSHIFT_NODEJS_IP || SERVER_ENV.web_address;
var port = process.env.OPENSHIFT_NODEJS_PORT || SERVER_ENV.web_port;
var data_dir = process.env.OPENSHIFT_DATA_DIR || __dirname + '/views/user';


var SERVER_PUBLIC_ADDR = SERVER_ENV.web_url;

var STATUS_OK = 0;
var STATUS_ERR  = 1;

var sessionMiddleWare = function(req, res, next) {
    var session_id = req.cookies;

    console.log('parsing cookies');
    console.log(session_id);
    //req.username = username;

    return next();
}

function Timestamp()
{
    return moment().format("YYYY-MM-DD HH:mm:ss");
}

function getDataDir()
{
    return data_dir + '/';
}

function getSession(req)
{
    //if (req.cookies && req.cookies.email) {
    //    return {
    //        'username' : req.cookies.email,
    //        'profile'  : req.cookies.profile,
    //        'lastseen' : req.cookies.lastseen
    //    };
    //}
    if (req.cookies.isset) return req.cookies;

    return null;
}

function setSession(res, key, value, bHttpOnly)
{
    bHttpOnly = (typeof bHttpOnly === 'undefined' ? true : bHttpOnly);
    res.cookie('isset', value, { maxAge: 900000, httpOnly: bHttpOnly });
    res.cookie(key, value, { maxAge: 900000, httpOnly: bHttpOnly });
}

function clearSession(res)
{
    res.cookie.isset = null;
}

mongodb.connect(SERVER_ENV.db_url, function(err, db) {

    if (err) {
        console.log('Error connecting to DB');
        return;
    }

    var server = http.createServer(app).listen(port,ipaddress, function(err) {
        if (err) return console.log('Error in startin server: ' + err);
        console.log("[%s]: Node Started and listening %s:%s",
            Timestamp(),
            server.address().address,
            server.address().port);
    });

    // settings
    app.set('trust proxy', true);

    // ensure db index by location
    db.collection('players', function (e, collection) {
      collection.ensureIndex({ _id: 1, location: '2dsphere' }, function() {});
    });

    // express logging middleware
    //app.use( morgan()
    //);

    // POST middleware
    app.use(bodyParser.json());       // to support JSON-encoded bodies
    app.use(bodyParser.urlencoded()); // to support URL-encoded bodies
    app.use(cookieParser());

    // server static pages middleware
    app.use('/', express.static(__dirname + '/views/'));
    app.use('/profile', express.static(getDataDir()));
    app.post('/login', function(req, res) {

        var players = db.collection('players');

        var client_ip = req.headers['x-forwarded-for'] ||
                        req.connection.remoteAddress;

        var post = req.body;

        var email = post.email;
        var password = post.password;

        console.log('ip ' + client_ip);
        console.log(post);

        console.log(req.cookies);

        //var hash = crypto.createHash('md5').update(password).digest('hex');

        var query = {
            '_id' : email,
            'password' : password
        };

        var fields = {
            'password' : 0
        };

        console.log(query);
        console.log(fields);

        players.findOne( query, fields, function (err, doc) {

            if (err) return res.send({'status' : 'error', 'errorno' : err})

            if (!doc) {
              return res.status(401).send({
                error: {
                  code: err,
                  message: 'Invalid User Credentials'
                }
              }); // send HTTP Status 401 Unauthorized
            }

            var lastseen = new Date();

            players.update(
                {'_id' : email},
                { $set : { 'lastseen' : lastseen } },
                function(err) {
                if (err) return console.log('error setting lastseen');

                console.log('updated lastseen for ' + email);
            });

            setSession(res, 'email', email);
            setSession(res, 'lastseen', lastseen);
            setSession(res, 'status', STATUS_OK);
            res.send( {'status' : STATUS_OK} );
        });
    });

    app.post('/logout', function (req, res) {
        var players = db.collection('players');

        var client_ip = req.headers['x-forwarded-for'] ||
                        req.connection.remoteAddress;

        var cookies = req.cookies;

        console.log('ip ' + client_ip);
        console.log(req.cookies);

        var email = cookies.email;

        //var hash = crypto.createHash('md5').update(password).digest('hex');

        var query = {
            '_id' : email,
        };

        var fields = {};

        console.log(query);
        console.log(fields);

        players.findOne( query, fields, function (err, doc) {

            if (err) return res.send({'status' : STATUS_ERR, 'errorno' : err})

            if (!doc) return res.send({'status' : STATUS_ERR, 'errorno' : 'Not Found'});

            var lastseen = new Date();

            players.update(
                {'_id' : email},
                { $set : { 'lastseen' : lastseen } },
                function(err) {
                if (err) return console.log('error setting lastseen');

                console.log('updated lastseen for ' + email);
            });

            //res.cookie('email', email, { maxAge: 900000, httpOnly: true });
            clearSession(res);
            res.cookie('status', STATUS_OK, { maxAge: 900000, httpOnly: true });
            if (req.cookies) {
              console.log('Cookies!');
              res.send(JSON.stringify(req.cookies));
            }
            else {
              console.log('No Cookies :(');
              res.send( {'status' : STATUS_OK} );
            }
        });
    });


    app.post('/register', function (req, res) {
        console.log(req.ips);
        console.log(req.body);
        console.log('Registering New User');

        var session = getSession(req);

        var tprofile = "";


        var post = req.body;
        var players = db.collection('players');
        var locations = db.collection('locations');

        var email     = post['email'];
        var username = post['username'];
        var password  = post['password'];
        var firstname = post['first'];
        var lastname  = post['last'];
        var birthday = post['birthday'];
        var weight = post ['weight'];
        var height = post ['height'];
        var country = post['country'];
        var city = post['city'];
        var now = new Date();
        var location = { long: 0.01, latt: 0.01 };

        var hash = crypto.createHash('md5').update(password).digest('hex');
        console.log("MD5 password: "+password+' hash: '+hash);

        var player = {
            '_id' : email,
            'username' : username,
            'password' : hash,
            'firstname' : firstname,
            'lastname' : lastname,
            'birthday' : birthday,
            'weight' : weight,
            'height' : height,
            'country' : country,
            'city' : city,
            'lastseen' : now,
            'location' : {
                'type' : 'Point',
                'coordinates' : [
                    0.01,
                    0.02
                ]
            }
        };

        players.insert( player, { w : 1 }, function(err, document) {
            if (err) {
                console.log('error in registering profile: ' + err);
                res.send({'status' : STATUS_ERR});
            }

            if (!session) {
                return console.log('Missing Session. Should be generated by upload');
            }
            else {
                var tmp_path = session.tpath;
                var urlhash = murmurhash.v3(email);
                var new_path = getDataDir() + urlhash + "/";

                console.log('%s %s %s', tmp_path, urlhash, new_path);

                if ( !fs.existsSync(new_path) ) {
                    fs.mkdirSync(new_path);
                }

                fs.rename(tmp_path, new_path + 'profile.jpg', function(err) {
                   if (err) return console.log('Error finalizing profile image');
                    console.log('DB Updating Profile Image ');
                    players.update(
                        { '_id' : email },
                        {
                            $set : {
                              'userID' : Math.floor(urlhash),
                              'profile_url' : 'user/' + urlhash + '/profile.jpg'
                            }
                        },
                        { upsert : true, w : 1, j : 1 },
                        function(err, num)
                        {
                            if (err) console.log('db error set profile' + err);

                    });
                });

            }


          console.dir(document[0]);

          setSession(res, 'email', email);
          setSession(res, 'lastseen', now);
          setSession(res, 'status', STATUS_OK);

          res.send({'email' : email, 'status' : STATUS_OK});
        });
    });

    app.post('/usersearch', function(req, res) {
      console.log('ips: '+req.ips);
      console.log(req.body);
      console.log("Searching for Username");

      var post = req.body;
      var players = db.collection('players');
      var query = { 'username': post['username'] }
      var fields = { 'username': 1 };
      var player = players.findOne(
        { 'username': post['username'] },
        { 'username': 1 },
        function (err, doc) {
          if (err) return res.send({'status' : STATUS_ERR, 'errorno' : err})
          if (doc)
          {
            console.log('User found');
            return res.send(JSON.stringify({status: STATUS_ERR}));
          }
          else
          {
            console.log('User not found');
            res.send(JSON.stringify({status: STATUS_OK}));
          }
        }
      );
    });

    app.post('/locationupdate', function (req, res) {
        console.log('ips: ');
        console.log(req.body);
        console.log("Updating Location");

        var session = getSession(req);
        var post = req.body;
        var players = db.collection('players');

        var lon = post['fLongitude'];
        var lat = post['fLattitude'];

        var query   = { '_id': session.email };
        var options = { upsert : true, w : 1, j : 1 };
        var update  = {
            $set: {
                'location' : {
                    'type' : 'Point',
                    'coordinates' : [
                        parseFloat(lon),
                        parseFloat(lat)
                    ]
                }
            }
        };

        players.update( query, update, options, function (err, num_records) {

            if (err) return res.send({ 'status' : STATUS_ERR, 'errorno' : err});

            res.send({ 'status' : STATUS_OK });
        });
    });

    app.get('/logout', function (req, res) {

        clearSession(req);
        clearSession(res);
        res.send('Cookies Cleared');
    });

    var apiRouter = express.Router();
    app.use('/api', apiRouter);

    apiRouter.get('/profile/me',  function (req, res) {
      console.log('Get My Profile');
      console.log(req.cookies);

      var cookies = getSession(req);
      var players = db.collection('players');


      if (cookies) {
          //console.log(post);

          var query  = { '_id' : cookies.email };
          var fields = { 'password' : 0 };

          players.findOne( query, fields, function (err, doc) {
              if (doc) res.send(JSON.stringify(doc));
          });
      }
      else {
        res.send({ 'status' : STATUS_ERR });
      }
    });

    apiRouter.get('/profile/view', function (req, res) {
      console.log('Get Others Profile');
      console.log(req.cookies);

      var cookies = getSession(req);
      var players = db.collection('players');

      var query = { '_id' : cookies.email };
      var fields = { 'password' : 0 };

      players.findOne( query, fields, function ( err, doc ) {
        if (err) {
          console.log('view profile ' + err);
          res.send( { status: STATUS_ERR, errno: err } );
        }
        if (!doc) {
          console.log('view profile cannot find user ' + cookies.email);
          res.send( { status: STATUS_ERR, errno: 'Cannot find user '+cookies.email } );
        }

        console.log('found user doc');
        console.log(doc);

        if ( doc.last_view !== null || typeof doc.last_view !== 'undefined' ) {
          console.log('last_view = '+doc.last_view);
          var newQuery = { 'userID' : parseInt(doc.last_view) };
          var newFields = { '_id' : 0, 'password' : 0 };
          var newPlayers = db.collection('player');
          newPlayers.findOne( newQuery, newFields, function ( err, userDoc ) {
            console.log('found last view user');
            console.log(userDoc);
            if (userDoc) res.send(JSON.stringify(userDoc));
          } );
        }
      });
    });

    apiRouter.post('/profile/setView', function (req, res) {
      console.log('Update view profile history');
      console.log(req.query);

      var cookies = getSession(req);
      var post = req.body;

      var players = db.collection('players');

      var viewUserID = post.viewUserID;
      var query = { '_id' : cookies.email };

      players.findOne( query, {}, function (err, doc) {
        if (err)
        {
          console.log('view profile history ' + err);
          res.send( { status: STATUS_ERR, errno: err } );
        }
        if (!doc) {
          console.log('view profile history cannot find user ' + cookies.email);
          res.send( { status: STATUS_ERR, errno: 'Cannot find user '+cookies.email } );
        }

        players.update(
          query,
          { $set : { 'last_view' : viewUserID } },
          { upsert : true, w : 1, j : 1 },
          function(err, num) {
            if (err) console.log('db error update view profile history ' + err);

            res.send( { status: STATUS_OK } );
          }
        );
      });
    });

    apiRouter.post('/profile/update',  function (req, res) {
      console.log('Update Profile');
      console.log(req.query);

      var session = getSession(req);

      if (!session) return res.send({ status : STATUS_ERR, 'errorno' : 'no session'});

      console.log(session);

      var post = req.body;

      var height  = post['height'];
      var weight  = post['weight'];
      var city    = post['city'];
      var country = post['country'];

      var players = db.collection('players');

      var query  = { '_id' : session.email };
      var options = { w : 1, j : 1 };

      var update = { $set : {
          'height' : height,
          'weight' : weight,
          'city' : city,
          'country' : country
         }
      };

      // Update profile
      players.update( query, update, options, function (err, num_records) {

          if (err) return res.send({ status : STATUS_ERR, 'errorno' : err});

          res.send({ status : STATUS_OK });
      });
    });


    apiRouter.get('/ping', function (req, res) {
        console.log('Ping Query');
        console.log(req.query);
        console.log(req.cookies);

        var get = req.query;
        var session = getSession(req);


        var lon  = parseFloat(get['fLongitude']);
        var lat  = parseFloat(get['fLattitude']);
        var dist = parseInt(get['distance']);
        dist *= 1000    // convert to metersmeter

        var players = db.collection("players");

        var match = {
            'location' : {
              $near : {
                $geometry : {
                  'type' : 'Point',
                  'coordinates' : [
                    lon, //103.816933,
                    lat, //1.450828
                  ]
                },
                $maxDistance : dist //100000
              }
            }
        };

        /*var match = {
          $and : [
            { '_id' : { $ne : session.email } },
            {
              'location' : {
                $near : {
                  $geometry : {
                    'type' : 'Point',
                    'coordinates' : [
                      lon, //103.816933,
                      lat, //1.450828
                    ]
                  },
                  $maxDistance : dist //100000
                }
              }
            },

          ]
        };*/


        var fields = {
          '_id' : 0,
          'userID' : 1,
          'username' : 1,
          'location' : 1,
          'profile_url' : 1 };
        var options = { limit : 10 };


        players.find(
            match,
            fields,
            options,
            function (err, cursor) {
                cursor.toArray (function(err, docs) {
                    console.log('Send ping matches');
                    console.log(docs);
                    res.send(JSON.stringify(docs));
                });
        });

    });

    app.post('/upload', function(req, res, next) {
        console.log('recv uploaded file');
        console.log(req.body);

        var form = new multiparty.Form({
            'autoFiles' : true,
            'uploadDir' : getDataDir()
        });

        var session = getSession(req);

        var username = "";

        // Get current session username
        if (!session) {
            urlhash = murmurhash.v3(Timestamp());
            console.log('Generating new user urlhash %s', urlhash);
            //return res.send({ status : 'error', 'errorno' : 'no session' });
        }
        else if ( session.email ) {
            key = session.email;
            urlhash = murmurhash.v3(key);
            console.log('Existing User Profile Pic Upload: ' + urlhash);
        }
        else if ( session.tempKey ) {
            urlhash = session.tempKey;
            console.log('Temp Key User Profile Pic Upload: ' + urlhash);
        }
        else {
            console.log('Error: No known means of identifying user');
            res.send( { status: STATUS_ERR } );
        }

        form.parse(req, function(err, fields, files) {
            console.log(files);
            var profileImage = files.face_input[0];

            var size = profileImage.size;
            var tmp_path = profileImage.path;
            var filename = profileImage.originalFilename;

            console.log('size: ' + size);
            console.log('tmp_path: ' + tmp_path);
            console.log('filename: ' + filename);

            var new_path = getDataDir() + urlhash + "/";

            var profile_url = '/user/' + urlhash + '/' + filename;

            if ( !fs.existsSync(new_path) ) {
                fs.mkdirSync(new_path);
            }

            fs.rename(tmp_path, new_path + filename, function(err) {

                if (err) return res.send('error: ' + err);

                var data = {
                    'url' : profile_url,
                    'tpath' : new_path + filename,
                    'size' : size,
                    'tempKey' : urlhash,
                    status : 'ok'
                };

                console.log('File renamed: ' + new_path);

                // TODO: Store profile url for user in DB


                setSession(res, 'profile', data.url);
                setSession(res, 'tpath', data.tpath);
                setSession(res, 'tempKey', data.tempKey);
                //res.redirect(data.url);
                res.send(JSON.stringify(data));
            });
        });

    });

});
