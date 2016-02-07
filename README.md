# gulp-npmworkspace (v1.1)

Provides 'workspace' like utilities for managing the local development of npm packages. The plugins
exposed to gulp provide support for the `link`-ing and `install`-ing of local npm packages during
development without the need to invoke `npm link`, and also other useful workspace level functions.

This package was heaviliy inspired by https://github.com/mariocasciaro/npm-workspace

V1.1 is a maintenance release that represents a re-write of all the plugins using a core framework
that now keeps things consistent going forward.

*Quick Links*

* [Getting Started](#gettingstarted)  
* [Installing a Workspace through workspacePackages()](#installingworkspaces)  
  * [npmInstall()](#npmInstall)
  * [npmUninstall()](#npmUninstall)
* [Filtering Packages](#filtering)
  * [filter()](#filter)
* [Building with TypeScript](#typescript)
  * [buildTypeScriptProject()](#buildTypeScriptProject)
* [Publishing Packages](#publishing)
  * [npmPublish](#npmPublish)
* [Conditionable Actions](#conditionableactions)
  * [gulpfile.workspace.js file export equivilants](#gulpfileworkspace)
* [Command line Switches](#commandline)


# <a name="gettingstarted"></a>Getting Started

The general assumption of `gulp-npmworkspace` is that you'll have a workspace folder that contains a
collection of other folders that are pacakges. These packages will typically have dependencies
between each other because they'll be component parts of a larger application or component, that is
also present in the workspace. Regardless of whether the packages will be published to a npm registry,
they'll all contain a 'package.json' file to describe themselves, and more importantly, the
dependencies that they have between each other.

Before utilities such as npm-workspace or `gulp-npmworkspace`, developing across packages without having to
publish to a npm registry meant making use of the `npm link` command. This required executing the
`npm link` command in every folder that represented the dependant packages and as a consequence, also
created symbolic links in folders that you were not expecting. _It quickly becomes a mess_.

`gulp-npmworkspace` consumes 'pacakge.json' files and allows its related Gulp plugins to execute actions
over those packages _in dependency order_. For example, the bundled `npmInstall()` plugin will look at
a package's dependencies and if a given dependency is a package in the same workspace it will create a
symbolic link to it (in the same way that `npm link` will). Otherwise the dependency is installed from
the npm registry as usual.

To begin using npm-workspace: 

In the folder that represents the root of your workspace:

*1)* install `gulp` and `gulp-npmworkspce`:

```bash
npm install gulp gulp-npmworkspace --save
```

*2)* Modify the workspace level `package.json` file so that it contains a workspace setting:

```javascript
{
    "workspace": true,
    ...
    "name": "my-project-workspace",
    ...
    "dependencies": {
        "gulp": "*",
        "gulp-npmworkspace": "*",
        ...
        ...
    }
}
```

This ensures that `gulp-npmworkspace` knows that this file represents a root workspace.

*3)* Use gulp and `gulp-npmworkspace` to automate your build tasks as you currently do.

For example, put the following in your `gulpfile.js` file to install the workspace packages as an
`install` task, and compile the TypeScript in those packages as a `compile` task:

```javascript
var gulp = require("gulp");
var workspace = require("gulp-npmworkspace");

gulp.task("install", function() {
    return workspace.workspacePackages()
        .pipe(workspace.npmInstall());
});

gulp.task("compile", function() {
    // Build TypeScript projects in dependency order!
    return workspace.workspacePackages()
        .pipe(workspace.buildTypeScriptProject());
});
```

# <a name="installingworkspaces"></a> Installing a Workspace through workspacePackages()

`gulp-npmworkspace` has a 'root' plugin that streams the `package.json` files for the packages found
in the workspace. It is typical to use this plugin in conjunction with the others provided by
`gulp-npmworkspace` in order to apply workspace level automation across them all. In this section
we will look at installing the packages of the workspace ensuring that 'links' between dependant
packages are created in the same way that executing `npm link` would.

To stream through the workspace packages use `workspacePackages()` and pipe it into another plugin
to apply that behavior:

#### workspacePackages(_options_?)

Streams the workspace package's `package.json` files in dependency order.

_options_: An optional hash of options that is a union of the options that can be passed to `gulp.src()`
and the following:

> _package_?: string  
> The name of the workspace package to focus streaming on.

> _onlyNamedPackage_?: boolean  
> If _package_ is specified, then *true* will indicate that any following plugins consuming the stream
> should only apply their behavior to that named package only.  
> The default is *false*.

The options named above can be overriden (or set) from the command line.


#### <a name="npmInstall"></a> npmInstall(_options_?)

Installs the dependencies of a workspace package. When a dependency name is the same as the name of
another package in the workspace then a symbolic link is created in the package's `node_modules` folder
that links to the target workspace package. All other dependencies are installed as normal by invoking
`npm install`.

`npmInstall()` also provides support for installing npm dependencies from differing npm registries, and
for creating 'links' to packages that exist in other external workspaces.

_options_: An optional hash of options:

> _continueOnError_?: boolean  
> *true* to continue streaming if the workspace package fails to install.  
> The default is *true*.

> _minimizeSizeOnDisk_?: boolean  
> *true* to apply an installation strategy that attempts to install all `devDependencies` and
> `optionalDependencies` at the workspace level. This is a useful approach when all the workspace packages
> share the same development dependencies because it reduces the overall size of the workspace on disk. If
> a required version cannot be satisfied by the version of a dependency installed at the workspace level
> then it is installed locally and a warning is output.  
> The default is *true*.

> _registryMap_?: StringDictionary  
> A map between a package name and the npm registry URL from where it should be installed.

> _externalWorkspacePackageMap_?: StringDictionary  
> A map between a package name and a relative or rooted folder on disk where an external package can be found.

> _postInstallActions_?: ConditionableAction[]  
> A collection of actions that will executed once the workspace package has been installed. See
> [Conditionable Actions ](#conditionableactions) for more detail.

> _disableExternalWorkspaces_?: boolean  
> *true* to disable external workspace package linking ().  
> The default is *false*.

#### <a name="npmUninstall"></a> npmUninstall(_options_?)

Uninstalls the dependencies of a workspace package.

_options_: An optional hash of options:

> _continueOnError_?: boolean   
> *true* to continue streaming if the workspace package fails to uninstall.  
> The default is *true*.

> _postUninstallActions_?: ConditionableAction[]  
> A collection of actions that will be executed once the workspace package has been uninstalled. See
> [Conditionable Actions ](#conditionableactions) for more detail. 

# <a name="filtering"></a> Filtering Packages

Sometimes there will be a need to apply workspace level tasks across only a subset of the workspace packages.

#### <a name="filter"></a> filter(_filterFunc_: (packageDescriptor: PackageDescriptor, packagePath: string) => boolean)

Applies a filter to a stream and removes the workspace package from the stream if the supplied filter function
returns false. `filter()` ensures that workspace packages going forward in the stream meet the given
criteria.

_filterFunc_: A function that returns *false* to indicate that a package should be removed from the stream.

For example:

```javascript
gulp.task("publish", function() {
    // Only publish packages that are not marked as "private"
    return workspace.workspacePackages()
        .pipe(workspace.filter(function(packageDescriptor, packagePath) {
            return packageDescriptor.private === undefined
        }))
        .pipe(workspace.npmPublish());
});

```

# <a name="typescript"></a>Building with TypeScript

#### <a name="buildTypeScriptProject"></a> buildTypeScriptProject(_options_?)

Invokes the TypeScript compiler for a workspace package. If a version of the TypeScript compiler is present 'local'
to the package, then that version will be used over any version that may be installed at the workspace level.

_options_: An optional hash of options:

> _continueOnError_?: boolean  
> *true* to continue streaming if the workspace package fails to compile.  
> The default is *true*.

> _fastCompile_?: boolean  
> *true* to compile only those source files that are affected by change.  
> The default is *true*.

> _postTypeScriptCompileActions_?: ConditionableAction[]  
> A collection of actions that will be executed after the workspace package has been compiled. See
> [Conditionable Actions ](#conditionableactions) for more detail.

The `buildTypeScriptProject()` plugin is designed to work with `tsconfig.json` files. However, if you're working with an
older version of TypeScript, of you want to run the compiler with more than one configuration, you can provide the
compiler options by exporting a `getTypeScriptCompilerConfig()` function from the workspace package's
`gulpfile.workspace.js` file. This function should return an array of objects that define the TypeScript compiler
configuration options. For example:

```javascript
exports.getTypeScriptCompilerConfig = function() {
    return [
        {
            "compilerOptions": {
                "module": "commonjs",
                "target": "es5",
                ...
            },
            "files": [
                ...
            ]
        }
    ];
}
```

# <a name="publishing"></a> Publishing Packages

#### <a name="npmPublish"></a> npmPublish(_options_?)

Publishes a workspace package.

_options_: An optional hash of options:

> _continueOnError_?: boolean  
> *true* to continue streaming if the workspace package fails to publish.  
> The default is *true*.

> _shrinkWrap_?: boolean  
> *true* to generate a shrink wrap file for the workspace package before publishing.  
> The default is *true*.

> _prePublishActions_?: ConditionableAction[]  
> A collection of actions that will be executed prior to the workspace package being published. See
> [Conditionable Actions ](#conditionableactions) for more detail.

> _versionBump_?: string  
> A version number (i.e., "1.2.3") or a 'semver' release type (i.e., "major", "premajor", "minor", "preminor",
> "patch", "prepatch" or "prerelease").  
> The default is "patch".

# <a name="conditionableactions"></a> Conditionable Actions

Many of the plugins that `gulp-npmworkspace` provides have support for executing actions as part of their
behvior. A conditionable action is simply an object that provides the following properties:

> _condition_?: (_packageDescriptor_: PackageDescriptor, _packagePath_: string) => boolean  
> An optional function that if returns *true* indicates that the action should be applied. If no
> condition is supplied then the action is always applied.

> _action: (_packageDescriptor_: PackageDescriptor, _packagePath_: string, _callback_: (_error_?: Error))  
> The action function to execute. The callback must be invoked on completion and may supply an optional error
> to indicate a failure.

There are two ways of providing conditionable actions to the plugins:

1) Pass an array of Conditionalable Actions to the plugin as part of the options they accept:

For example, [`npmInstall()`](#npmInstall) can be invoked with actions such as:

```javascript
function doSomething(): Promise {
    // some asynchronous code
}

return workspace.workspacePackages()
    .pipe(workspace.npmInstall({
        postInstallActions: [
            {
                condition: function(package, packagePath) {
                    return getCondition() ? true : false;
                },
                
                action: function(package, packagePath, callback) {
                    doSomething().then(callback);
                }
            },
            // This action will always execute
            {
                action: function(package, packagePath, callback) {
                    doSomething().then(callback);
                }
            }
        ]
    }));
```

2) Add a `gulpfile.workspace.js` file to the root of the workspace package and add the action there:

Sometimes an action is only applicable to one package, and adding it via the plugin options means that you
would then have to introduce specific testing into a conditon to ensure that the action is only applied for
that given package. `gulp-npmworkspace` looks for `gulpfile.workspace.js` files when streaming the workspace
packages and makes it available to the other supporting plugins. This facilitates the addition of actions
that are applicable to only individual packages.

For example [`npmInstall()`](#npmInstall) will also use the `postInstall` export from a package's
`gulp.workspace.js` file:

```javascript
exports.postInstall = [
    {
        condition: function(package, packagePath) {
            ...
        },
        
        action: function(package, packagePath, callback) {
            ...
        }
    },
    // This action will always execute
    {
        action: function(package, packagePath, callback) {
            ...
        }
    }
]
```

Conditionable Actions defined in the workspace's `gulpfile.js` and passed into the plugins execute before
those defined in a package's `gulpfile.workspace.js` file. It is also important to note that they are also
executed in _array order_.

#### <a name="gulpfileworkspace"></a> gulpfile.workspace.js file export equivilants

* *npmInstall()*
  * postInstallActions
  * exports.postInstall
* *npmUninstall()*
  * postUninstallActions
  * exports.postUninstall
* *npmPublish()*
  * prePublishActions
  * exports.prePublish
* *buildTypeScriptProject()*
  * postTypeScriptCompileActions
  * exports.postTypeScriptCompile
  
# <a name="commandline"></a> Command line Switches

Although you can pass options to the plugins provided by `gulp-npmworkspace`, it is also convenient to be able
to override them from the command line when invoking the associated Gulp tasks that you have defined.

The following options support this:

```
-p or --package package-name
-p or --package !package-name  
```
Overrides the _package_ option that can be provided to [workspacePackages()](#installingworkspaces). Note the
use of '!'. This indicates that the _onlyNamedPackage_ option should be set to true.

```
--version-bump=version
```
Overrides the _versionBump_ option that can be provided to [npmPubish()](#npmPublish).

```
--disable-externals
```
Overrides the _disableExternalWorkspaces_ flag that can be provided to [npmInstall()](#npmInstall).

```
-v or --verbose
```
Enables verbose logging.