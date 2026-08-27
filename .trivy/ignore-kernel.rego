package trivy

# Ignore kernel packages — they require host-level fixes and are not
# actionable within containers.
deny[msg] {
	startswith(input.PkgName, "kernel")
	msg := sprintf("kernel package %s is not actionable in containers", [input.PkgName])
}
