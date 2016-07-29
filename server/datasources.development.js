module.exports = {
  db: {
    connector: 'mongodb',
    url: process.env.DB_URL || 'mongodb://localhost:27017/verpix-dev-db',
    allowExtendedOperators: true
  }
};
