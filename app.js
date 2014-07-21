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
    SERVER_ENV = require(__dirname + '/env.json');

var app = express();

var port = SERVER_ENV.web_port;

var SERVER_PUBLIC_ADDR = SERVER_ENV.web_url;

var sessionMiddleWare = function(req, res, next) {
    var session_id = req.cookies;
    
    console.log('parsing cookies');
    console.log(session_id);
    //req.username = username;
    
    return next();
}

function getSession(req)
{
    if (req.cookies && req.cookies.email) {
        return {
            'username' : req.cookies.email,
            'profile'  : req.cookies.profile,
            'lastseen' : req.cookies.lastseen
        };
    }
    return null;
}

mongodb.connect(SERVER_ENV.db_url, function(err, db) {                   

    if (err) {
        console.log('Error connecting to DB');
        return;
    }
    
    var server = http.createServer(app).listen(port, function(err) {
        if (err) return console.log('Error in startin server: ' + err);
        console.log("HTTP Listening on " + server.address().port);  
        console.dir(server.address());
    });
    
    // settings
    app.set('trust proxy', true);
    
    // express logging middleware
    //app.use( morgan()
    //);
            
    // POST middleware
    app.use(bodyParser.json());       // to support JSON-encoded bodies
    app.use(bodyParser.urlencoded()); // to support URL-encoded bodies   
    app.use(cookieParser());
            
    // server static pages middleware
    app.use('/', express.static(__dirname + '/views/'));
    
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

        var query = {
            '_id' : email,
            'password' : password
        };
        
        var fields = {
            'password' : 0  
        };
        
        players.findOne( query, fields, function (err, doc) {
            
            if (err) return res.send({'status' : 'error', 'errorno' : err})
            
            if (!doc) return res.send({'status' : 'error', 'errorno' : 'Not Found'});
            
            var lastseen = new Date();
            
            players.update(
                {'_id' : email}, 
                { $set : { 'lastseen' : lastseen } }, 
                function(err) {
                if (err) return console.log('error setting lastseen');
                
                console.log('updated lastseen for ' + email);
            });
            
            res.cookie('email', email, { maxAge: 900000, httpOnly: true });
            res.cookie('lastseen', lastseen, { maxAge: 900000, httpOnly: true });
            if (req.cookies) {
                res.send(JSON.stringify(req.cookies));
            }
            else {
                res.send( {'status' : 'ok'} );
            }
        });                
    });    
    
    
    app.post('/register', function (req, res) {
        console.log(req.ips);   
        console.log(req.body);    
        console.log('Registering New User');

        var post = req.body;
        var players = db.collection('players');
        
        var email     = post['email'];        
        var firstname = post['first'];
        var lastname  = post['last'];
        var password  = post['password'];

        
        var player = { 
            '_id' : email, 
            'firstname' : firstname,
            'lastname' : lastname,
            'password' : password,
            'lastseen' : new Date()
        };

        players.insert( player, { w : 1 }, function(err, document) {
            if (err) {
                res.send({'status' : 'error'});
                console.log('error in registering: ' + err);   
            }
            
            console.dir(document[0]);
            res.send({'status' : 'ok'});
        });        
        
    });
    
    
    var apiRouter = express.Router();
    app.use('/api', apiRouter);

    
    apiRouter.get('/profile/me',  function (req, res) {   
       
        console.log(req.query);     
        console.log('Update Profile');        
        
        var post = req.body;
        var players = db.collection('players');
        
        var query  = { '_id' : username };
        var fields = { 'password' : 0 };
        
        players.findOne( query, fields, function (err, doc) {
            res.send(JSON.stringify(docs));
        });
    });
    
    apiRouter.post('/profile/update',  function (req, res) {   
       
        console.log(req.query);     
        console.log('Update Profile');        
        
        var session = getSession(req);
        
        if (!session) return res.send({ status : 'error', 'errorno' : 'no session'});        
        
        console.log(session);
        
        var post = req.body;
        
        var dob     = post['dob'];
        var height  = post['height'];
        var weight  = post['weight'];
        var city    = post['city'];
        var country = post['country'];   
       
        var players = db.collection('players');
        
        var query  = { '_id' : session.username };
        var options = { w : 1, j : 1 };
        
        var update = {
            'dob' : dob,
            'height' : height,
            'weight' : weight,
            'city' : city,
            'country' : country         
        };

        // Update profile      
        players.update( query, update, options, function (err, num_records) {
            
            if (err) return res.send({ status : 'error', 'errorno' : err}); 
            
            res.send({ status : 'ok' });
        });
    });    
    
    
    apiRouter.get('/ping', function (req, res) {
        
        var players = db.collection("players");
        
        var match = {};
        var fields = {};
        var options = { limit : 10 };
        
        players.find( 
            match, 
            fields,
            options, 
            function (err, cursor) {
                cursor.toArray (function(err, docs) {
                    console.log('send drinks menu');
                    res.send(JSON.stringify(docs));
                });
        });
        
    });
    
    app.post('/upload', function(req, res, next) {
        console.log('recv uploaded file');
        console.log(req.body);
        
        var form = new multiparty.Form();

        var username = null;
        var urlhash = null;
        
        // Get current session username
        if (req.cookies && req.cookies.email) {            
            username = req.cookies.email;
            urlhash = murmurhash.v3(username);
            
            // verify email from db
            console.log('Existing Login: ' + req.cookies.email);   
        }
        
        form.parse(req, function(err, fields, files) {
            
            var profileImage = files.face_input[0];
      
            var size = profileImage.size;
            var tmp_path = profileImage.path;
            var filename = profileImage.originalFilename;
            
            console.log('size: ' + size);
            console.log('tmp_path: ' + tmp_path);
            console.log('filename: ' + filename);
            
            var new_path = __dirname + "/views/profile/" + urlhash + "/";
            
            var profile_url = '/profile/' + urlhash + '/' + filename;
            
            if ( !fs.existsSync(new_path) ) {
                fs.mkdirSync(new_path);
            }
            
            fs.rename(tmp_path, new_path + filename, function(err) {

                if (err) return res.send('error: ' + err); 
                
                var data = {
                    'url' : profile_url,
                    'size' : size,
                    status : 'ok'  
                };
                
                console.log('File renamed: ' + new_path);
                
                // TODO: Store profile url for user in DB
                
                
                res.cookie('profile', data.url, { maxAge: 900000, httpOnly: true });
                //res.redirect(data.url);
                res.send(JSON.stringify(data));
            });
        });

    });    
    
});  
