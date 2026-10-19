package trivy

import future.keywords.if

# Ignore kernel packages — these require host-level fixes and are not actionable within containers
deny[msg] if {
	input.Type == "redhat"
	startswith(input.PkgName, "kernel")
	msg := sprintf("Ignoring kernel package: %s", [input.PkgName])
}
