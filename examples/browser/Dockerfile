# How to use this image
# 
# The following instructions assume that you do not have Docker or Node
# installed on your computer. Instead, you will use the online Docker
# playground website 'Play With Docker (PWD)' to run the Theia browser example
# by just using PWD through your browser.
# 
# 1. First, open up http://labs.play-with-docker.com/ in your browser and
#    create a Play With Docker session and add a new instance to your Docker
#    playground.
# 
# 2. Next, you will need to download this Dockerfile into your PWD session with
#    wget.
# 
# $ wget https://raw.githubusercontent.com/theia-ide/theia/master/examples/browser/Dockerfile
# 
# 3. Next, ask Docker to build the image. This will take some time.
# 
# $ docker build -t theia .
# 
# 4. Now use Docker to run the image you just built.
# 
# $ docker run -d -p 0.0.0.0:3000:3000 theia
# 
# 5. There should now be a 3000 link at the top of your PWD window. Click on it
#    to try out the Theia browser example!
#    
#    Note that you may get an "Error forwarding request." error after clicking
#    on the 3000 link. Please wait a few seconds before trying again as Theia
#    may not have completely finished starting up yet.
#
# Note: If you want Java language support you will need to extend this image yourself
# by adding a JDK to the image and making sure it is accessible via the system PATH.

FROM node:8
RUN useradd --create-home theia
WORKDIR /home/theia
RUN rm -rf /opt/yarn && rm -f /usr/local/bin/yarn && rm -f /usr/local/bin/yarnpkg
RUN apt-get update && apt-get install -y npm && npm install -g yarn@1.3.2
USER theia
RUN git clone --depth 1 https://github.com/theia-ide/theia && \
    cd theia && \
    yarn
EXPOSE 3000
WORKDIR /home/theia/theia/examples/browser
ENV SHELL /bin/bash
CMD yarn run start --hostname 0.0.0.0
