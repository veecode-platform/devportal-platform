# What is a Template?

A Backstage template is a blueprint for creating new projects. Think of it as a project starter that generates code, configuration files, and documentation automatically.

## 🎯 Template Purpose

Templates help teams:
- **Standardize** project structures across the organization
- **Automate** repetitive setup tasks
- **Enforce** best practices and conventions
- **Accelerate** new project creation

## 📋 What's in a Template?

A template consists of:

### Template Definition (`template.yaml`)
The main configuration file that defines:
- **Parameters**: What information users need to provide
- **Steps**: Actions to execute during scaffolding
- **Outputs**: What to show users when complete

### Template Files (`content/`)
The actual files that will be copied to the new project:
- Source code files
- Configuration files
- Documentation
- CI/CD pipelines

## 🔧 Template Parameters

Templates can ask for information like:
- **Project name**: What to call the new service
- **Repository URL**: Where to create the GitHub repo
- **Options**: Features to include or exclude

Example:
```yaml
parameters:
  - title: Project Information
    required:
      - name
      - repoUrl
    properties:
      name:
        title: Service Name
        type: string
      repoUrl:
        title: Repository Location
        type: string
```

## 📁 Simple Template Structure

```
my-template/
├── template.yaml          # Template definition
├── catalog-info.yaml      # Template metadata
├── mkdocs.yml             # Documentation config
├── docs/                  # This documentation
│   └── index.md
└── content/               # Files to generate
    ├── package.json
    ├── index.js
    └── catalog-info.yaml
```

## 🎨 Template Types

### Service Templates
Create backend services, APIs, microservices

### Application Templates  
Generate frontend applications, web apps

### Infrastructure Templates
Create Kubernetes configs, Terraform modules

### Library Templates
Setup shared libraries, SDKs, packages

---

!!! info "Info"
    Templates are written in YAML and can include JavaScript for complex logic.

!!! tip "Tip"
    Start simple! You can always add more complexity to a template later.
