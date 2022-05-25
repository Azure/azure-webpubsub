var fs = require("fs");
var path = require("path");

module.exports = function (context, request) {
  var index = path.join(
    context.executionContext.functionDirectory,
    "public",
    request.query.merge ? "index2.html" : "index.html"
  );
  context.log("requesting path: " + index);
  fs.readFile(index, "utf8", function (err, data) {
    if (err) {
      context.log(err);
      context.done(err);
      return;
    }
    context.res = {
      status: 200,
      headers: {
        "Content-Type": "text/html",
      },
      body: data,
    };
    context.done();
  });
};
