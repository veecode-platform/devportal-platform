package trivy

import rego.v1

# Return true to ignore/filter out the vulnerability
default ignore := false

ignore if {
    kernel_pkgs := {"kernel", "kernel-core", "kernel-modules", "kernel-devel", "kernel-headers"}
    input.PkgName in kernel_pkgs
}
