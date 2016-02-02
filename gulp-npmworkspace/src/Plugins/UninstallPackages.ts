import * as rimraf from "rimraf";
import * as path from "path";
import * as util from "gulp-util";
import * as _ from "underscore";
import File = require("vinyl");

import {packageDescriptorPlugin} from "./utilities/PackageDescriptorPlugin";
import {PluginError, PluginErrorOptions} from "./utilities/PluginError";
import {NpmWorkspacePluginOptions, getWorkspacePluginOptions} from "../NpmWorkspacePluginOptions";
import {PackageDescriptor} from "../PackageDescriptor";
import {ConditionableAction, AsyncAction, executeAsynchronousActions} from "./ConditionableAction";
import {Logger} from "./utilities/Logging";
import {NpmPluginBinding} from "./utilities/NpmPluginBinding";

/**
 * Options for npmUninstall().
 */
export interface NpmUninstallOptions {
    /**
     * true to continue if a workspace package fails to uninstall.
     *
     * Defaults to true.
     */
    continueOnError?: boolean;

    /**
     * A combination of a condition and an action that will be executed once the package has been installed.
     */
    postUninstallActions?: Array<ConditionableAction<AsyncAction>>;
}

/**
 * Creates a binding for the [[npmUninstall]] plugin.
 *
 * @returns An [[NpmPluginBinding<>]] object.
 */
function npmUninstallPackageBinding(options?: NpmUninstallOptions & NpmWorkspacePluginOptions): NpmPluginBinding<NpmUninstallOptions & NpmWorkspacePluginOptions> {
    return new NpmPluginBinding<NpmUninstallOptions & NpmWorkspacePluginOptions>(_.extend(getWorkspacePluginOptions(options), { continueOnError: true }, options));
}

/**
 * The [[npmUninstall]] plugin implementation.
 *
 * @param packageDescriptor The package descriptor representing the 'package.json' file.
 * @param packagePath The path to the package.
 */
function npmUninstallPackage(packageDescriptor: PackageDescriptor, packagePath: string, file: File): Promise<void> {
    let pluginBinding: NpmPluginBinding<NpmUninstallOptions & NpmWorkspacePluginOptions> = this;

    return new Promise<void>((resolve, reject) => {
        Logger.info(util.colors.bold(`Uninstalling workspace package '${util.colors.cyan(packageDescriptor.name)}'`));

        try {
            rimraf.sync(path.resolve(packagePath, "node_modules"));

            let postUninstallActions: ConditionableAction<AsyncAction>[]
                = _.union(pluginBinding.options.postUninstallActions, file["getWorkspace"]()["postUninstall"]);

            if (postUninstallActions) {
                Logger.verbose(`Running post-uninstall actions for workspace package '${util.colors.cyan(packageDescriptor.name)}'`);

                executeAsynchronousActions(postUninstallActions, packageDescriptor, packagePath)
                    .then(resolve)
                    .catch((error) => {
                        handleError(error, packageDescriptor.name, pluginBinding.options.continueOnError, reject);
                    });
            }
            else {
                resolve();
            }
        }
        catch (error) {
            handleError(error, packageDescriptor.name, pluginBinding.options.continueOnError, reject);
        }
    });
}

function handleError(error: any, packageName: string, continueOnError: boolean, rejectFunc: (error?: any) => void) {
    rejectFunc(new PluginError("Error uninstalling a workspace package",
                               `Error uninstalling workspace package '${util.colors.cyan(packageName)}':\n${util.colors.red(error.message)}`,
                               { continue: continueOnError }));
}

/**
 * A Gulp plugin that accepts and returns a stream of 'package.json' files and uninstalls the dependant packages for each one.
 * Symbolic links are created for each dependency if it represents another package present in the workspace.
 *
 * @param options A optional hash of [[NpmUninstallOptions]].
 *
 * @returns A stream that contains the 'package.json' files.
 */
export var npmUninstall: () => NodeJS.ReadWriteStream = packageDescriptorPlugin(npmUninstallPackage, npmUninstallPackageBinding);
