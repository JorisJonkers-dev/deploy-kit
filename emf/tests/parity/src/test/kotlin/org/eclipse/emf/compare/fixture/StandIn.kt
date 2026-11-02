package org.eclipse.emf.compare.fixture

/**
 * A stand-in for a class of EMF Compare, which this suite has no classpath entry for: it sits in EMF
 * Compare's package so the fixture EMF-021 is shown firing on can depend on it. It is never called;
 * it exists to be imported.
 */
object StandIn {
    fun name(): String = "stand-in"
}
