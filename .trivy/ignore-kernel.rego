package trivy

# Ignore kernel packages — these require host-level fixes and are not
# actionable within containers.
deny[msg] {
	vuln := input.Vulnerabilities[_]
	startswith(vuln.PkgName, "kernel")
	msg := sprintf("kernel package %s is not actionable in containers", [vuln.PkgName])
}
