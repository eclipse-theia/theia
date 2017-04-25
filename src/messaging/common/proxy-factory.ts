import { DisposableCollection } from '../../application/common';
import { ConnectionHandler } from './handler';
import { MessageConnection } from "vscode-jsonrpc";




export class JsonRpcProxyFactory<T> implements ConnectionHandler, ProxyHandler<T> {

    protected connection: MessageConnection | undefined;
    protected readonly connectionListeners = new DisposableCollection();

    constructor(private target: any, public readonly path: string) {}

    onConnection(connection: MessageConnection) {
        this.connectionListeners.dispose();
        this.connection = connection;
        this.connection.onError( error => {
            console.error(error)
        })
        let disposed = false;
        this.connectionListeners.push({
            dispose() {
                disposed = true;
            }
        });
        for (let prop in this.target) {
            if (typeof this.target[prop] === 'function') {
                this.connection.onRequest(prop, param => this.onRequest(prop, param));
                this.connection.onNotification(prop, param => this.onNotification(prop, param));
            }
        }
        this.connection.onDispose(() => {
            this.connectionListeners.dispose();
            this.connection = undefined;
        });
        this.connection.listen();
    }

    protected onRequest(method: string, ...args: any[]): Promise<any> {
        let result = this.target[method](...args)
        if (result['then'] !== undefined) {
            return result
        }
        return Promise.resolve(result)
    }

    protected onNotification(method: string, ...args: any[]): void {
        this.target[method](...args)
    }

    createProxy(): T {
        const result = new Proxy<T>(this as any, this)
        return result as any
    }

    get(target: T, p: PropertyKey, receiver: any): any {
        const isNotify = this.isNotification(p)
        return (...args: any[]) => {
            if (!this.connection) {
                throw new Error(`Cannot invoke ${p} with ${JSON.stringify(args)}. No connection.`)
            }
            if (isNotify) {
                this.connection.sendNotification(p.toString(), ...args)
                return undefined
            } else {
                const resultPromise = this.connection.sendRequest(p.toString(), ...args)
                return new Promise(resolve => {
                    resultPromise.then( result => resolve(result))
                })
            }
        }
    }

    protected isNotification(p: PropertyKey): boolean {
        return p.toString().startsWith("notify")
    }
}
