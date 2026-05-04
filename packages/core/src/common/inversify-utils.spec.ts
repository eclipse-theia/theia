// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { expect, spy, use } from 'chai';
import * as spies from 'chai-spies';
import { Container, injectable } from 'inversify';
import { disposableTrackingMiddleware } from './inversify-utils';
import { Disposable } from './disposable';

use(spies);

describe('disposableTrackingMiddleware', () => {

    const ServiceId = Symbol('ServiceId');

    @injectable()
    class DisposableService implements Disposable {
        disposed = false;
        dispose(): void {
            this.disposed = true;
        }
    }

    @injectable()
    class NonDisposableService {
        value = 42;
    }

    it('should dispose a singleton when it is unbound from the container', async () => {
        const container = new Container({ defaultScope: 'Singleton' });
        container.applyMiddleware(disposableTrackingMiddleware(container));
        container.bind(ServiceId).to(DisposableService).inSingletonScope();

        const instance = container.get<DisposableService>(ServiceId);
        expect(instance.disposed).to.be.false;

        await container.unbindAsync(ServiceId);
        expect(instance.disposed).to.be.true;
    });

    it('should not dispose a transient-scoped binding on unbind', async () => {
        const container = new Container();
        container.applyMiddleware(disposableTrackingMiddleware(container));
        container.bind(ServiceId).to(DisposableService).inTransientScope();

        const instance = container.get<DisposableService>(ServiceId);
        expect(instance.disposed).to.be.false;

        await container.unbindAsync(ServiceId);
        // Transient instances are not tracked by inversify's deactivation,
        // so the middleware should not dispose them.
        expect(instance.disposed).to.be.false;
    });

    it('should dispose a constant-value binding on unbind', async () => {
        // Inversify 6 fires onDeactivation for constant-value bindings too,
        // so the middleware disposes them just like singletons.
        const container = new Container();
        container.applyMiddleware(disposableTrackingMiddleware(container));

        const constantInstance = new DisposableService();
        container.bind(ServiceId).toConstantValue(constantInstance);

        const instance = container.get<DisposableService>(ServiceId);
        expect(instance).to.equal(constantInstance);
        expect(instance.disposed).to.be.false;

        await container.unbindAsync(ServiceId);
        expect(instance.disposed).to.be.true;
    });

    it('should not dispose instances from a child container when the parent is unbound', async () => {
        const parent = new Container({ defaultScope: 'Singleton' });
        parent.applyMiddleware(disposableTrackingMiddleware(parent));

        const child = new Container({ defaultScope: 'Singleton' });
        child.parent = parent;

        const ChildServiceId = Symbol('ChildServiceId');
        child.bind(ChildServiceId).to(DisposableService).inSingletonScope();

        const childInstance = child.get<DisposableService>(ChildServiceId);
        expect(childInstance.disposed).to.be.false;

        // Unbinding all in the parent should not affect the child's bindings.
        await parent.unbindAllAsync();
        expect(childInstance.disposed).to.be.false;
    });

    it('should not dispose instances from a parent container when a child-container binding is unbound', async () => {
        const parent = new Container({ defaultScope: 'Singleton' });
        parent.bind(ServiceId).to(DisposableService).inSingletonScope();

        const child = new Container({ defaultScope: 'Singleton' });
        child.parent = parent;
        child.applyMiddleware(disposableTrackingMiddleware(child));

        // Resolve from child — the binding lives in the parent
        const instance = child.get<DisposableService>(ServiceId);
        expect(instance.disposed).to.be.false;

        // Unbinding everything in the child should not touch the parent's singleton
        await child.unbindAllAsync();
        expect(instance.disposed).to.be.false;
    });

    it('should not dispose a parent singleton rebound via toService in a child container', async () => {
        const parent = new Container({ defaultScope: 'Singleton' });
        parent.bind(ServiceId).to(DisposableService).inSingletonScope();

        const AliasId = Symbol('AliasId');
        const child = new Container({ defaultScope: 'Singleton' });
        child.parent = parent;
        child.applyMiddleware(disposableTrackingMiddleware(child));
        child.bind(AliasId).toService(ServiceId);

        const fromAlias = child.get<DisposableService>(AliasId);
        const fromParent = parent.get<DisposableService>(ServiceId);
        expect(fromAlias).to.equal(fromParent);
        expect(fromParent.disposed).to.be.false;

        // Unbinding the child's alias must not dispose the parent's singleton.
        // The onDeactivation callback receives null for toService aliases,
        // so Disposable.is(null) is false and dispose is never called.
        await child.unbindAllAsync();
        expect(fromParent.disposed).to.be.false;
    });

    it('should not throw when the resolved service is not Disposable', async () => {
        const container = new Container({ defaultScope: 'Singleton' });
        container.applyMiddleware(disposableTrackingMiddleware(container));
        container.bind(ServiceId).to(NonDisposableService).inSingletonScope();

        const instance = container.get<NonDisposableService>(ServiceId);
        expect(instance.value).to.equal(42);

        // Should not throw even though the service has no dispose method
        await container.unbindAsync(ServiceId);
    });

    it('should call dispose exactly once per singleton unbind', async () => {
        const container = new Container({ defaultScope: 'Singleton' });
        container.applyMiddleware(disposableTrackingMiddleware(container));
        container.bind(ServiceId).to(DisposableService).inSingletonScope();

        const instance = container.get<DisposableService>(ServiceId);
        const disposeSpy = spy.on(instance, 'dispose');

        await container.unbindAsync(ServiceId);
        expect(disposeSpy).to.have.been.called.exactly(1);
    });

    it('should dispose multiple different singletons when unbindAll is called', async () => {
        const container = new Container({ defaultScope: 'Singleton' });
        container.applyMiddleware(disposableTrackingMiddleware(container));

        const Id1 = Symbol('Id1');
        const Id2 = Symbol('Id2');
        container.bind(Id1).to(DisposableService).inSingletonScope();
        container.bind(Id2).to(DisposableService).inSingletonScope();

        const instance1 = container.get<DisposableService>(Id1);
        const instance2 = container.get<DisposableService>(Id2);

        expect(instance1.disposed).to.be.false;
        expect(instance2.disposed).to.be.false;

        await container.unbindAllAsync();

        expect(instance1.disposed).to.be.true;
        expect(instance2.disposed).to.be.true;
    });
});
