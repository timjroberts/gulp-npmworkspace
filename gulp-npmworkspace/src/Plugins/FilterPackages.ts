import File = require("vinyl");

import {packageDescriptorPlugin, MappedPackage} from "./utilities/PackageDescriptorPlugin";
import {PackageDescriptor} from "../PackageDescriptor";

/**
 * A function that returns true to indicate that a package should be filtered.
 *
 * @param packageDescriptor The package descriptor representing the 'package.json' file.
 * @param packagePath The path to the package.
 */
export type FilterFunction<T> = (packageDescriptor: PackageDescriptor, packagePath: string) => T;

/**
 * The [[filter]] plugin implementation.
 *
 * @param packageDescriptor The package descriptor representing the 'package.json' file.
 * @param packagePath The path to the package.
 * @param packageMap A dictionary of packages that have been processed by the current plugin.
 * @filterFunc The [[FilterFunction<>]] that was provided by the caller.
 *
 * @returns A boolean value returned from the filter function.
 */
function filterPackage(packageDescriptor: PackageDescriptor, packagePath: string, file: File, packageMap: IDictionary<MappedPackage>, filterFunc: FilterFunction<boolean>): boolean {
    return filterFunc(packageDescriptor, packagePath);
}

/**
 * A Gulp plugin that accepts and returns a stream of 'package.json' files and applies a filter function to each one in order
 * to determine if the file should be included in the returned stream or not.
 *
 * @param filterFunc A function that accpets a package descriptor and the package path and returns a boolean value where
 * false removes the file from the stream.
 *
 * @returns A stream that contains the filtered 'package.json' files.
 */
export var filter: (filterFunc: FilterFunction<boolean>) => NodeJS.ReadWriteStream = packageDescriptorPlugin(filterPackage);
