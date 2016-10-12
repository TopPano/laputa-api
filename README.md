# Verpix-API

The API backend for [Verpix](https://www.verpix.me).

## Installation
Install dependent npm modules:

```
$ npm install
```

Install dependent tools:

* [pm2](http://pm2.keymetrics.io/)

```
$ npm install pm2 -g
```

Install [Gearman](http://gearman.org/getting-started/#installing).

* Install Gearman on [Mac](http://richardsumilang.com/server/gearman/install-gearman-on-os-x/)

## As a service

* Build image

    ```sh

    ```
* Create container
    
    ```sh
    docker create -p 3000:3000 --restart always --env DB_URL='mongodb://$user:$passwd@mongodb-a1:$port,mongodb-a2:$port,mongodb-a3:$port/$db_name?allowExtendedOperators=true&readPreference=secondary' --add-host=mongodb-a1:$IP --add-host=mongodb-a2:$IP --add-host=mongodb-a3:$IP --add-host=gearmand:$IP $imageId
    ```

* Start container

    ```sh
    docker start $containerId
    ``` 


## Usage

Set up a [Gearman job server](http://gearman.org/getting-started/#starting) before starting the server.

### Environment Variables
* `HOST` The hostname of the server (default: '0.0.0.0')
* `PORT` The port number that the server is serving (default: 3000)
* `NODE_ENV` The environment mode (dev/production) that the server is running
* `DB_URL` The URL to connect to MongoDB service (default in Dev mode: 'mongodb://localhost:27017/verpix-dev-db', no default setting for Production mode)
* `S3_BKT` The bucket name of the AWS S3 service (no default setting)
* `G_SERVERS` The server list of the gearman job servers (default: [ { host: 'localhost', port: 4370 } ])

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
$ DB_URL='mongodb://localhost:27017/verpix-dev-db' S3_BKT='verpix-img-production' G_SERVERS='[{"host": "localhost", "port": 4370}]' npm start
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
