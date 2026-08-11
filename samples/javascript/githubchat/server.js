const express = require('express');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const { WebPubSubServiceClient } = require('@azure/web-pubsub');
const { WebPubSubEventHandler } = require('@azure/web-pubsub-express');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) {
  app.set('trust proxy', 1);
}
if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production');
}
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

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
// codeql[js/clear-text-cookie] Local development uses HTTP; production requires HTTPS at the trusted proxy.
app.use(session({
  resave: false,
  saveUninitialized: true,
  secret: sessionSecret,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction
  }
}));
app.use(passport.initialize());
app.use(passport.session());
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
app.get('/auth/github/callback', passport.authenticate('github', { successRedirect: '/' }));

// initialize web pubsub event handlers
const hubName = 'sample_githubchat';

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
const port = 8080;
app.listen(port, () => console.log(`Event handler listening at http://localhost:${port}${handler.path}`));