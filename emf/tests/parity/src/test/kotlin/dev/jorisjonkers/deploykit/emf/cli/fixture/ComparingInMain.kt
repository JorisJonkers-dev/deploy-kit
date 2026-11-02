package dev.jorisjonkers.deploykit.emf.cli.fixture

import org.eclipse.emf.compare.fixture.StandIn

/**
 * The fixture EMF-021 is shown firing on: a class in a module's package reaching into EMF Compare's,
 * as a class the bundle tier ships would if it compared models itself. It is never called; it exists
 * to be imported.
 */
object ComparingInMain {
    fun compare(): String = StandIn.name()
}
