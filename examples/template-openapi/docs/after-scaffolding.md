# After Scaffolding

After the OpenAPI Template completes scaffolding, you'll have a fully configured API project with Kong Gateway integration.

## What Gets Created

### 1. Git Repository

A new repository is created with the following structure:

```text
your-api-project/
├── openapi.yaml           # Your OpenAPI specification
├── docs/
│   └── README.md         # API documentation
├── .gitignore            # Git ignore rules
└── README.md             # Project overview
```

### 2. Kong Gateway Configuration

The template automatically configures Kong Gateway with:

- **Service Created**: Your API service is registered in Kong
- **Route Configured**: Public route is set up and accessible
- **Configuration Applied**: All settings are live in your Kong instance

### 3. Backstage Catalog Entity

Your API is automatically registered in the Backstage catalog:

- Appears in the API catalog
- Linked to the OpenAPI specification
- Associated with your team/owner
- Available for discovery by other developers

## Accessing Your API

### Kong Gateway Endpoint

Your API is now accessible through Kong Gateway at:

```text
https://{kong-gateway-url}/{route-path}
```

Example:

```bash
curl https://gateway.example.com/payment/v1/transactions
```

### Repository

Clone your new repository:

```bash
git clone https://github.com/{org}/{repo-name}.git
```

### Backstage Catalog

View your API in the Backstage catalog:

1. Navigate to **APIs** in the sidebar
2. Search for your API name
3. View specification, documentation, and metadata

## Next Steps

### 1. Customize Kong Configuration

Enhance your Kong setup with additional features:

- **Add Plugins**: Rate limiting, authentication, CORS, etc.
- **Configure Upstream**: Set up load balancing or service discovery
- **Update Routes**: Add more routes or modify existing ones

Example - Add rate limiting:

```bash
curl -X POST http://localhost:8001/services/{service-name}/plugins \
  --data "name=rate-limiting" \
  --data "config.minute=100"
```

### 2. Implement Your API

Use the specification as a contract and implement the backend:

- Follow the OpenAPI specification exactly
- Implement all defined endpoints
- Validate request/response schemas
- Add proper error handling

### 3. Set Up CI/CD

Configure automated deployment:

- **Validation**: Lint and validate OpenAPI spec on each commit
- **Testing**: Add API tests using tools like Postman/Newman
- **Deployment**: Auto-update Kong configuration on merge

### 4. Monitor and Maintain

- **Kong Metrics**: Monitor API usage through Kong's dashboard
- **Update Specification**: Keep OpenAPI spec in sync with implementation
- **Version Management**: Plan API versioning strategy

## Common Tasks

### Update OpenAPI Specification

1. Modify `openapi.yaml` in your repository
2. Commit and push changes
3. Re-run Kong configuration if needed

### Add New Routes

Edit `kong/route.yaml` and apply changes:

```bash
deck sync -s kong/
```

### Configure Authentication

Add Kong authentication plugin:

```bash
curl -X POST http://localhost:8001/services/{service-name}/plugins \
  --data "name=key-auth"
```

## Getting Help

If you encounter issues:

- Check Kong Gateway logs for configuration errors
- Validate your OpenAPI specification
- Review repository contents for correct structure
- Contact platform team for support

## Resources

- [Kong Gateway Documentation](https://docs.konghq.com/)
- [OpenAPI Specification](https://swagger.io/specification/)
- [Backstage API Documentation](https://backstage.io/docs/features/software-catalog/descriptor-format#kind-api)
