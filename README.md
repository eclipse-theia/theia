# Theia

A Javascript framework for native desktop and cloud-based IDEs.

## Scope
 - Provide the end-user with a full-fledged multi-language IDE  (not just a smart editor)
 - Support equally the paradigm of Cloud IDE and Desktop IDE
 - Provide extenders with a platform on which to build their own products
 - Provide support for multiple languages via the language and debug serve protocols
 
## Architecture
To support both native desktop IDEs as well as cloud based IDEs, the basic framework needs to be separated into a front-end part and a back-end part. We see three kinds of deployments we would want to support.

### Native Front-End, Local Back-end
Based on Electron an IDE would run the front-end as well as the back-end locally.

### Native Front-End, Remote Back-end
Based on Electron only the front-end would run locally, connecting to a remote back-end.

### Web Client, Remote Back-end
The front-end is served from a remote server to a local browser, connecting to a remote back-end.

For all three scenarios, we assume a single user scenario. That is, if the back-end runs remotely it runs in a sandboxed environment (e.g. docker container), with a dedicated file system. It should be possible to have more than one connection, but it will always just serve one file system. So for multiple workspaces an additional server (out of scope for this effort, but e.g. provided by Eclipse Che) would be responsible to start / stop such container based IDEs.
The frontend part would contain all UI-code as well as client side logic. For instance, tokenizing and coloring is something that usually would be done on the frontend side. When the frontend runs in the browser we need to emulate the UI parts that are supported natively through Electron (e.g. menus).  
To support both browser and desktop scenarios, the frontend must avoid making direct use of any native calls provided by Electron. An API should be provided that delegates to the Electron API or when running in the browser is implemented differently. Menus, for instance, are supported natively by electron. When running in the browser the framework needs to render it using html.
The backend part would be based on Node.js, especially things that require system resources, like file system or running processes (language servers). Common code that neither depends on DOM (window) API nor Node API can be shared between frontend and backend.
Communication between the two needs to abstract over where the remote part runs.
### Language support
The Language Server Protocol will be used to leverage existing language servers and benefit from the decoupling of the IDE services from the language services.
### Debugging support
The Debug Server Protocol will be used to leverage existing debugger integration and benefit from the decoupling of the IDE services from the debugging logic.
### Extendability
An extension mechanism should allow installing add-ons without the need to rebuild the whole application. It should allow to extend the front-end as well as the back-end.


