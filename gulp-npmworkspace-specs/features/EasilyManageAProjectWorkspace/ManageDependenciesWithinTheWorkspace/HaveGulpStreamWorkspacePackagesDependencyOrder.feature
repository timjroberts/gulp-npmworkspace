@requiresWorkspace
Feature: Have Gulp stream workspace packages in dependency order

As a Develoepr
I want to have Gulp stream workspace packages in dependency order
So that I can easily automate workspace level tasks

With workspace packages defining their dependencies and where those dependencies make reference
to another package that is also present in the workspace, it should be easy to compute the overall
order of the packages so that they can be streamed to a gulp pipeline in dependency order. This
would negate the need for a Devloper to maintain their own ordered lists when building workspace
level tasks.

Scenario: Simple linear dependencies
    Ensures that a simple set of dependencies are returned in the expected order.

    Given a Workspace with:
        | package   | dependencies |
        | package-a |              |
        | package-b | package-a    |
        | package-c | package-b    |
    When the workspace packages are streamed
    Then the order of the packages received is "package-a, package-b, package-c"

Scenario: Circular dependencies
    Where a set of dependencies become circular, rather than streaming the workspace packages an
    error should be reported instead.

    Given a Workspace with:
        | package   | dependencies |
        | package-a | package-c    |
        | package-b | package-a    |
        | package-c | package-b    |
    When the workspace packages are streamed
    Then a circular dependency error is reported
