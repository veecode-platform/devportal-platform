# After Scaffolding

Once your template finishes executing, you have a new project ready to use. Here's what you get and what to do next.

## 🎉 What You Receive

### Generated Repository
- **GitHub repository** with your project name
- **Initial commit** with all template files
- **Repository settings** configured (branch protection, etc.)

### Backstage Integration  
- **Catalog entry** for your new service
- **Documentation** automatically available
- **Ownership** assigned to your team

### Project Files
- **Source code** with your project name inserted
- **Configuration files** customized for your setup
- **Documentation** explaining your new project

## 🚀 Next Steps

### 1. Clone Your New Project
```bash
git clone https://github.com/your-org/your-service.git
cd your-service
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start Local Development
```bash
npm run dev
```

### 4. Make It Your Own
- Update the README with project details
- Add your specific business logic
- Configure environment variables
- Set up your development environment

## 📚 What to Check

### Verify the Basics
- [ ] Project builds without errors
- [ ] Tests pass successfully  
- [ ] Local development starts properly
- [ ] Documentation looks correct

### Configure for Your Team
- [ ] Update ownership in catalog-info.yaml
- [ ] Set up proper repository permissions
- [ ] Configure CI/CD for your workflow
- [ ] Add team-specific dependencies

## 🔧 Common Customizations

### Update Package.json
```json
{
  "name": "your-service",
  "description": "Your service description",
  "repository": "github.com/your-org/your-service"
}
```

### Customize Catalog Entry
```yaml
# catalog-info.yaml
metadata:
  name: your-service
  description: What your service does
spec:
  owner: your-team
  system: your-system
```

### Add Your Code
- Replace example code with your business logic
- Add API endpoints for your use case
- Configure database connections
- Set up authentication

## 🎯 When Things Go Wrong

### Build Errors
- Check that all dependencies are installed
- Verify environment variables are set
- Review error messages for missing configuration

### Permission Issues  
- Ensure you have access to the repository
- Check GitHub permissions for your team
- Verify catalog ownership settings

### Documentation Issues
- Refresh the TechDocs build
- Check mkdocs.yml configuration
- Verify file paths are correct

## 📈 Growing Your Project

### Add Features
- New API endpoints
- Database models
- Authentication methods
- External integrations

### Improve Quality
- Add more tests
- Set up code quality tools
- Configure monitoring
- Add security scanning

### Team Collaboration
- Add contributing guidelines
- Set up code review process  
- Configure team notifications
- Document your architecture

---

!!! tip "Tip"
    Your generated project is just a starting point. Don't be afraid to modify it extensively to fit your needs!

!!! info "Info"
    The catalog entry will update automatically as you push changes to your repository.
