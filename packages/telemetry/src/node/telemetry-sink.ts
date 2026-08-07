// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

import { MaybePromise } from '@theia/core/lib/common';
import { TelemetryEvent } from '../common/telemetry-protocol';

/** @experimental */
export const TelemetrySink = Symbol('TelemetrySink');

/** @experimental */
export interface TelemetrySink {
    /**
     * A unique sink ID containing at least two slash-separated segments.
     * @experimental
     */
    readonly id: string;
    /**
     * A non-empty list of valid telemetry topic patterns.
     * @experimental
     */
    readonly interests: readonly string[];
    /**
     * Defaults to `remote`.
     * @experimental
     */
    readonly scope?: 'local' | 'remote';
    /**
     * Must not synchronously call `TelemetryService.report`, which can cause recursive dispatch or a sink cycle.
     * Defer any follow-up telemetry until after the current handler call.
     * @experimental
     */
    handle(event: TelemetryEvent): MaybePromise<void>;
    /** @experimental */
    flush?(): MaybePromise<void>;
}
