package trivy

import rego.v1

# Ignore kernel packages — they require host-level fixes and are not actionable within containers.
default ignore := false

ignore if {
	input.PkgName in {"kernel", "kernel-core", "kernel-modules", "kernel-modules-core", "kernel-uki-virt"}
}
