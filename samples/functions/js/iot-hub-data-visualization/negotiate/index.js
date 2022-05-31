module.exports = function (context, req, connection) {
  if (!req.query.id) {
    context.res = {
      status: 401,
      body: "Invalid user id",
    };
    context.done();
    return;
  }
  context.res = { body: connection };
  context.done();
};
