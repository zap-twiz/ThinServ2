/**
 * This is a small asset server used to serve the images.
 */

var util = require('util'),
  EventEmitter = require('events').EventEmitter;

var restify   = require('restify'),
  longtrace = require('longjohn'),
  Redis = require('redis');

var url = require('url');

function ThinServer(in_params){

  in_params.route = in_params.route || '/assets';
  in_params.port = in_params.port || 8080;
  in_params.uid = in_params.uid || null;

  // these params (expiration/type) are used every request- just set it here
  this._cacheControl = 'public, max-age=' + (in_params.expiration || 180);
  this._contentType = (in_params.contentType || 'application/octet-stream');
  this._redisKeyParser = in_params.redisKeyParser;

  this._rc = Redis.createClient(in_params.redis.port,
    in_params.redis.host,
    in_params.redis.options);

  // inherit from the eventemitters
  EventEmitter.call(this);

  // create a little server
  this._server = restify.createServer();
  this._server.get(in_params.route, this._get.bind(this));
  this._server.listen(in_params.port, function(){

    console.log('listening on port %s', in_params.port);

    // in production/staging we need to drop down our permissions
    if (in_params.uid){
      process.setuid(in_params.uid);
    }

    this.emit('ready');

  });
}
util.inherits(ThinServer,EventEmitter);

ThinServer.prototype._get = function(req,res) {
  req.parsed_url = url.parse(req.url, true);
  var guid = req.parsed_url.query.guid;
  var type = req.parsed_url.query.type;
  var subType = req.parsed_url.query.subType;

  if (!guid) {
    res.end("invalid query: no guid.");
    return;
  }

  if (!type) {
    res.end("invalid query: no type.");
    return;
  }

  //TODO: emit servStart, servEnd for metric purposes

  try {
    var redisKey = this._redisKeyParser(req);

    res.writeHead(200, {
      'Content-Type':this._contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods':'GET',
      'Access-Control-Allow-Headers':'Content-Type',
      'Cache-Control': this._cacheControl
    });

    this._rc.get(key, function (err, data) {

      if (!data || !data.length) {
        res.end();
        return;
      }

      res.write(data, 'binary');
      res.end();
    })
  } catch (err) {
    console.error(err)
  }
};

module.exports = ThinServer;
if (!module.parent){
  var serv = new ThinServer({
      route: process.env.ROUTE || '/asset',
      port: process.env.PORT || '8889',
      redisKeyParser : function (req) {
        var key = req.parsed_url.query.guid;
        if (req.parsed_url.query.type){
          key = req.parsed_url.query.type+'/'+key+':' + req.parsed_url.query.type;
        }
        return key;
      },
      redis:{
        port: process.env.REDIS_PORT || 6379,
        host: process.env.REDIS_HOST || 'localhost'
      }}
  )
}