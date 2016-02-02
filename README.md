# gulp-npmworkspace (v1.1)

Provides 'workspace' like utilities for managing local development of npm packages. The utilities
exposed to gulp provides support for the `link`-ing and `install`-ing of local npm packages during
development without the need to invoke `npm link`.

This package was heaviliy inspired by https://github.com/mariocasciaro/npm-workspace

## Using the workspace and utilities



```javascript
var gulp = require("gulp");
var workspace = require("gulp-npmworkspace");

gulp.task("install-workspace", function() {
    return workspace.workspacePackages()
        .pipe(workspace.npmInstall());
});

gulp.task("compile", function() {
    // Build TypeScript projects in dependency order!
    return workspace.workspacePackages()
        .pipe(workspace.buildTypeScriptProject());
});
```

## Exported Functions

### Workspace Management

These functions provide utilities for managing the workspace.

#### workspacePackages

workspacePackages(_options_?: Object)

_options_: An optional hash of options that can be passed through to `gulp.src()`.

Returns a stream of 'package.json' files that have been found in the workspace. The files are streamed
in dependency order based on the `dependencies` and `devDependencies` found in the files. For example,
if there are two packages in the workspace called 'lib1' and 'lib2', and 'lib2' has a dependency on 'lib1',
then the associated 'package.json' files will be streamed in the order [ _'lib2', 'lib1'_ ].

#### filter

filter(_filterFunc_: (_packageDescriptor_: PackageDescriptor) => boolean)

_filterFunc_: A function that accepts a package descriptor (a deserialized 'package.json' file) and returns
a boolean where `false` removes the file from the stream.

Accepts and returns a stream of 'package.json' files and applies a filter function to each one in order to
determine if the file should be included in the stream or not.

#### npmScript

npmScript(_scriptName_: string, _options_?: Object)
_scriptName_: The name of the script that should be executed.

_options_: An optional hash of options:
> _ignoreMissingScript_?: boolean
> `true` to ignore a script that is missing from the 'package.json' file.

> _continueOnError_?: boolean
> `true` to continue streaming 'package.json' files if a script errors.

Accepts and returns a stream of 'package.json' files and executes the given script for each one.

#### npmInstall

npmInstall(_options_?: Object)

_options_: An optional hash of options:
> _continueOnError_?: boolean
> `true` to continue streaming 'package.json' files if the installation fails.

> _minimizeSizeOnDisk_?: boolean
> `true` to apply an installation strategy that attempts to install all `devDependencies` in the root of the
> workspace. If a required version cannot be satified by the version installed at the workspace level, then
> the package is installed locally.

> _postInstall_?: Object
> An object that defines a post installation action.

Accepts and returns a stream of 'package.json' files and installs the dependant packages for each one.
Symbolic links are created for each dependency if it is present in the workspace.

#### npmUninstall

npmUninstall()

Accepts and returns a stream of 'package.json' files and uninstalls all dependant packages for each one.

### TypeScript Support

These functions provide utilities for working with packages built using TypeScript.

#### buildTypeScriptProject

buildTypeScriptProject(_options_?: Object)

_options_: An optional hash of options:
> _continueOnError_?: boolean
> `true` to continue streaming 'package.json' files if the compilation fails.

> _fastCompile_?: boolean
> `true` to compile only those source files that are affected by change.

> _includeTypings_?: boolean
> `true` to process any found `typings.json` files that are included in the workspace package.

Accepts and returns a stream of 'package.json' files and executes the TypeScript compiler for each one.
The workspace should contain a 'tsconfig.json' file that is applied across all workspace packages. If a
workspace package needs to override TypeScript compiler options then a local '.tsconfig.json' (note the
period at the beginning), can be used to specify any local settings that should be applied.

During compilation:
- The local TypeScript compiler options are combined with the workspace defined options
- The local `excludes` are combined with the workspace defined `excludes`
