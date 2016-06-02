# Laputa-API

# Getting Started
Install dependent npm modules.
```
$ npm install
```

Install dependencies:

* [GraphicsMagick](http://www.graphicsmagick.org/) or [ImageMagick](http://www.imagemagick.org/)
  * In Mac OS X, you can simply use [Homebrew](http://mxcl.github.io/homebrew/) and do:
```
$ brew install imagemagick
$ brew install graphicsmagick
```

* [pm2](http://pm2.keymetrics.io/)
```
$ npm install pm2 -g
```

Start the server.
In production environment:
```
$ DB_URL='DB URL' DB_NAME='DB NAME' npm start
```

In developement environment:
```
$ npm run dev
```

Then you can access the server api via:

  http://HOSTNAME:3000/api

# Testing
```
$ npm test
```

The project is generated by [LoopBack](http://loopback.io).
