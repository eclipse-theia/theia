/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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

import { expect } from 'chai';
import { ProgressLocationService } from './progress-location-service';
import { CancellationTokenSource } from '../common';

describe('progress-location-service', () => {

    const EXP = 'exp';
    const SCM = 'scm';
    const FOO = 'foo';

    it('done event should be fired for multiple progress locations – bug #7311', async () => {
        const eventLog = new Array<string>();
        const logEvent = (location: string, show: boolean) => eventLog.push(`${location} show: ${show}`);

        const service = new ProgressLocationService();

        [EXP, SCM, FOO].map(location => {
            service.onProgress(location)(e => logEvent(location, e.show));
            const progressToken = new CancellationTokenSource();
            service.showProgress(`progress-${location}-${Date.now()}`, { text: '', options: { location } }, progressToken.token);
            return progressToken;
        }).forEach(t => t.cancel());

        expect(eventLog.join('\n')).eq(`
exp show: true
scm show: true
foo show: true
exp show: false
scm show: false
foo show: false
        `.trim());
    });

});
