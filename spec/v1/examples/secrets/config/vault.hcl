# The worked Secret Store's server configuration: one raft server, which is
# the whole cluster, storing on the volume its Process declares.
#
# mlock stays off: locking memory needs IPC_LOCK, which the rendered posture
# drops with every other capability and Pod Security's restricted profile
# never grants.

ui            = true
disable_mlock = true

api_addr     = "http://vault.secrets-system.svc.cluster.local:8200"
cluster_addr = "https://127.0.0.1:8201"

listener "tcp" {
  address         = "[::]:8200"
  cluster_address = "[::]:8201"
  tls_disable     = 1
}

storage "raft" {
  path = "/vault/data"
}
