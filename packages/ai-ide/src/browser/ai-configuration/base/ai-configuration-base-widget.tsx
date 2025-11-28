// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import * as React from '@theia/core/shared/react';
import { injectable } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';

/**
 * Base class for all AI configuration widgets providing common structure and lifecycle management.
 */
@injectable()
export abstract class AIConfigurationBaseWidget extends ReactWidget {
    /**
     * Subclasses must implement this method to provide their specific content rendering.
     */
    protected abstract renderContent(): React.ReactNode;

    protected render(): React.ReactNode {
        return (
            <div className='ai-configuration-widget-content'>
                {this.renderContent()}
            </div>
        );
    }
}
