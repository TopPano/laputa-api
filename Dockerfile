#This dockerfile uses the ubuntu image
FROM ubuntu:14.04

MAINTAINER uniray7 uniray7@gmail.com

# install basic packages
RUN apt-get update
RUN apt-get install -y curl
RUN apt-get install -y build-essential

# install nodejs
RUN curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.31.1/install.sh | bash
RUN nvm install 5.11.1

# install python2.7 for bcrypt, which is node_module of laputa-api
RUN apt-get install -y python

# setup project
ADD . /laputa-api
WORKDIR /laputa-api
RUN npm install

EXPOSE 3000
ENV DB_URL='mongodb://DB_HOST:DB_PORT/DB_NAME?allowExtendedOperators=true'
CMD S3_BKT=verpix-img-development-base npm run dev
