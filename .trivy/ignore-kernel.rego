package trivy

import rego.v1

# Ignore kernel packages — they require host-level fixes and are not
# actionable within containers.
ignore if {
	startswith(input.PkgName, "kernel")
}
