package dev.jorisjonkers.deploykit.emf.metamodel.fixture;

import dev.jorisjonkers.deploykit.emf.cli.fixture.UpperReachingDown;

/**
 * The fixture EMF-010 and EMF-011 are shown firing on: a class in the lowest module of the table
 * reaching up into the highest, which the module direction forbids and which closes a cycle with
 * {@link UpperReachingDown}
 * (docs/adr/architecture/0104-every-enforced-rule-has-an-id-a-row-and-a-fixture.md). It is never
 * called; it exists to be imported.
 */
public final class LowerReachingUp {

    private LowerReachingUp() {}

    public static String up() {
        return UpperReachingDown.name();
    }
}
