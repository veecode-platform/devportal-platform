package trivy

import rego.v1

default ignore := false

ignore if {
	input.PkgName == "kernel"
}

ignore if {
	startswith(input.PkgName, "kernel-")
}
