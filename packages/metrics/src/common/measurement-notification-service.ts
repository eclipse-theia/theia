// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
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

import { MeasurementResult } from '@theia/core';

export const measurementNotificationServicePath = '/services/measurement-notification';

export const MeasurementNotificationService = Symbol('MeasurementNotificationService');
export interface MeasurementNotificationService {
    /**
     * Notify the backend when a fronted stopwatch provides a new measurement.
     * @param frontendId The unique id associated with the frontend that sends the notification
     * @param result The new measurement result
     */
    onFrontendMeasurement(frontendId: string, result: MeasurementResult): void;
}
