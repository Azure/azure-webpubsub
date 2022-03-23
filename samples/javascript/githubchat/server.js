const express = require('express');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const { WebPubSubServiceClient } = require('@azure/web-pubsub');
const { WebPubSubEventHandler } = require('@azure/web-pubsub-express');

const app = express();

// initialize github authentication
const users = {};
passport.use(
  new GitHubStrategy({
    clientID: process.env.GitHubClientId,
    clientSecret: process.env.GitHubClientSecret
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
const hubName = 'awpssamplegithubchat';

let connectionString = process.argv[2] || process.env.WebPubSubConnectionString;
let serviceClient = new WebPubSubServiceClient(connectionString, hubName);
let handler = new WebPubSubEventHandler(hubName, {
  path: '/eventhandler',
  handleConnect: (req, res) => {
    res.success({
      groups: ['system', 'message'],
    });
  },
  onConnected: req => {
    console.log(`${req.context.userId} connected`);
    serviceClient.group('system').sendToAll(`${req.context.userId} joined`, { contentType: 'text/plain' });
  },
  handleUserEvent: (req, res) => {
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
  if (req.user.username === process.argv[2]) options.roles = ['webpubsub.sendToGroup.system'];
  let token = await serviceClient.getClientAccessToken(options);
  res.json({
    url: token.url
  });
});

app.use(express.static('public'));
const port= 8080
app.listen(port, () => console.log(`Event handler listening at http://localhost:${port}${handler.path}`));