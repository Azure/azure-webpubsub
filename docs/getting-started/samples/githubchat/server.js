const express = require('express');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const { WebPubSubServiceClient } = require('@azure/web-pubsub');
const { WebPubSubCloudEventsHandler } = require('@azure/web-pubsub-express');

const app = express();

// initialize github authentication
const users = {};
passport.use(
  new GitHubStrategy({
    clientID: process.argv[3],
    clientSecret: process.argv[4]
  },
  (accessToken, refreshToken, profile, done) => {
    users[profile.id] = profile;
    return done(null, profile);
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  if (users[id]) return done(null, users[id]);
  return done(`invalid user id: ${id}`);
});

app.use(cookieParser());
app.use(session({
  resave: false,
  saveUninitialized: true,
  secret: 'keyboard cat'
}));
app.use(passport.initialize());
app.use(passport.session());
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
app.get('/auth/github/callback', passport.authenticate('github', { successRedirect: '/' }));

// initialize web pubsub event handlers
const hubName = 'chat';

let serviceClient = new WebPubSubServiceClient(process.argv[2], hubName);
let handler = new WebPubSubCloudEventsHandler(hubName, ['*'], {
  path: '/eventhandler',
  handleConnect: async (req, res) => {
    res.success({
      groups: ['system', 'message'],
    });
  },
  onConnected: async req => {
    console.log(`${req.context.userId} connected`);
    serviceClient.group('system').sendToAll(`${req.context.userId} joined`, { contentType: "text/plain" });
  },
  handleUserEvent: async (req, res) => {
    if (req.context.eventName === 'message') {
      serviceClient.group('message').sendToAll({
        user: req.context.userId,
        message: req.data
      });
    }
    res.success();
  }
});

app.use(handler.getMiddleware());
app.get('/negotiate', async (req, res) => {
  if (!req.user || !req.user.username) {
    res.status(401).send('missing user id');
    return;
  }
  let options = {
    userId: req.user.username
  };
  if (req.user.username === process.argv[5]) options.claims = { role: ['webpubsub.sendToGroup.system'] };
  let token = await serviceClient.getAuthenticationToken(options);
  res.json({
    url: token.url
  });
});

app.use(express.static('public'));
app.listen(8080, () => console.log('server started'));
