package dev.jorisjonkers.deploykit.emf.cli.fixture;

import dev.jorisjonkers.deploykit.emf.metamodel.fixture.LowerReachingUp;

/**
 * The other half of the fixture EMF-010 and EMF-011 are shown firing on: a class in the highest
 * module of the table reaching down, which the direction allows, and which closes the cycle the
 * upward reach in {@link LowerReachingUp} opens. It is never called; it exists to be imported.
 */
public final class UpperReachingDown {

    private UpperReachingDown() {}

    public static String name() {
        return "fixture";
    }

    public static String down() {
        return LowerReachingUp.up();
    }
}
