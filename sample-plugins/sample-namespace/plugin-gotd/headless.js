// *****************************************************************************
// Copyright (C) 2023 EclipseSource and others.
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

const gotd = require('@theia/api-provider-sample');

const GreetingKind = gotd.greeting.GreetingKind;

const toDispose = [];

function greetingKindsToString(greetingKinds) {
    return greetingKinds.map(kind => {
        switch (kind) {
            case GreetingKind.DIRECT:
                return 'DIRECT';
            case GreetingKind.QUIRKY:
                return 'QUIRKY';
            case GreetingKind.SNARKY:
                return 'SNARKY';
            default:
                return '<unknown>';
        }
    }).join(', ');
}

async function greet(greeter) {
    const message = await greeter.getMessage();
    console.log('[GOTD]', message);
}

let busy = false;
const pending = [];
function later(_fn) {
    const task = (fn) => () => {
        fn();
        const next = pending.shift();
        if (next) {
            setTimeout(task(next), 1000);
        } else {
            busy = false;
        }
    }

    if (busy) {
        pending.push(_fn);
    } else {
        busy = true;
        setTimeout(task(_fn), 1000);
    }
}

async function activate () {
    const greeter = await gotd.greeting.createGreeter();
    toDispose.push(greeter.onGreetingKindsChanged(
        kinds => {
            console.log('[GOTD]',
                `Now supporting these kinds of greeting: ${greetingKindsToString(kinds)}.`);
            if (kinds.length > 0) {
                greet(greeter);
            }
        }));

    greet(greeter);

    later(() => greeter.setGreetingKind(GreetingKind.DIRECT, false));
    later(() => greeter.setGreetingKind(GreetingKind.QUIRKY));
    later(() => greeter.setGreetingKind(GreetingKind.SNARKY));
}

module.exports = {
    activate,
    deactivate: function () {
        console.log('[GOTD]', 'Cleaning up.');
        toDispose.forEach(d => d.dispose());
    }
};
