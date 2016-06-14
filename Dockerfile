#This dockerfile uses the ubuntu image
FROM ubuntu:14.04

MAINTAINER uniray7 uniray7@gmail.com

# install nodejs
RUN apt-get update
RUN apt-get install -y curl
RUN curl -sL https://deb.nodesource.com/setup_5.x | sudo -E bash -
RUN apt-get install -y nodejs
RUN apt-get install -y build-essential

# install python2.7 for bcrypt, which is node_module of laputa-api
RUN apt-get install -y python

ADD . /laputa-api
WORKDIR /laputa-api
RUN npm install

EXPOSE 3000
ENV DB_URL='mongodb://DB_IP:DB_PORT/DB_NAME?allowExtendedOperators=true&readPreference=secondary'
ENV G_SERVERS='{"host":"gearmand_ip", "port":gearmand_port}'
CMD DB_NAME=verpix-dev-db S3_BKT=verpix-img-development-base NODE_ENV=production npm run dev
