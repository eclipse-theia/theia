#!/bin/bash

: ${ARCH:=`uname -m`}

yum install \
    libX11-devel.$ARCH \
    libxkbfile-devel.$ARCH \
    libsecret-devel
