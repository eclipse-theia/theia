/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

// tslint:disable:no-unused-expression

const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { EditorconfigDocumentManager } from './editorconfig-document-manager';
import * as sinon from 'sinon';
import { KnownProps } from 'editorconfig';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';

disableJSDOM();

describe('Editorconfig document manager', function (): void {

    it('IsSet should return true', () => {
        const documentManager = new EditorconfigDocumentManager();
        expect(documentManager.isSet('value')).to.be.true;
    });

    it('IsSet should return false', () => {
        const documentManager = new EditorconfigDocumentManager();
        expect(documentManager.isSet('unset')).to.be.false;
    });

    it('Should handle all properties except `tab_width`', () => {
        const documentManager = new EditorconfigDocumentManager();

        const stubIndentStyle = sinon.stub(documentManager, 'ensureIndentStyle');
        const stubIndentSize = sinon.stub(documentManager, 'ensureIndentSize');
        const stubEndOfLine = sinon.stub(documentManager, 'ensureEndOfLine');

        const properties = {
            indent_style: 'space',
            indent_size: 4,
            tab_width: 4,
            end_of_line: 'crlf',
            trim_trailing_whitespace: true,
            insert_final_newline: true
        } as KnownProps;

        documentManager.applyProperties(properties, {} as MonacoEditor);

        expect(stubIndentStyle.called).to.be.true;
        expect(stubIndentSize.called).to.be.true;
        expect(stubEndOfLine.called).to.be.true;
    });

    it('Should handle `tab_width` property when `indent_size` is set to `tab`', () => {
        const documentManager = new EditorconfigDocumentManager();

        const stubIndentSize = sinon.stub(documentManager, 'ensureIndentSize').callThrough();
        const stubTabWidth = sinon.stub(documentManager, 'ensureTabWidth');

        const properties = {
            indent_size: 'tab',
            tab_width: 4
        } as KnownProps;

        documentManager.applyProperties(properties, {} as MonacoEditor);

        expect(stubIndentSize.called).to.be.true;
        expect(stubTabWidth.called).to.be.true;
    });

    it('Should skip `tab_width` property when `indent_size` is set to `tab` but `tab_width` is not set', () => {
        const documentManager = new EditorconfigDocumentManager();

        const stubIndentSize = sinon.stub(documentManager, 'ensureIndentSize').callThrough();
        const stubTabWidth = sinon.stub(documentManager, 'ensureTabWidth');

        const properties = {
            indent_size: 'tab'
        } as KnownProps;

        documentManager.applyProperties(properties, {} as MonacoEditor);

        expect(stubIndentSize.called).to.be.true;
        expect(stubTabWidth.called).to.be.false;
    });

    it('Should skip all properties', () => {
        const documentManager = new EditorconfigDocumentManager();

        const stubIndentStyle = sinon.stub(documentManager, 'ensureIndentStyle');
        const stubIndentSize = sinon.stub(documentManager, 'ensureIndentSize');
        const stubEndOfLine = sinon.stub(documentManager, 'ensureEndOfLine');

        const properties = {} as KnownProps;

        documentManager.applyProperties(properties, {} as MonacoEditor);

        expect(stubIndentStyle.called).to.be.false;
        expect(stubIndentSize.called).to.be.false;
        expect(stubEndOfLine.called).to.be.false;
    });

});
