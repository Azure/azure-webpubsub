// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.
var fs = require('fs');
var path = require('path');

module.exports = function (context, req) {
    var index = 'index.html';
    if (process.env["HOME"] != null)
    {
        index = path.join(process.env["HOME"], "site", "wwwroot", index);
    }
    context.log("index.html path: " + index);
    fs.readFile(index, 'utf8', function (err, data) {
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