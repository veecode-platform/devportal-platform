package trivy

import future.keywords.in

default ignore = false

ignore {
	startswith(input.PkgName, "kernel")
}

ignore {
	input.PkgName == "linux-firmware"
}
