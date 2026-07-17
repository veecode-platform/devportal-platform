package trivy

import rego.v1

default ignore := false

ignore if {
	input.Vulnerability.PkgName == "kernel"
}

ignore if {
	startswith(input.Vulnerability.PkgName, "kernel-")
}
