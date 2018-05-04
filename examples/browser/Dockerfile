# Build image:
#    $ docker build --build-arg GITHUB_TOKEN=<token> -t theia .
#
#    Note to build that image you may need to build theia-dev image using Dockerfile.dev
#
#    Note that sometimes you can reach Github API rate limit, so to solve this
#    issue please set build-arg GITHUB_TOKEN as per example
#
# Running theia in a docker container:
#    $ docker run -d -p 0.0.0.0:3000:3000 theia
#
#    To access theia-ide open localhost:3000 in your browser
#
#    Note that you may get an "Error forwarding request." error after clicking
#    on the 3000 link. Please wait a few seconds before trying again as Theia
#    may not have completely finished starting up yet.
#
# Note: If you want Java language support you will need to extend this image yourself
# by adding a JDK to the image and making sure it is accessible via the system PATH.

FROM theia-dev
ARG GITHUB_TOKEN
ENV GITHUB_TOKEN ${GITHUB_TOKEN}
RUN git clone --depth 1 https://github.com/theia-ide/theia && \
    cd theia && \
    yarn
EXPOSE 3000
WORKDIR /home/theia/theia/examples/browser
ENV SHELL /bin/bash
CMD yarn run start --hostname 0.0.0.0
