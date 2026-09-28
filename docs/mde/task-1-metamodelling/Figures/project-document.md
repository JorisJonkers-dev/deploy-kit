# The project document, in full

The source of the project-document class diagram in the Task 1 report
(`project-document.pdf`). The class diagram in `spec/v1/10-project-intent.md`
leaves out the classes shared between levels (`Grant`, `Placement`, `EnvFile`,
`DependencyEdge`, `Asset` and the classes under them); the report shows every
class, so this block is that chapter's block with those classes added. The
platform document and the target metamodel are drawn from the blocks in
`spec/v1/14-platform-intent.md` and `spec/v1/20-resolved-deployment.md`
directly.

Render with `scripts/diagrams/class-diagram.py --report`; the commands are in
that script's docstring.

```mermaid
classDiagram
    direction LR

    class Project {
        +ProjectName project
        +string owner
        +SemVer schemaVersion
    }
    class Application {
        +ApplicationId id
    }
    class Migration {
        +Path changelog
    }
    class Credentials {
        +Rotation rotation
    }
    class Observability {
        +AlertClass alertClass
    }
    class Process {
        +string name
        +Lifecycle lifecycle
        +ImageAlias image
        +Runtime runtime
        +Engine engine
        +Duration startupBudget
        +Cutover cutover
        +Path[] writablePaths
    }
    class Capacity {
        +int count
        +string reason
    }
    class Surface {
        +string name
        +int port
    }
    class Sidecar {
        +string name
        +ImageAlias image
        +Quantity memory
        +Quantity cpu
    }
    class DependencyEdge {
        +ApplicationId application
        +string surface
        +bool required
    }
    class Exposure {
        +ExposureName name
        +Fqdn host
        +Audience audience
        +ContentPolicy contentPolicy
    }
    class Route {
        +Path path
        +Match match
        +string process
        +string surface
        +Audience audience
        +Path redirectTo
    }
    class Probe {
        +Path path
        +int port
        +int tcp
    }
    class Asset {
        +Path from
        +Path mountAt
        +map substitute
    }
    class Volume {
        +string claim
        +Path mountAt
        +Quantity size
        +DurabilityClass durability
    }
    class Placement {
        +Quantity memory
        +Quantity cpu
        +Arch[] arch
        +Site site
        +Capability[] capabilities
    }
    class DiskRequest {
        +Media[] media
    }
    class GpuRequest {
        +GpuClassName class
        +Quantity memory
    }
    class Scrape {
        +string process
        +string surface
        +Path path
    }
    class EnvFile {
        +ClusterTarget cluster
        +dotenv entries
    }
    class Placeholder {
        +PlaceholderKind kind
        +string source
    }

    class Grant {
        +SecretEngine engine
        +VaultPath path
        +string[] keys
        +AccessTier access
        +string role
        +string key
        +TransitOp[] operations
        +Delivery delivery
        +Path mountAt
        +FileMode fileMode
    }
    class Rotation {
        +Tolerance tolerates
        +Duration maxAge
    }

    Project "1" *-- "1..*" Application : applications
    Application "1" *-- "1..*" Process : processes

    Process "1" *-- "0..*" Surface : provides
    Process "1" *-- "0..*" Sidecar : sidecars
    Process "1" *-- "0..*" DependencyEdge : dependsOn
    DependencyEdge "1" *-- "0..1" Credentials : credentials
    Process "1" *-- "0..1" Probe : readiness
    Process "1" *-- "0..1" Probe : liveness
    Process "1" *-- "0..*" Asset : assets
    Process "1" *-- "0..*" Volume : volumes
    Process "1" *-- "1" Placement : placement
    Application "1" *-- "0..1" Migration : migration
    Application "1" *-- "0..1" Observability : observability
    Observability "1" *-- "1" Scrape : scrape
    Process "1" *-- "0..1" Capacity : replicas

    Placement "1" *-- "0..1" DiskRequest : disk
    Placement "1" *-- "0..1" GpuRequest : gpu

    Application "1" *-- "0..*" Exposure : exposure
    Exposure "1" *-- "1..*" Route : routes
    Route --> Surface : surface
    DependencyEdge ..> Surface : resolves by name

    Process "1" *-- "1..*" EnvFile : env per process
    EnvFile "1" *-- "0..*" Placeholder : resolves

    Application "1" *-- "0..*" Grant : secrets
    Process "1" *-- "0..*" Grant : secrets
    Grant "1" *-- "0..1" Rotation : rotation
    Placeholder ..> Grant : byte-matches
    Placeholder ..> Exposure : addresses application.name

```
