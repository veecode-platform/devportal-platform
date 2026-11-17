package trivy

import future.keywords.if

# Ignore kernel packages — these require host-level fixes and are not
# actionable within containers.
default ignore = false

ignore if {
	input.PkgName == "kernel"
}

ignore if {
	startswith(input.PkgName, "kernel-")
}
