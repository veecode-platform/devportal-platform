package trivy

import rego.v1

default ignore := false

# Ignore kernel packages — they require host-level fixes and are not actionable in containers
ignore if {
	input.PkgName == "kernel"
}

ignore if {
	startswith(input.PkgName, "kernel-")
}
