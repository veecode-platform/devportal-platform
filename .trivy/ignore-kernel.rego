package trivy

import data.lib.trivy

default ignore = false

# Ignore kernel packages — they require host-level fixes, not container fixes
ignore {
	input.PkgName == "kernel"
}

ignore {
	startswith(input.PkgName, "kernel-")
}
