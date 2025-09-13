const express = require('express');
const session = require("express-session");
const bodyParser = require("body-parser");
const passport = require("passport");
const GitHubStrategy = require('passport-github2').Strategy;
const azure = require("@azure/web-pubsub-socket.io");
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);

const app = express();
const server = require("http").createServer(app);
const store = new session.MemoryStore();
const sessionMiddleware = session({ store: store, secret: "changeit", resave: false, saveUninitialized: false });

app.use(sessionMiddleware);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(passport.initialize());
app.use(passport.session());
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
app.get('/auth/github/callback', passport.authenticate('github', { successRedirect: '/' }));

var users = [];

passport.use(
    new GitHubStrategy({
        clientID: process.env.GitHubClientId,
        clientSecret: process.env.GitHubClientSecret
    },
    (accessToken, refreshToken, profile, done) => {
        console.log(`${profile.username}(${profile.displayName}) authenticated`);
        users[profile.id] = profile;
        return done(null, profile);
    }
));

passport.serializeUser((user, done) => {
    console.log(`serializeUser ${user.id}`);
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    console.log(`deserializeUser ${id}`);
    if (users[id]) return done(null, users[id]);
    return done(`invalid user id: ${id}`);
});

app.post("/login", passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/",
})
);


async function main() {
    const wpsOptions = {
        hub: "eio_hub",
        connectionString: process.argv[2] || process.env.WebPubSubConnectionString,
    };

    const io = require('socket.io')(server);

    await azure.useAzureSocketIO(io, wpsOptions);

    app.get("/negotiate", azure.negotiate(io, azure.usePassport()));
    io.use(wrap(azure.restorePassport()));

    io.use(wrap(passport.initialize()));
    io.use(wrap(passport.session()));

    // Now `socket.request.user` is available. While `req.request.session` is not.
    io.use((socket, next) => {
        if (socket.request.user) {
            next();
        } else {
            next(new Error('unauthorized'))
        }
    });

    io.on('connect', (socket) => {
        console.log(`new connection ${socket.id}`);

        console.log(`socket.request.user.id = ${socket.request.user.id}`);

        socket.on('whoami', (cb) => {
            console.log(`${socket.request.user.username}`);
            cb(`${socket.request.user.username}`);
        });
    });

    let numUsers = 0;

    io.on('connection', socket => {
        let addedUser = false;

        // when the client emits 'new message', this listens and executes
        socket.on('new message', (data) => {
            // we tell the client to execute 'new message'
            socket.broadcast.emit('new message', {
                username: socket.username,
                message: data
            });
        });

        // when the client emits 'add user', this listens and executes
        socket.on('add user', (username) => {
            if (addedUser) return;

            // we store the username in the socket session for this client
            socket.username = username;
            ++numUsers;
            addedUser = true;
            socket.emit('login', {
                numUsers: numUsers
            });
            // echo globally (all clients) that a person has connected
            socket.broadcast.emit('user joined', {
                username: socket.username,
                numUsers: numUsers
            });
        });

        // when the user disconnects.. perform this
        socket.on('disconnect', () => {
            if (addedUser) {
                --numUsers;

                // echo globally that this client has left
                socket.broadcast.emit('user left', {
                    username: socket.username,
                    numUsers: numUsers
                });
            }
        });
    });

    app.use(express.static('public'));

    const port = 3000;
    server.listen(port, () => {
        console.log(`application is running at: http://localhost:${port}`);
    });
}

main();