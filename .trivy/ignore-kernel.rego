package trivy

import data.lib.trivy

default ignore = false

# Ignore kernel packages - they require host-level fixes and are not actionable within containers
ignore {
	input.PkgName == "kernel"
}

ignore {
	input.PkgName == "kernel-core"
}

ignore {
	input.PkgName == "kernel-modules"
}

ignore {
	input.PkgName == "kernel-modules-core"
}

ignore {
	startswith(input.PkgName, "kernel-")
}
