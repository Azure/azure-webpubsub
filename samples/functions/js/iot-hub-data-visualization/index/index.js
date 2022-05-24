var fs = require("fs");
var path = require("path");

module.exports = function (context) {
  var index = path.join(
    context.executionContext.functionDirectory,
    "public",
    "index.html"
  );
  context.log("requesting path: " + index);
  fs.readFile(index, "utf8", function (err, data) {
    if (err) {
      console.log(err);
      context.done(err);
      return;
    }
    let contentType = "text/html";
    if (index.endsWith(".css")) {
      contentType = "text/css";
    } else if (index.endsWith(".js")) {
      contentType = "application/javascript";
    }
    context.res = {
      status: 200,
      headers: {
        "Content-Type": contentType,
      },
      body: data,
    };
    context.done();
  });
};
