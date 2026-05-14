# How Scaffolding Works

Scaffolding is the process of using a template to create a new project. Here's what happens step-by-step.

## 🔄 The Scaffolding Process

### 1. User Input
You fill out a form in the Backstage UI with:
- Project name
- Repository location  
- Configuration options

### 2. Template Execution
Backstage runs the template steps in order:
```yaml
steps:
  - id: fetch-template
    name: Get template files
    action: fetch:template
    
  - id: create-repo  
    name: Create GitHub repository
    action: publish:github
    
  - id: register-catalog
    name: Add to catalog
    action: catalog:register
```

### 3. File Generation
Template variables are replaced with your input:
- `${{ parameters.name }}` → `my-service`
- `${{ parameters.repoUrl }}` → Your GitHub repo

### 4. Repository Creation
A new GitHub repository is created with:
- All the generated files
- Proper initial commit
- Repository settings configured

### 5. Catalog Registration
Your new service is automatically added to the Backstage catalog so others can discover it.

## 📋 What Actually Happens

### Behind the Scenes
1. **Backend Processing**: Backstage backend executes the template
2. **File Operations**: Files are copied and modified
3. **Git Operations**: Repository is created and pushed
4. **Catalog Update**: New entity is registered
5. **Notification**: You get notified when complete

### Template Variables
The template can use variables like:
```yaml
# In template.yaml
name: ${{ parameters.name }}
repoUrl: ${{ parameters.repoUrl }}

# In generated files
const serviceName = '${{ parameters.name }}';
```

## 🎯 Common Template Actions

### `fetch:template`
Copy template files and replace variables

### `publish:github` 
Create GitHub repository and push code

### `catalog:register`
Add the new service to Backstage catalog

### `debug:log`
Show progress messages to the user

## ⏱️ How Long It Takes

Most templates complete in:
- **Simple templates**: 30-60 seconds
- **Complex templates**: 2-5 minutes
- **Enterprise templates**: 5-10 minutes

## 🔍 What You See

During scaffolding, you'll see:
- Progress indicators for each step
- Log messages showing what's happening
- Success/failure notifications
- Links to generated resources

---

!!! tip "Tip"
    If scaffolding fails, check the error logs - they usually show exactly what went wrong.

!!! info "Info"
    Templates run in the Backstage backend, not your browser, so they can access GitHub and other services securely.
