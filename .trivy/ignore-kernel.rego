package trivy

import rego.v1

# Ignore kernel packages — these require host-level fixes and are not actionable in containers
default ignore := false

ignore if {
    input.PkgName == "kernel"
}

ignore if {
    startswith(input.PkgName, "kernel-")
}
