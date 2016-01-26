# Easily manage a project workspace

To clarify, a project workspace is a collection of folders where each folder _could_ represent a
unique npm installable package, and which there may exist a dependency relationship between any
of them.

Currently, the only method of managing a workspace would be to individually setup 'links' between
the 'workspace packages' using the 'npm link' command. This quickly becomes cumbersome and error
prone, and with larger projects, completely unmanagable. It is also difficult to automate any
_workspace_ level task that rely on the dependant order of the 'workspace packages' without the
use of an explicitly maintained ordered list.

'gulp-npmworkspace' aims to hide these issues when working with project workspaces.
