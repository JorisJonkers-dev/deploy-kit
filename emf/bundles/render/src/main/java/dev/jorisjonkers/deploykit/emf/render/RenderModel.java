package dev.jorisjonkers.deploykit.emf.render;

import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentPackage;
import java.nio.file.Path;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.emf.ecore.resource.impl.ResourceSetImpl;
import org.eclipse.emf.ecore.xmi.impl.XMIResourceFactoryImpl;

/**
 * The rendering run on one Resolved Deployment model file, the run {@code render.launch} makes in
 * Eclipse: {@code args[0]} the model, {@code args[1]} the directory its Deliverable Set is written
 * under, through {@link Rendering#render}, the entry the pipeline and the tests use.
 *
 * <p>The model's package is registered by its namespace URI in the model's own resource set, so a model
 * that names no schema location loads as the generated classes the templates are written against,
 * whether or not a workspace or a plug-in registry knows the package.
 */
public final class RenderModel {

    private RenderModel() {}

    public static void main(String[] args) {
        ResourceSet resources = new ResourceSetImpl();
        resources.getPackageRegistry().put(ResolvedDeploymentPackage.eNS_URI, ResolvedDeploymentPackage.eINSTANCE);
        resources.getResourceFactoryRegistry().getExtensionToFactoryMap().put("*", new XMIResourceFactoryImpl());
        Resource model = resources.getResource(
                URI.createFileURI(Path.of(args[0]).toAbsolutePath().toString()), true);
        Rendering.render(
                model.getContents().stream().map(ResolvedDeployment.class::cast).toList(), Path.of(args[1]));
    }
}
