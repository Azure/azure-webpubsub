// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.
var fs = require('fs');

module.exports = function (context, req) {
  fs.readFile('index.html', 'utf8', function (err, data) {
    if (err) {
      console.log(err);
    }
    console.log('good');
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