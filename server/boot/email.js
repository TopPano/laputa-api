module.exports = function(server) {
  var Email = server.models.Email;
  var auth = Email.dataSource.connector.transports[0].transporter.options.auth;
  auth.xoauth2 = require('xoauth2').createXOAuth2Generator(auth.xoauth2);
};
