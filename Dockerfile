#This dockerfile uses the ubuntu image
FROM ubuntu:14.04

MAINTAINER uniray7 uniray7@gmail.com

# install basic packages
RUN apt-get update
RUN apt-get install -y curl

# install nodejs
ENV NODE_VERSION 5.11.1
ENV NVM_DIR /home/.nvm

RUN curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.31.1/install.sh | bash
RUN . $NVM_DIR/nvm.sh && nvm install v$NODE_VERSION && nvm alias default v$NODE_VERSION

ENV PATH      $NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

RUN apt-get update
RUN apt-get install -y build-essential

# install python2.7 for bcrypt, which is node_module of laputa-api
RUN apt-get install -y python

# setup project
ADD . /laputa-api
WORKDIR /laputa-api
RUN npm install

EXPOSE 3000
ENV DB_URL='mongodb://DB_HOST:DB_PORT/DB_NAME?allowExtendedOperators=true'
CMD S3_BKT=verpix-img-development-base npm run dev
