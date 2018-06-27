/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import { ContainerModule, Container, injectable } from "inversify";
import { MarkerManager, Uri2MarkerEntry } from "./marker-manager";
import { StorageService } from "@theia/core/lib/browser/storage-service";
import { MockStorageService } from "@theia/core/lib/browser/test/mock-storage-service";
import { FileSystemWatcher } from "@theia/filesystem/lib/browser/filesystem-watcher";
import URI from "@theia/core/lib/common/uri";
import { Deferred } from "@theia/core/lib/common/promise-util";
import { expect } from "chai";

let container: Container;

@injectable()
class TestMarkerManager extends MarkerManager<object> {
    public getKind(): string {
        return "test";
    }
}

beforeEach(function () {
    const m = new ContainerModule(bind => {
        bind(MarkerManager).to(TestMarkerManager).inSingletonScope();
        bind(MockStorageService).toSelf().inSingletonScope();
        bind(StorageService).toDynamicValue(ctx => ctx.container.get<MockStorageService>(MockStorageService));
        bind(FileSystemWatcher).toConstantValue(<any>undefined);
    });

    container = new Container();
    container.load(m);
});

describe("marker-manager", function () {
    it("should not save URIs without markers to local storage", async function () {
        // We want to be able to wait until the marker manager has set the data in the local storage.
        let setDataPromise = new Deferred<void>();
        const storageService = container.get<MockStorageService>(MockStorageService);
        storageService.onSetData(() => setDataPromise.resolve());

        // Provide one marker
        const mm = container.get(MarkerManager);
        const uri = new URI('/path/to/file1.ts');
        const owner = 'test-owner';
        mm.setMarkers(uri, 'test-owner', ['allo']);
        await setDataPromise.promise;

        let entries = await storageService.getData<Uri2MarkerEntry[]>('marker-test');
        expect(entries).to.have.lengthOf(1);

        // Provide no marker.  The entry for the uri should not be saved in the local storage.
        setDataPromise = new Deferred<void>();
        mm.setMarkers(uri, owner, []);
        await setDataPromise.promise;

        entries = await storageService.getData<Uri2MarkerEntry[]>('marker-test');
        expect(entries).to.have.lengthOf(0);
    });
});
