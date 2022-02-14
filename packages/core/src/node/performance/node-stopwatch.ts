/********************************************************************************
* Copyright (c) 2019, 2021 TypeFox, STMicroelectronics and others.
*
* This program and the accompanying materials are made available under the
* terms of the Eclipse Public License 2.0 which is available at
* http://www.eclipse.org/legal/epl-2.0.
*
* This Source Code may also be made available under the following Secondary
* Licenses when the conditions for such availability set forth in the Eclipse
* Public License v. 2.0 are satisfied: GNU General Public License, version 2
* with the GNU Classpath Exception which is available at
* https://www.gnu.org/software/classpath/license.html.
*
* SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
*******************************************************************************/

import { injectable } from 'inversify';
import { performance } from 'perf_hooks';
import { Measurement, MeasurementOptions, Stopwatch } from '../../common';

@injectable()
export class NodeStopwatch extends Stopwatch {

    constructor() {
        super({
            owner: 'backend',
            now: () => performance.now(),
        });
    }

    start(name: string, options?: MeasurementOptions): Measurement {
        const startTime = performance.now();

        return this.createMeasurement(name, () => {
            const duration = performance.now() - startTime;
            return duration;
        }, options);
    }

};
