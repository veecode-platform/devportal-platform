package trivy

import data.lib.trivy

default ignore = false

ignore {
  input.PkgName == "kernel"
}

ignore {
  startswith(input.PkgName, "kernel-")
}
