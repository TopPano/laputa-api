# Verpix-API

The API backend for service [Verpix](https://www.verpix.me).

## Installation
Install dependent npm modules.

```
$ cd laputa-api
$ npm install
```

Install dependent tools:

* [pm2](http://pm2.keymetrics.io/)

```
$ npm install pm2 -g
```

## Usage

### Environment Variables
* `HOST` The hostname of the serice (default: '0.0.0.0')
* `PORT` The port number that the service is serving (default: 3000)
* `NODE_ENV` The environment mode (dev/production) that the service is running
* `DB_URL` The URL to connect to MongoDB service (default in Dev mode: 'mongodb://localhost:27017/verpix-dev-db', no default setting for Production mode)
* `S3_BKT` The bucket name of the AWS S3 service (no default setting)
* `G_SERVERS` The server list of the gearman job servers (default: [ { host: 'hostlocal', port: 4370 } ])

### Development Mode
You need to setup a MongoDB service for server to running in this mode. The default MongoDB setting for the server is **'mongodb://localhost:27017/verpix-dev-db'**. To change the default setting, use the environment variable: `DB_URL`.

#### Running in default setting

```
$ npm run dev
```

#### Running in custom setting for MongoDB

```
$ DB_URL='mongodb://192.0.0.1:27019/verpix-dev-db2' npm run dev
```

#### Running in custom setting for S3

```
$ S3_BKT='verpix-dev-bucket-2' npm run dev
```

You can access the API documentation in this mode at `http://localhost:3000`.

### Production Mode
The server will be running in background and monitoring by pm2 in this mode. It's also need MongoDB as a dependent service, and there is no default setting for MongoDB and S3 in this mode.

#### To start the server:

```
$ DB_URL='mongodb://localhost:27017/verpix-dev-db' S3_BKT='verpix-img-production' npm start
```

By default, `npm start` will set env variable `NODE_ENV` to **production** so you don't have to set it manually.

#### To check the server status by pm2:

```
$ pm2 show verpix-api
$ pm2 status
```

#### To stop the server:

```
$ npm stop
```

## Testing
```
$ npm test
```
