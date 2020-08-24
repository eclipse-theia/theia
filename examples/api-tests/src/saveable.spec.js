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

// @ts-check
describe('Saveable', function () {
    this.timeout(5000);

    const { assert } = chai;

    const { EditorManager } = require('@theia/editor/lib/browser/editor-manager');
    const { EditorWidget } = require('@theia/editor/lib/browser/editor-widget');
    const { PreferenceService } = require('@theia/core/lib/browser/preferences/preference-service');
    const { Saveable, SaveableWidget } = require('@theia/core/lib/browser/saveable');
    const { WorkspaceService } = require('@theia/workspace/lib/browser/workspace-service');
    const { FileService } = require('@theia/filesystem/lib/browser/file-service');
    const { FileResource } = require('@theia/filesystem/lib/browser/file-resource');
    const { ETAG_DISABLED } = require('@theia/filesystem/lib/common/files');
    const { MonacoEditor } = require('@theia/monaco/lib/browser/monaco-editor');
    const { Deferred } = require('@theia/core/lib/common/promise-util');
    const { Disposable, DisposableCollection } = require('@theia/core/lib/common/disposable');

    const container = window.theia.container;
    const editorManager = container.get(EditorManager);
    const workspaceService = container.get(WorkspaceService);
    const fileService = container.get(FileService);
    /** @type {import('@theia/core/lib/browser/preferences/preference-service').PreferenceService} */
    const preferences = container.get(PreferenceService);

    /** @type {EditorWidget & SaveableWidget} */
    let widget;
    /** @type {MonacoEditor} */
    let editor;

    const rootUri = workspaceService.tryGetRoots()[0].resource;
    const fileUri = rootUri.resolve('.test/foo.txt');

    /**
     * @param {FileResource['shouldOverwrite']} shouldOverwrite
     * @returns {Disposable}
     */
    function setShouldOverwrite(shouldOverwrite) {
        const resource = editor.document['resource'];
        assert.isTrue(resource instanceof FileResource);
        const fileResource = /** @type {FileResource} */ (resource);
        const originalShouldOverwrite = fileResource['shouldOverwrite'];
        fileResource['shouldOverwrite'] = shouldOverwrite;
        return Disposable.create(() => fileResource['shouldOverwrite'] = originalShouldOverwrite);
    }

    const toTearDown = new DisposableCollection();

    /** @type {string | undefined} */
    const autoSave = preferences.get('editor.autoSave', undefined, rootUri.toString());

    beforeEach(async () => {
        preferences.set('editor.autoSave', 'off', undefined, rootUri.toString());
        await editorManager.closeAll({ save: false });
        await fileService.create(fileUri, 'foo', { fromUserGesture: false, overwrite: true });
        widget =  /** @type {EditorWidget & SaveableWidget} */
            (await editorManager.open(fileUri, { mode: 'reveal' }));
        editor = MonacoEditor.get(widget);
    });

    afterEach(async () => {
        toTearDown.dispose();
        preferences.set('editor.autoSave', autoSave, undefined, rootUri.toString());
        editor = undefined;
        widget = undefined;
        await editorManager.closeAll({ save: false });
        await fileService.delete(fileUri.parent, { fromUserGesture: false, useTrash: false, recursive: true });
    });

    it('normal save', async function () {
        for (const edit of ['bar', 'baz']) {
            assert.isFalse(Saveable.isDirty(widget), `should NOT be dirty before '${edit}' edit`);
            editor.getControl().setValue(edit);
            assert.isTrue(Saveable.isDirty(widget), `should be dirty before '${edit}' save`);
            await Saveable.save(widget);
            assert.isFalse(Saveable.isDirty(widget), `should NOT be dirty after '${edit}' save`);
            assert.equal(editor.getControl().getValue().trimRight(), edit, `model should be updated with '${edit}'`);
            const state = await fileService.read(fileUri);
            assert.equal(state.value.trimRight(), edit, `fs should be updated with '${edit}'`);
        }
    });

    it('reject save with incremental update', async function () {
        let longContent = 'foobarbaz';
        for (let i = 0; i < 5; i++) {
            longContent += longContent + longContent;
        }
        editor.getControl().setValue(longContent);
        await Saveable.save(widget);

        editor.getControl().getModel().applyEdits([{
            range: monaco.Range.fromPositions({ lineNumber: 1, column: 1 }, { lineNumber: 1, column: 4 }),
            forceMoveMarkers: false,
            text: ''
        }]);
        assert.isTrue(Saveable.isDirty(widget), 'should be dirty before save');

        const resource = editor.document['resource'];
        const version = resource.version;
        await resource.saveContents('baz');
        assert.notEqual(version, resource.version, 'latest version should be different after write');

        let outOfSync = false;
        let outOfSyncCount = 0;
        toTearDown.push(setShouldOverwrite(async () => {
            outOfSync = true;
            outOfSyncCount++;
            return false;
        }));

        let incrementalUpdate = false;
        const saveContentChanges = resource.saveContentChanges;
        resource.saveContentChanges = async (changes, options) => {
            incrementalUpdate = true;
            return saveContentChanges.bind(resource)(changes, options);
        };
        try {
            await Saveable.save(widget);
        } finally {
            resource.saveContentChanges = saveContentChanges;
        }

        assert.isTrue(incrementalUpdate, 'should tried to update incrementaly');
        assert.isTrue(outOfSync, 'file should be out of sync');
        assert.equal(outOfSyncCount, 1, 'user should be prompted only once with out of sync dialog');
        assert.isTrue(Saveable.isDirty(widget), 'should be dirty after rejected save');
        assert.equal(editor.getControl().getValue().trimRight(), longContent.substring(3), 'model should be updated');
        const state = await fileService.read(fileUri);
        assert.equal(state.value, 'baz', 'fs should NOT be updated');
    });

    it('accept rejected save', async function () {
        let outOfSync = false;
        toTearDown.push(setShouldOverwrite(async () => {
            outOfSync = true;
            return false;
        }));
        editor.getControl().setValue('bar');
        assert.isTrue(Saveable.isDirty(widget), 'should be dirty before save');

        const resource = editor.document['resource'];
        const version = resource.version;
        await resource.saveContents('bazz');
        assert.notEqual(version, resource.version, 'latest version should be different after write');

        await Saveable.save(widget);
        assert.isTrue(outOfSync, 'file should be out of sync');
        assert.isTrue(Saveable.isDirty(widget), 'should be dirty after rejected save');
        assert.equal(editor.getControl().getValue().trimRight(), 'bar', 'model should be updated');
        let state = await fileService.read(fileUri);
        assert.equal(state.value, 'bazz', 'fs should NOT be updated');

        outOfSync = false;
        toTearDown.push(setShouldOverwrite(async () => {
            outOfSync = true;
            return true;
        }));
        assert.isTrue(Saveable.isDirty(widget), 'should be dirty before save');
        await Saveable.save(widget);
        assert.isTrue(outOfSync, 'file should be out of sync');
        assert.isFalse(Saveable.isDirty(widget), 'should NOT be dirty after save');
        assert.equal(editor.getControl().getValue().trimRight(), 'bar', 'model should be updated');
        state = await fileService.read(fileUri);
        assert.equal(state.value.trimRight(), 'bar', 'fs should be updated');
    });

    it('accept new save', async () => {
        let outOfSync = false;
        toTearDown.push(setShouldOverwrite(async () => {
            outOfSync = true;
            return true;
        }));
        editor.getControl().setValue('bar');
        assert.isTrue(Saveable.isDirty(widget), 'should be dirty before save');
        await fileService.write(fileUri, 'foo2', { etag: ETAG_DISABLED });
        await Saveable.save(widget);
        assert.isTrue(outOfSync, 'file should be out of sync');
        assert.isFalse(Saveable.isDirty(widget), 'should NOT be dirty after save');
        assert.equal(editor.getControl().getValue().trimRight(), 'bar', 'model should be updated');
        const state = await fileService.read(fileUri);
        assert.equal(state.value.trimRight(), 'bar', 'fs should be updated');
    });

    it('cancel save on close', async () => {
        editor.getControl().setValue('bar');
        assert.isTrue(Saveable.isDirty(widget), 'should be dirty before close');

        await widget.closeWithSaving({
            shouldSave: () => undefined
        });
        assert.isTrue(Saveable.isDirty(widget), 'should be still dirty after canceled close');
        assert.isFalse(widget.isDisposed, 'should NOT be disposed after canceled close');
        const state = await fileService.read(fileUri);
        assert.equal(state.value, 'foo', 'fs should NOT be updated after canceled close');
    });

    it('reject save on close', async () => {
        editor.getControl().setValue('bar');
        assert.isTrue(Saveable.isDirty(widget), 'should be dirty before rejected close');
        await widget.closeWithSaving({
            shouldSave: () => false
        });
        assert.isTrue(widget.isDisposed, 'should be disposed after rejected close');
        const state = await fileService.read(fileUri);
        assert.equal(state.value, 'foo', 'fs should NOT be updated after rejected close');
    });

    it('accept save on close and reject it', async () => {
        let outOfSync = false;
        toTearDown.push(setShouldOverwrite(async () => {
            outOfSync = true;
            return false;
        }));
        editor.getControl().setValue('bar');
        assert.isTrue(Saveable.isDirty(widget), 'should be dirty before rejecting save on close');
        await fileService.write(fileUri, 'foo2', { etag: ETAG_DISABLED });
        await widget.closeWithSaving({
            shouldSave: () => true
        });
        assert.isTrue(outOfSync, 'file should be out of sync');
        assert.isTrue(widget.isDisposed, 'model should be disposed after close');
        const state = await fileService.read(fileUri);
        assert.equal(state.value, 'foo2', 'fs should NOT be updated');
    });

    it('accept save on close and accept new save', async () => {
        let outOfSync = false;
        toTearDown.push(setShouldOverwrite(async () => {
            outOfSync = true;
            return true;
        }));
        editor.getControl().setValue('bar');
        assert.isTrue(Saveable.isDirty(widget), 'should be dirty before accepting save on close');
        await fileService.write(fileUri, 'foo2', { etag: ETAG_DISABLED });
        await widget.closeWithSaving({
            shouldSave: () => true
        });
        assert.isTrue(outOfSync, 'file should be out of sync');
        assert.isTrue(widget.isDisposed, 'model should be disposed after close');
        const state = await fileService.read(fileUri);
        assert.equal(state.value.trimRight(), 'bar', 'fs should be updated');
    });

    it('normal close', async () => {
        editor.getControl().setValue('bar');
        assert.isTrue(Saveable.isDirty(widget), 'should be dirty before before close');
        await widget.closeWithSaving({
            shouldSave: () => true
        });
        assert.isTrue(widget.isDisposed, 'model should be disposed after close');
        const state = await fileService.read(fileUri);
        assert.equal(state.value.trimRight(), 'bar', 'fs should be updated');
    });

    it('delete file for saved', async () => {
        assert.isFalse(Saveable.isDirty(widget), 'should NOT be dirty before delete');
        const waitForDisposed = new Deferred();
        const listener = editor.onDispose(() => waitForDisposed.resolve());
        try {
            await fileService.delete(fileUri);
            await waitForDisposed.promise;
            assert.isTrue(widget.isDisposed, 'model should be disposed after delete');
        } finally {
            listener.dispose();
        }
    });

    it('delete and add again file for dirty', async () => {
        editor.getControl().setValue('bar');
        assert.isTrue(Saveable.isDirty(widget), 'should be dirty before delete');
        assert.isTrue(editor.document.valid, 'should be valid before delete');
        let waitForDidChangeTitle = new Deferred();
        const listener = () => waitForDidChangeTitle.resolve();
        widget.title.changed.connect(listener);
        try {
            await fileService.delete(fileUri);
            await waitForDidChangeTitle.promise;
            assert.isTrue(widget.title.label.endsWith('(deleted from disk)'), 'should be marked as deleted');
            assert.isTrue(Saveable.isDirty(widget), 'should be dirty after delete');
            assert.isFalse(widget.isDisposed, 'model should NOT be disposed after delete');
        } finally {
            widget.title.changed.disconnect(listener);
        }

        waitForDidChangeTitle = new Deferred();
        widget.title.changed.connect(listener);
        try {
            await fileService.create(fileUri, 'foo');
            await waitForDidChangeTitle.promise;
            assert.isFalse(widget.title.label.endsWith('(deleted from disk)'), 'should NOT be marked as deleted');
            assert.isTrue(Saveable.isDirty(widget), 'should be dirty after added again');
            assert.isFalse(widget.isDisposed, 'model should NOT be disposed after added again');
        } finally {
            widget.title.changed.disconnect(listener);
        }
    });

    it('save deleted file for dirty', async function () {
        editor.getControl().setValue('bar');
        assert.isTrue(Saveable.isDirty(widget), 'should be dirty before save deleted');

        assert.isTrue(editor.document.valid, 'should be valid before delete');
        const waitForInvalid = new Deferred();
        const listener = editor.document.onDidChangeValid(() => waitForInvalid.resolve());
        try {
            await fileService.delete(fileUri);
            await waitForInvalid.promise;
            assert.isFalse(editor.document.valid, 'should be invalid after delete');
        } finally {
            listener.dispose();
        }

        assert.isTrue(Saveable.isDirty(widget), 'should be dirty before save');
        await Saveable.save(widget);
        assert.isFalse(Saveable.isDirty(widget), 'should NOT be dirty after save');
        assert.isTrue(editor.document.valid, 'should be valid after save');
        const state = await fileService.read(fileUri);
        assert.equal(state.value.trimRight(), 'bar', 'fs should be updated');
    });

    it('move file for saved', async function () {
        assert.isFalse(Saveable.isDirty(widget), 'should NOT be dirty before move');

        const targetUri = fileUri.parent.resolve('bar.txt');
        await fileService.move(fileUri, targetUri, { overwrite: true });
        assert.isTrue(widget.isDisposed, 'old model should be disposed after move');

        const renamed = /** @type {EditorWidget} */ (await editorManager.getByUri(targetUri));
        assert.equal(String(renamed.getResourceUri()), targetUri.toString(), 'new model should be created after move');
        assert.equal(renamed.editor.document.getText(), 'foo', 'new model should be created after move');
        assert.isFalse(Saveable.isDirty(renamed), 'new model should NOT be dirty after move');
    });

    it('move file for dirty', async function () {
        editor.getControl().setValue('bar');
        assert.isTrue(Saveable.isDirty(widget), 'should be dirty before move');

        const targetUri = fileUri.parent.resolve('bar.txt');

        await fileService.move(fileUri, targetUri, { overwrite: true });
        assert.isTrue(widget.isDisposed, 'old model should be disposed after move');

        const renamed = /** @type {EditorWidget} */ (await editorManager.getByUri(targetUri));
        assert.equal(String(renamed.getResourceUri()), targetUri.toString(), 'new model should be created after move');
        assert.equal(renamed.editor.document.getText(), 'bar', 'new model should be created after move');
        assert.isTrue(Saveable.isDirty(renamed), 'new model should be dirty after move');

        await Saveable.save(renamed);
        assert.isFalse(Saveable.isDirty(renamed), 'new model should NOT be dirty after save');
    });

    it('fail to open invalid file', async function () {
        const invalidFile = fileUri.parent.resolve('invalid_file.txt');
        try {
            await editorManager.open(invalidFile, { mode: 'reveal' });
            assert.fail('should not be possible to open an editor for invalid file');
        } catch (e) {
            assert.equal(e.code, 'MODEL_IS_INVALID');
        }
    });

    it('decode without save', async function () {
        assert.strictEqual('utf8', editor.document.getEncoding());
        assert.strictEqual('foo', editor.document.getText());
        await editor.setEncoding('utf16le', 1 /* EncodingMode.Decode */);
        assert.strictEqual('utf16le', editor.document.getEncoding());
        assert.notEqual('foo', editor.document.getText().trimRight());
        assert.isFalse(Saveable.isDirty(widget), 'should not be dirty after decode');

        await widget.closeWithSaving({
            shouldSave: () => undefined
        });
        assert.isTrue(widget.isDisposed, 'widget should be disposed after close');

        widget =  /** @type {EditorWidget & SaveableWidget} */
            (await editorManager.open(fileUri, { mode: 'reveal' }));
        editor = MonacoEditor.get(widget);

        assert.strictEqual('utf8', editor.document.getEncoding());
        assert.strictEqual('foo', editor.document.getText().trimRight());
    });

    it('decode with save', async function () {
        assert.strictEqual('utf8', editor.document.getEncoding());
        assert.strictEqual('foo', editor.document.getText());
        await editor.setEncoding('utf16le', 1 /* EncodingMode.Decode */);
        assert.strictEqual('utf16le', editor.document.getEncoding());
        assert.notEqual('foo', editor.document.getText().trimRight());
        assert.isFalse(Saveable.isDirty(widget), 'should not be dirty after decode');

        await Saveable.save(widget);

        await widget.closeWithSaving({
            shouldSave: () => undefined
        });
        assert.isTrue(widget.isDisposed, 'widget should be disposed after close');

        widget =  /** @type {EditorWidget & SaveableWidget} */
            (await editorManager.open(fileUri, { mode: 'reveal' }));
        editor = MonacoEditor.get(widget);

        assert.strictEqual('utf16le', editor.document.getEncoding());
        assert.notEqual('foo', editor.document.getText().trimRight());
    });

    it('encode', async function () {
        assert.strictEqual('utf8', editor.document.getEncoding());
        assert.strictEqual('foo', editor.document.getText());
        await editor.setEncoding('utf16le', 0 /* EncodingMode.Encode */);
        assert.strictEqual('utf16le', editor.document.getEncoding());
        assert.strictEqual('foo', editor.document.getText().trimRight());
        assert.isFalse(Saveable.isDirty(widget), 'should not be dirty after encode');

        await widget.closeWithSaving({
            shouldSave: () => undefined
        });
        assert.isTrue(widget.isDisposed, 'widget should be disposed after close');

        widget =  /** @type {EditorWidget & SaveableWidget} */
            (await editorManager.open(fileUri, { mode: 'reveal' }));
        editor = MonacoEditor.get(widget);

        assert.strictEqual('utf16le', editor.document.getEncoding());
        assert.strictEqual('foo', editor.document.getText().trimRight());
    });

});
