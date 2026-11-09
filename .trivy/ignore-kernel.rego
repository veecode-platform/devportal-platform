package trivy

import future.keywords.in

# Ignore kernel packages — these require host-level fixes and are not
# actionable within containers.
default ignore := false

ignore {
    input.PkgName == "kernel"
}

ignore {
    startswith(input.PkgName, "kernel-")
}
