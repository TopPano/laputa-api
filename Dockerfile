#This dockerfile uses the ubuntu image
FROM toppano/laputa-base:latest

MAINTAINER uniray7 uniray7@gmail.com

# install nodejs
ENV NODE_VERSION 5.11.1
ENV NVM_DIR /home/.nvm

RUN . $NVM_DIR/nvm.sh && nvm install v$NODE_VERSION && nvm alias default v$NODE_VERSION
ENV PATH $NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

#install pm2
RUN npm install -g pm2

# install python2.7 for bcrypt, which is node_module of laputa-api
RUN apt-get install -y python

# setup project
ADD . /home/verpix/laputa-api
RUN chown -R verpix:verpix /home/verpix/laputa-api

USER verpix
WORKDIR /home/verpix/laputa-api
RUN git submodule init
RUN git submodule update
RUN npm install

# set S3, mongodb, gearmand
ARG BKT_NAME
ARG CDN_URL
ARG DB_URL
ARG GEARMAN_HOST

EXPOSE 3000
ENV BKT_NAME=$BKT_NAME
ENV CDN_URL=$CDN_URL
ENV DB_URL=$DB_URL
ENV G_SERVERS='[{"host":"'$GEARMAN_HOST'", "port":4730}]'

CMD npm run docker-start
