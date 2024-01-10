<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - REMOTE EXTENSION</h2>

<hr />

</div>

## Description

This package implements functionality to connect to remote systems using Theia.
This facilitates features similar to the features offered by Microsoft's popular `Remote-SSH`, `Dev Containers` or `WSL` extensions for VSCode.

## Package Architecture

The following explains the basic flow of any remote connection. It will be exemplified using the remote SSH feature:

1. When the user runs the `SSH: Connect to Host...` command, we send the host info to the local backend.
The corresponding `RemoteSSHConnectionProvider` is scoped to the current connection and can request additional information from the user, such as SSH key passphrases.
2. Once the `RemoteSSHConnectionProvider` has every information it needs, it creates a SSH connection and registers this connection to the general `RemoteConnectionService`.
Every `RemoteConnection` type implements an interface that is able to handle 3 kinds of messages to the remote system:
    1. Executing commands in the shell of the remote system
    2. Copying data to the remote
3. Once the connection has been established, a setup process takes place on the remote system:
    1. Identifying the remote platform (i.e. Windows, MacOS or Linux). This information is needed for all the following steps.
    2. Setting up various directories for storing the application and its dependencies.
    3. Download and install the correct Node.js version for the remote platform.
    4. Packaging, copying, and unpackaging the local backend to the remote backend.
        1. Every Theia extension can register `RemoteCopyContribution` binding to copy certain files from the current system.
        This contribution point is used for files that are used in all operating systems.
        2. They can also register `RemoteNativeDependencyContribution` bindings to download and copy native dependencies for the remote system.
        The downloaded files are on a per-platform basis.
    5. Using the node version that was installed in step 3, we now start the `main.js` of the backend application.
    We start the backend with `--port=0`, so that it searches for any available port. It will print the port to the console.
    The setup either returns with a setup error or the port of the remote server on the remote system.
4. With the remote server/port in place, the backend sets up a local proxy server on a random port.
It instructs the `RemoteConnection` object to forward any HTTP request to this proxy server to the remote server.
5. The backend will return from the initial request from (1) with a new local proxy port. The frontend sets this port in the url and reload itself.
6. The frontend is now connected to the remote backend by connecting to the local proxy port.
7. The frontend now performs its normal messaging lifecycle, establishing connections to backend services.
Although these backend services live on a different remote system, the frontend handles them as if they belong to the local backend.

## Additional Information

- [API documentation for `@theia/remote`](https://eclipse-theia.github.io/theia/docs/next/modules/remote.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
https://www.eclipse.org/theia
