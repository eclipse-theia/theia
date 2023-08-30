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
* SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
*******************************************************************************/

import { injectable } from 'inversify';
import { Measurement, MeasurementOptions, Stopwatch } from '../../common';

@injectable()
export class FrontendStopwatch extends Stopwatch {

    constructor() {
        super({
            owner: 'frontend',
            now: () => performance.now(),
        });
    }

    start(name: string, options?: MeasurementOptions): Measurement {
        const startMarker = `${name}-start`;
        const endMarker = `${name}-end`;
        performance.clearMeasures(name);
        performance.clearMarks(startMarker);
        performance.clearMarks(endMarker);

        performance.mark(startMarker);

        return this.createMeasurement(name, () => {
            performance.mark(endMarker);

            let duration: number;
            let startTime: number;

            try {
                performance.measure(name, startMarker, endMarker);

                const entries = performance.getEntriesByName(name);
                // If no entries, then performance measurement was disabled or failed, so
                // signal that with a `NaN` result
                duration = entries[0].duration ?? Number.NaN;
                startTime = entries[0].startTime ?? Number.NaN;
            } catch (e) {
                console.warn(e);
                duration = Number.NaN;
                startTime = Number.NaN;
            }

            performance.clearMeasures(name);
            performance.clearMarks(startMarker);
            performance.clearMarks(endMarker);
            return { startTime, duration };
        }, options);
    }
};
