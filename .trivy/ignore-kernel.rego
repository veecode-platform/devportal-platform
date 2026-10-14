package trivy

# Return true to ignore (filter out) the vulnerability
default ignore = false

ignore {
    regex.match("^kernel", input.PkgName)
}
