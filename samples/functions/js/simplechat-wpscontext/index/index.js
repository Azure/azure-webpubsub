var fs = require('fs');
module.exports = function (context, req) {
    fs.readFile('index.html', 'utf8', function (err, data) {
        if (err) {
            console.log(err);
            context.done(err);
        }
        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'text/html'
            },
            body: data
        };
        context.done();
    });
}