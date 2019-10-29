/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
// copied and modified from https://github.com/microsoft/vscode/blob/ba40bd16433d5a817bfae15f3b4350e18f144af4/src/vs/workbench/contrib/webview/browser/pre/host.js
// @ts-check
(function () {
    const id = document.location.search.match(/\bid=([\w-]+)/)[1];

    const hostMessaging = new class HostMessaging {
        constructor() {
            this.handlers = new Map();
            window.addEventListener('message', (e) => {
                if (e.data && (e.data.command === 'onmessage' || e.data.command === 'do-update-state')) {
                    // Came from inner iframe
                    this.postMessage(e.data.command, e.data.data);
                    return;
                }

                const channel = e.data.channel;
                const handler = this.handlers.get(channel);
                if (handler) {
                    handler(e, e.data.args);
                } else {
                    console.error('no handler for ', e);
                }
            });
        }

        postMessage(channel, data) {
            window.parent.postMessage({ target: id, channel, data }, '*');
        }

        onMessage(channel, handler) {
            this.handlers.set(channel, handler);
        }
    }();

    const workerReady = new Promise(async (resolveWorkerReady) => {
        if (!areServiceWorkersEnabled()) {
            console.error('Service Workers are not enabled. Webviews will not work properly');
            return resolveWorkerReady();
        }

        const expectedWorkerVersion = 1;

        navigator.serviceWorker.register('service-worker.js').then(async registration => {
            await navigator.serviceWorker.ready;

            const versionHandler = (event) => {
                if (event.data.channel !== 'version') {
                    return;
                }

                navigator.serviceWorker.removeEventListener('message', versionHandler);
                if (event.data.version === expectedWorkerVersion) {
                    return resolveWorkerReady();
                } else {
                    // If we have the wrong version, try once to unregister and re-register
                    return registration.update()
                        .then(() => navigator.serviceWorker.ready)
                        .finally(resolveWorkerReady);
                }
            };
            navigator.serviceWorker.addEventListener('message', versionHandler);
            registration.active.postMessage({ channel: 'version' });
        });

        const forwardFromHostToWorker = (channel) => {
            hostMessaging.onMessage(channel, event => {
                navigator.serviceWorker.ready.then(registration => {
                    registration.active.postMessage({ channel: channel, data: event.data.args });
                });
            });
        };
        forwardFromHostToWorker('did-load-resource');
        forwardFromHostToWorker('did-load-localhost');

        navigator.serviceWorker.addEventListener('message', event => {
            if (['load-resource', 'load-localhost'].includes(event.data.channel)) {
                hostMessaging.postMessage(event.data.channel, event.data);
            }
        });
    });

    function areServiceWorkersEnabled() {
        try {
            return !!navigator.serviceWorker;
        } catch (e) {
            return false;
        }
    }

    window.createWebviewManager({
        postMessage: hostMessaging.postMessage.bind(hostMessaging),
        onMessage: hostMessaging.onMessage.bind(hostMessaging),
        ready: workerReady,
        fakeLoad: true
    });
}());
