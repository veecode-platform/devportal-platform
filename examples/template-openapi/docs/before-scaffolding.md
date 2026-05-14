# Before Scaffolding

Before using the OpenAPI Template, ensure you have the following prerequisites in place.

## Prerequisites

### 1. OpenAPI Specification

Prepare your OpenAPI specification file (version 3.0 or later):

- Ensure the spec is valid and well-formed
- Include all required endpoints, methods, and schemas
- Document request/response structures clearly
- Validate using tools like [Swagger Editor](https://editor.swagger.io/)

### 2. Kong Gateway Access

You'll need:

- **Kong Gateway URL**: The base URL of your Kong Gateway instance
- **Admin API Access**: Credentials or token for Kong Admin API
- **Workspace Name**: (Optional) If using Kong Enterprise workspaces

### 3. Repository Configuration

Decide on repository settings:

- **Repository Name**: Choose a meaningful name for your API project
- **Organization/Namespace**: Where the repository will be created
- **Visibility**: Public or private repository
- **Git Provider**: GitHub, GitLab, Bitbucket, or Azure DevOps

### 4. Authentication

Ensure you have proper credentials:

- **Git Provider Token**: Personal access token with repository creation permissions
- **Kong Admin API Token**: If Kong API is secured

## Information to Gather

Before starting the scaffolding process, have the following ready:

| Field | Description | Example |
|-------|-------------|---------|
| API Name | Descriptive name for your API | `payment-api` |
| API Version | Version of your API | `v1` |
| OpenAPI Spec URL | URL or path to your spec | `https://example.com/openapi.yaml` |
| Kong Service Host | Backend service URL | `https://api.backend.com` |
| Kong Route Path | Public path for your API | `/payment/v1` |
| Repository Name | Name for the new repository | `payment-api-spec` |

## Validation Checklist

- [ ] OpenAPI specification is valid and accessible
- [ ] Kong Gateway is running and accessible
- [ ] Git provider authentication is configured
- [ ] Repository namespace/organization exists
- [ ] You have necessary permissions for all platforms

## Next Steps

Once you have everything ready, proceed to create your API project using the template. The scaffolding process will guide you through each configuration step.
