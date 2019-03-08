/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { Event } from '@theia/core';
import { BaseWidget } from '@theia/core/lib/browser';

/*
 * Object to store terminal widget size.
 */
export class TerminalSize {
    readonly cols: number;
    readonly rows: number;
}

/**
 * Terminal UI widget.
 * Terminal widget responsible to render backend output and catch user input.
 */
export abstract class TerminalWidget extends BaseWidget {

    /**
     * Return unique process id(PID).
     */
    abstract processId: Promise<number>;

    /**
     * Start terminal and return terminal id.
     * @deprecated use createProcess() and attach(), please.
     * @param id - terminal id.
     */
    abstract start(id?: number): Promise<number>;

    /**
     * Create new process and attach terminal widget to this process.
     */
    abstract createAndAttach(): Promise<number>;

    /**
     * Attach to already running process.
     * @param terminalId - unique process backend id(it's not PID, it's backend id to count runnting processes).
     * @param createNewTerminalOnFaill - spawn new process in case if
     * target process was not found by terminalId or it's gone. NOTICE: False by default.
     */
    abstract attach(processId: number, createNewProcessOnFail?: boolean): Promise<number>;

    /**
     * Send text to the terminal server.
     * @param text - text content.
     */
    abstract sendText(text: string): void;

    /**
     * Write some text content to the widget.
     */
    abstract write(data: string): void;

    /*
     * Send event on open terminal widget.
     */
    abstract onDidOpen: Event<void>;

    /*
     * Send event on user text typing.
     */
    abstract onUserInput: Event<string | undefined>;

    /*
     * Send event on terminal resize.
     */
    abstract onTerminalResize: Event<TerminalSize>;

    /**
     * Event which fires when terminal did closed. Event value contains closed terminal widget definition.
     */
    abstract onTerminalDidClose: Event<TerminalWidget>;

    /**
     * Cleat terminal output.
     */
    abstract clearOutput(): void;

    /**
     * Reset terminal to the initial state. Could be useful for reconnection.
     */
    abstract reset(): void;
}

/**
 * Terminal widget options.
 */
export const TerminalWidgetOptions = Symbol('TerminalWidgetOptions');
export interface TerminalWidgetOptions {

    /**
     * Human readable terminal representation on the UI.
     */
    readonly title?: string;

    /**
     * Path to the executable shell. For example: `/bin/bash`, `bash`, `sh`.
     */
    readonly shellPath?: string;

    /**
     * Shell arguments to executable shell, for example: [`-l`] - without login.
     */
    readonly shellArgs?: string[];

    /**
     * Current working directory.
     */
    readonly cwd?: string;

    /**
     * Environment variables for terminal.
     */
    readonly env?: { [key: string]: string | null };

    /**
     * In case `destroyTermOnClose` is true - terminal process will be destroyed on close terminal widget, otherwise will be kept
     * alive.
     */
    readonly destroyTermOnClose?: boolean;

    /**
     * Terminal server side can send to the client `terminal title` to display this value on the UI. If
     * useServerTitle = true then display this title, otherwise display title defined by 'title' argument.
     */
    readonly useServerTitle?: boolean;

    /**
     * Terminal id. Should be unique for all DOM.
     */
    readonly id?: string;

    /**
     * Terminal attributes. Can be useful to apply some implementation specific information.
     */
    readonly attributes?: { [key: string]: string | null };
}

export interface TerminalWidgetFactoryOptions extends Partial<TerminalWidgetOptions> {
    /* a unique string per terminal */
    created: string
}

export const TERMINAL_WIDGET_FACTORY_ID = 'terminal';
