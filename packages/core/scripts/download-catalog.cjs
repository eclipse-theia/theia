// *****************************************************************************
// Copyright (C) 2024 STMicroelectronics and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
const path = require('path');
const { Downloader } = require('nodejs-file-downloader');

const url = 'https://schemastore.org/api/json/catalog.json';

const targetDir = './lib/browser';
const fileName = 'catalog.json';
const targetFile = path.join(targetDir, fileName);

const downloader = new Downloader({
    url,
    directory: targetDir,
    fileName: 'catalog.json',
    timeout: 60000,
    proxy: process.env.http_proxy
        || process.env.HTTP_PROXY
        || process.env.https_proxy
        || process.env.HTTPS_PROXY
        || '',
    cloneFiles: false
});

downloader.download().catch(error => {
    const errorMessage = `
Failed to download ${fileName} from schemastore.org
Error: ${error.message}

This is likely due to one of the following issues:
  1. Network connectivity issues
  2. Proxy configuration needed
  3. SSL certificate validation failure

Possible workarounds:

  1. If behind a proxy, set proxy environment variables:
     export HTTPS_PROXY=http://your-proxy:port
     export HTTP_PROXY=http://your-proxy:port

  2. If you have to use specific SSL certificates:
     export NODE_EXTRA_CA_CERTS=/path/to/certificate.crt

  3. Download the file manually and place it at:
     ${targetFile}
     Download from: ${url}
     Adapt core npm scripts to skip automatic download.
`;
    console.error(errorMessage);
    process.exit(1);
});
