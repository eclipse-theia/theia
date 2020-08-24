/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

export interface Keybinding {
    /** Command identifier, this needs to be a unique string.  */
    command: string;
    /** Keybinding string as defined in packages/keymaps/README.md.  */
    keybinding: string;
    /**
     * The optional keybinding context where this binding belongs to.
     * If not specified, then this keybinding context belongs to the NOOP
     * keybinding context.
     *
     * @deprecated use `when` closure instead
     */
    context?: string;
    /**
     * https://code.visualstudio.com/docs/getstarted/keybindings#_when-clause-contexts
     */
    when?: string;

    /**
     * Specified when the command has arguments that are passed to the command handler.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args?: any;
}
export namespace Keybinding {

    /**
     * Returns with the string representation of the binding.
     * Any additional properties which are not described on
     * the `Keybinding` API will be ignored.
     *
     * @param binding the binding to stringify.
     */
    export function stringify(binding: Keybinding): string {
        const copy: Keybinding = {
            command: binding.command,
            keybinding: binding.keybinding,
            // eslint-disable-next-line deprecation/deprecation
            context: binding.context,
            when: binding.when,
            args: binding.args
        };
        return JSON.stringify(copy);
    }

    /* Determine whether object is a KeyBinding */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function is(arg: Keybinding | any): arg is Keybinding {
        return !!arg && arg === Object(arg) && 'command' in arg && 'keybinding' in arg;
    }
}
