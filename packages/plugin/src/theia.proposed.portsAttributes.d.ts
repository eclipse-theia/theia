// *****************************************************************************
// Copyright (C) 2024 Typefox and others.
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module '@theia/plugin' {

    /**
     * The action that should be taken when a port is discovered through automatic port forwarding discovery.
     */
    export enum PortAutoForwardAction {
        /**
         * Notify the user that the port is being forwarded. This is the default action.
         */
        Notify = 1,
        /**
         * Once the port is forwarded, open the user's web browser to the forwarded port.
         */
        OpenBrowser = 2,
        /**
         * Once the port is forwarded, open the preview browser to the forwarded port.
         */
        OpenPreview = 3,
        /**
         * Forward the port silently.
         */
        Silent = 4,
        /**
         * Do not forward the port.
         */
        Ignore = 5
    }

    /**
     * The attributes that a forwarded port can have.
     */
    export class PortAttributes {
        /**
         * The action to be taken when this port is detected for auto forwarding.
         */
        autoForwardAction: PortAutoForwardAction;

        /**
         * Creates a new PortAttributes object
         * @param port the port number
         * @param autoForwardAction the action to take when this port is detected
         */
        constructor(autoForwardAction: PortAutoForwardAction);
    }

    /**
     * A provider of port attributes. Port attributes are used to determine what action should be taken when a port is discovered.
     */
    export interface PortAttributesProvider {
        /**
         * Provides attributes for the given port. For ports that your extension doesn't know about, simply
         * return undefined. For example, if `providePortAttributes` is called with ports 3000 but your
         * extension doesn't know anything about 3000 you should return undefined.
         * @param port The port number of the port that attributes are being requested for.
         * @param pid The pid of the process that is listening on the port. If the pid is unknown, undefined will be passed.
         * @param commandLine The command line of the process that is listening on the port. If the command line is unknown, undefined will be passed.
         * @param token A cancellation token that indicates the result is no longer needed.
         */
        providePortAttributes(attributes: { port: number; pid?: number; commandLine?: string }, token: CancellationToken): ProviderResult<PortAttributes>;
    }

    /**
     * A selector that will be used to filter which {@link PortAttributesProvider} should be called for each port.
     */
    export interface PortAttributesSelector {
        /**
         * Specifying a port range will cause your provider to only be called for ports within the range.
         * The start is inclusive and the end is exclusive.
         */
        portRange?: [number, number] | number;

        /**
         * Specifying a command pattern will cause your provider to only be called for processes whose command line matches the pattern.
         */
        commandPattern?: RegExp;
    }

    export namespace workspace {
        /**
         * If your extension listens on ports, consider registering a PortAttributesProvider to provide information
         * about the ports. For example, a debug extension may know about debug ports in it's debuggee. By providing
         * this information with a PortAttributesProvider the extension can tell the editor that these ports should be
         * ignored, since they don't need to be user facing.
         *
         * The results of the PortAttributesProvider are merged with the user setting `remote.portsAttributes`. If the values conflict, the user setting takes precedence.
         *
         * @param portSelector It is best practice to specify a port selector to avoid unnecessary calls to your provider.
         * If you don't specify a port selector your provider will be called for every port, which will result in slower port forwarding for the user.
         * @param provider The {@link PortAttributesProvider PortAttributesProvider}.
         * @stubbed
         */
        export function registerPortAttributesProvider(portSelector: PortAttributesSelector, provider: PortAttributesProvider): Disposable;
    }
}
