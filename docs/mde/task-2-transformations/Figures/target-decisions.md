# The decision classes of the target metamodel that changed in Task 2

The source of the decision-class diagram in the Task 2 report
(`target-decisions.pdf`), cut from
`emf/bundles/metamodel/model/resolved-deployment.ecore`. A class marked
`<<new>>` is new in Task 2; every other class is a Task 1 class and lists only
the features Task 2 added, each marked `[new]`. A class contained in several
places is drawn under its first container only.

Render with `scripts/diagrams/class-diagram.py --report --changes`; the
commands are in that script's docstring.

```mermaid
classDiagram
    direction TB

    class ResolvedDeployment {
    }
    class ResolvedApplication {
        +string secretStore [new]
    }
    class ResolvedProcess {
        +string lifecycle [new]
    }
    class ReleaseGate {
        +string endpoint [new]
    }
    class ResolvedMigration {
        +int uid [new]
        +int gid [new]
        +string identity [new]
        +string deadline [new]
        +string memory [new]
        +string cpu [new]
        +string scratch [new]
    }
    class ResolvedGrant {
        +string engine [new]
        +string destination [new]
        +string mountAt [new]
        +string fileMode [new]
    }
    class ResolvedVolume {
        +string mountAt [new]
    }
    class BackupPlan {
        +int uid [new]
        +int gid [new]
        +string identity [new]
        +string claim [new]
    }
    class EnvEntry {
    }
    class ResolvedExposure {
        +string listener [new]
        +string certificates [new]
        +string proxyApplication [new]
        +string proxyNamespace [new]
    }
    class PolicyPeer {
        +string rule [new]
    }
    class StartupProbe {
        +string timeout [new]
    }
    class ResolvedPolicyJob {
        <<new>>
        +string identity
        +string namespace
        +string image
        +int uid
        +int gid
        +string role
        +string address
        +string memory
        +string cpu
        +string deadline
    }
    class ResolvedEvents {
        <<new>>
        +string namespace
        +string address
    }
    class ResolvedScrape {
        <<new>>
        +ResolvedProcess process
        +string surface
        +string path
        +string interval
        +string timeout
    }
    class GateMigration {
        <<new>>
        +string identity
        +string testedAgainst
        +bool nonTransactional
    }
    class MigratedDatabase {
        <<new>>
        +string host
        +int port
        +string name
    }
    class PolicyPath {
        <<new>>
        +string path
        +string[] allows
    }
    class BackupPeer {
        <<new>>
        +string host
        +int port
    }
    class AdmittedRange {
        <<new>>
        +string cidr
        +int port
    }
    class ResolvedAsset {
        <<new>>
        +string name
        +string from
        +string mountAt
        +string content
    }
    class ResolvedSidecar {
        <<new>>
        +string name
        +string image
        +string memory
        +string cpu
    }
    class ResolvedApiAccess {
        <<new>>
        +string reason
    }
    class ResolvedApiRule {
        <<new>>
        +string group
        +string[] objects
        +string[] verbs
    }
    class SecretReference {
        <<new>>
        +string path
        +string key
    }

    ResolvedDeployment "1" *-- "1..*" ResolvedApplication : applications
    ResolvedDeployment "1" *-- "0..1" ResolvedPolicyJob : policyJob
    ResolvedDeployment "1" *-- "0..1" ResolvedEvents : events
    ResolvedApplication "1" *-- "0..1" ReleaseGate : releaseGate
    ResolvedApplication "1" *-- "0..1" ResolvedMigration : migration
    ResolvedApplication "1" *-- "0..*" ResolvedExposure : exposure
    ResolvedApplication "1" *-- "0..1" ResolvedScrape : scrape
    ResolvedApplication "1" *-- "1..*" ResolvedProcess : processes
    ResolvedProcess "1" *-- "0..1" ResolvedApiAccess : api
    ResolvedProcess "1" *-- "0..1" StartupProbe : startup
    ResolvedProcess "1" *-- "0..*" ResolvedVolume : volumes
    ResolvedProcess "1" *-- "0..*" ResolvedAsset : assets
    ResolvedProcess "1" *-- "0..*" ResolvedSidecar : sidecars
    ResolvedProcess "1" *-- "0..*" EnvEntry : environment
    ReleaseGate "1" *-- "0..1" GateMigration : migration
    ResolvedMigration "1" *-- "1" MigratedDatabase : database
    ResolvedMigration "1" *-- "1" ResolvedGrant : credential
    ResolvedGrant "1" *-- "0..*" PolicyPath : paths
    ResolvedVolume "1" *-- "0..1" BackupPlan : backup
    BackupPlan "1" *-- "0..1" BackupPeer : peer
    EnvEntry "1" *-- "0..1" SecretReference : secret
    ResolvedPolicyJob "1" *-- "0..*" PolicyPeer : egress
    ResolvedApiAccess "1" *-- "1..*" ResolvedApiRule : rules
    ResolvedApiAccess "1" *-- "1..*" AdmittedRange : server
```
