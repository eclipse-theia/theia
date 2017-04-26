import { DisposableCollection } from '../../application/common';
import { ConnectionHandler } from './handler';
import { MessageConnection } from "vscode-jsonrpc";




export class JsonRpcProxyFactory<T> implements ConnectionHandler, ProxyHandler<T> {

    protected readonly connectionListeners = new DisposableCollection();

    constructor(private target: any, public readonly path: string) {}

    onConnection(connection: MessageConnection) {
        this.connectionListeners.dispose();
        connection.onError( error => {
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
                connection.onRequest(prop, param => this.onRequest(prop, param));
                connection.onNotification(prop, param => this.onNotification(prop, param));
            }
        }
        connection.onDispose(() => {
            this.connectionListeners.dispose();
            this.connectionPromise = new Promise(resolve => {this.connectionPromiseResolve = resolve});
        });
        connection.listen();
        this.connectionPromiseResolve(connection);
    }

    private connectionPromiseResolve: (connection: MessageConnection) => void;
    private connectionPromise: Promise<MessageConnection> = new Promise(resolve => {this.connectionPromiseResolve = resolve})

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
            return this.connectionPromise.then( connection => {
                if (isNotify) {
                    connection.sendNotification(p.toString(), ...args)
                    return Promise.resolve(undefined);
                } else {
                    const resultPromise = connection.sendRequest(p.toString(), ...args)
                    return new Promise(resolve => {
                        resultPromise.then( result => resolve(result))
                    })
                }
            })
        }
    }

    protected isNotification(p: PropertyKey): boolean {
        return p.toString().startsWith("notify")
    }
}
