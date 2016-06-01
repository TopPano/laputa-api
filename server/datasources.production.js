module.exports = {
  db: {
    connector: 'mongodb',
    url: process.env.DB_URL,
    database: process.env.DB_NAME,
    server: {
      auto_reconnect: true, /* jslint ignore:line */
      reconnectTries: 100,
      reconnectInterval: 3000
    },
    allowExtendedOperators: true
  }
};
