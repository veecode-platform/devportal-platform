package trivy

import data.lib.trivy

default ignore = false

# Ignore kernel packages - they require host-level fixes and are not
# actionable within containers
ignore {
	input.PkgName == "kernel"
}

ignore {
	startswith(input.PkgName, "kernel-")
}
