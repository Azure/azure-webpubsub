const express = require('express');
const path = require('path');
const session = require("express-session");
const bodyParser = require("body-parser");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const { useAzureSocketIO, negotiate } = require("@azure/web-pubsub-socket.io");
const parse = require('url').parse;
const cookieParser = require('cookie');
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);

const app = express();
const server = require("http").createServer(app);
const io = require('socket.io')(server);
const store = new session.MemoryStore();
const sessionMiddleware = session({ store: store, secret: "changeit", resave: false, saveUninitialized: false });

app.use(sessionMiddleware);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(passport.initialize());
app.use(passport.session());

const USERS = [
  { id: 0, username: "john", password: "doe", age: 18 }
];

passport.use(
  new LocalStrategy((username, password, done) => {
    if (username === USERS[0].username && password === USERS[0].password) {
      console.log("authentication OK");
      return done(null, USERS[0]);
    } else {
      console.log("wrong credentials");
      return done(null, false);
    }
  })
);

app.get("/", (req, res) => {
  const isAuthenticated = !!req.user;
  if (isAuthenticated) {
    console.log(`user is authenticated, session is ${req.session.id}`);
  } else {
    console.log("unknown user");
  }
  res.sendFile(isAuthenticated ? "index.html" : "login.html", { root: path.join(__dirname, "/public") });
});

app.post("/login", passport.authenticate("local", {
  successRedirect: "/",
  failureRedirect: "/",
})
);

app.post("/logout", (req, res) => {
  console.log(`logout ${req.session.id}`);
  const socketId = req.session.socketId;
  if (socketId && io.of("/").sockets.get(socketId)) {
    console.log(`forcefully closing socket ${socketId}`);
    io.of("/").sockets.get(socketId).disconnect(true);
  }
  req.logout(() => {
    console.log("Session log out successfully");
  });
  res.cookie("connect.sid", "", { expires: new Date() });
  res.redirect("/");
});

passport.serializeUser((user, cb) => {
  console.log(`serializeUser ${user.id}`);
  cb(null, user.id);
});

passport.deserializeUser((id, cb) => {
  console.log(`deserializeUser ${id}`);
  cb(null, USERS[id]);
});

async function main() {
  const wpsOptions = {
    hub: "eio_hub",
    connectionString: process.argv[2] || process.env.WebPubSubConnectionString,
  };

  await useAzureSocketIO(io, wpsOptions);

  // ------------------------- Auth -------------------------
  app.use(negotiate("/negotiate", io, (req) => {
    const query = parse(req.url || "", true).query;
    const expirationMinutes = Number(query["expirationMinutes"]) ?? undefined;

    const cookies = cookieParser.parse(req.headers.cookie);
    // "connect.sid" is the cookie name set by express-session
    const sessionCookie = cookies["connect.sid"];

    return {
      expirationTimeInMinutes: expirationMinutes,
      customClaims: {
        sessionCookie: sessionCookie
      }
    };
  }))

  io.use((socket, next) => {
    const customClaims = socket.request["claims"].customClaims;
    const sessionCookie = customClaims.sessionCookie;

    socket.request.headers.cookie = socket.request.headers.cookie ?? "" + cookieParser.serialize("connect.sid", sessionCookie);
    next();
  });
  // ------------------------- Auth -------------------------

  io.use(wrap(sessionMiddleware));
  io.use(wrap(passport.initialize()));
  io.use(wrap(passport.session()));

  // Now both `socket.request.user` and `socket.request.session` are available.
  io.use((socket, next) => {
    if (socket.request.user) {
      next();
    } else {
      next(new Error('unauthorized'))
    }
  });

  io.on('connect', (socket) => {
    console.log(`new connection ${socket.id}`);
    socket.on('whoami', (cb) => {
      cb(socket.request.user ? socket.request.user.username : '');
    });

    const session = socket.request.session;
    console.log(`saving sid ${socket.id} in session ${session.id}`);
    session.socketId = socket.id;
    session.save();
  });

  const port = 3000;

  server.listen(port, () => {
    console.log(`application is running at: http://localhost:${port}`);
  });
}

main();