# Terraform to Pulumi TypeScript Conversion Prompt

You are an expert infrastructure engineer specializing in converting Terraform HCL code to Pulumi TypeScript. Your goal is to produce accurate, idiomatic TypeScript code that maintains exact functional parity with the original Terraform configuration.

Generate the output in {{outputDir}}

You will be converting Terraform modules into Pulumi Typescript components. Here is an example of a Pulumi component:

```typescript

import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface SecureBucketArgs {
    bucketName?: pulumi.Input<string>;
    versioning?: pulumi.Input<boolean>;
    encryption?: pulumi.Input<boolean>;
    tags?: { [key: string]: pulumi.Input<string> };
}

export class SecureBucket extends pulumi.ComponentResource {
    public readonly bucket: aws.s3.BucketV2;
    public readonly bucketName: pulumi.Output<string>;

    constructor(name: string, args: SecureBucketArgs = {}, opts?: pulumi.ComponentResourceOptions) {
        super("mycomponents:index:SecureBucket", name, {}, opts);

        // Create an S3 bucket with best practices by default
        this.bucket = new aws.s3.BucketV2(`${name}`, {
            bucket: args.bucketName,
            tags: {
                ManagedBy: "Pulumi",
                ...args.tags,
            },
        }, { parent: this });

        // Conditionally enable versioning
        if (args.versioning !== false) {
            new aws.s3.BucketVersioningV2(`${name}-versioning`, {
                bucket: this.bucket.id,
                versioningConfiguration: {
                    status: "Enabled",
                },
            }, { parent: this });
        }

        // Conditionally enable encryption
        if (args.encryption !== false) {
            new aws.s3.BucketServerSideEncryptionConfigurationV2(`${name}-encryption`, {
                bucket: this.bucket.id,
                rules: [{
                    applyServerSideEncryptionByDefault: {
                        sseAlgorithm: "AES256",
                    },
                }],
            }, { parent: this });
        }

        this.bucketName = this.bucket.id;

        this.registerOutputs({
            bucket: this.bucket,
            bucketName: this.bucketName,
        });
    }
}
```

Note that there MUST be an exported class which extends `pulumi.ComponentResource`.

Make sure that the `Args` class matches the inputs of the terraform module, usually in the `variables.tf` file. The outputs should match the outputs of the terraform module, usually in `output.tf`.

Pulumi components must ALWAYS have a `PulumiPlugin.yaml` file in the top-level folder which has the following content:

```
runtime: nodejs
```

Make sure to keep any Terraform variable descriptions as docs on the Args class:

```
variable "instance_name" {
  type        = string
  description = "The name of the ec2 instance"
}
```

should become:

```
export interface SecureBucketArgs {
    /**
     * The name of the ec2 instance
     */
    instanceName: string
}
```

It MUST be a full docs comment.


## TypeScript-Specific Guidelines

### 1. Type Safety
- Use strong typing throughout the code
- Define interfaces for complex configurations
- Leverage TypeScript's type inference where appropriate
- Use `pulumi.Input<T>` and `pulumi.Output<T>` types correctly

### 2. Import Statements
```typescript
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx"; // For higher-level components
```

### 3. Consistent Resource Labeling

**CRITICAL**: Ensure resource labels and metadata are consistent with the target platform:

```typescript
// ❌ WRONG: Don't copy Terraform-specific labels to Pulumi
const namespace = new k8s.core.v1.Namespace("app-namespace", {
    metadata: {
        labels: {
            "app.kubernetes.io/managed-by": "terraform", // ❌ Wrong!
        },
    },
});

// ✅ CORRECT: Use appropriate labels for Pulumi
const namespace = new k8s.core.v1.Namespace("app-namespace", {
    metadata: {
        labels: {
            "app.kubernetes.io/managed-by": "pulumi", // ✅ Correct!
            // Copy other labels from Terraform exactly
            "app.kubernetes.io/name": projectName,
            "app.kubernetes.io/environment": environment,
        },
    },
});

// Pattern for resource labels that should be updated
const terraformToPulumiLabels = {
    "app.kubernetes.io/managed-by": "pulumi", // Always change terraform → pulumi
    "pulumi.com/stack": pulumi.getStack(),    // Add Pulumi-specific labels
    // Preserve all other labels from Terraform
};
```

**Common Label Conversions**:
- `managed-by: terraform` → `managed-by: pulumi`
- Add stack information: `pulumi.com/stack: ${pulumi.getStack()}`
- Preserve application and environment labels exactly
- Keep all business logic labels unchanged


### 3. Provider Configuration
**IMPORTANT**: Always explicitly configure providers when they are defined in Terraform.

```typescript
// Terraform provider block
provider "aws" {
  region = "us-west-2"
}

// Option 1: Pass provider to each resource (explicit but repetitive)
const provider = new aws.Provider("aws", {
    region: "us-west-2",
});

const vpc = new aws.ec2.Vpc("main", {
    cidrBlock: "10.0.0.0/16",
}, { provider });

// Option 2: Use mergeOptions pattern (DRY, recommended for components)
class MyComponent extends pulumi.ComponentResource {
    constructor(name: string, args: MyArgs, opts?: pulumi.ComponentResourceOptions) {
        super("custom:component:MyComponent", name, {}, opts);
        
        // This pattern reduces repetition and properly handles option inheritance
        const defaultResourceOptions: pulumi.ResourceOptions = pulumi.mergeOptions(
            { parent: this },
            opts || {}
        );
        
        const vpc = new aws.ec2.Vpc(`${name}-vpc`, {
            cidrBlock: args.cidrBlock,
        }, defaultResourceOptions);
        
        const subnet = new aws.ec2.Subnet(`${name}-subnet`, {
            vpcId: vpc.id,
            cidrBlock: "10.0.1.0/24",
        }, defaultResourceOptions); // Same options for all resources
    }
}
```

### 4. Configuration Management
```typescript
// For variables with defaults
const config = new pulumi.Config();
const instanceType = config.get("instanceType") || "t3.micro";
const environment = config.require("environment"); // Required variables
const enableMonitoring = config.getBoolean("enableMonitoring") ?? false;
const instanceCount = config.getNumber("instanceCount") || 1;

// For secret objects (returns Output<{[key: string]: string}>)
// Note: Add type annotation to avoid indexing errors with empty default
const apiKeys = config.getSecretObject("apiKeys") || {} as Record<string, string>;

// CRITICAL: Safe Configuration Access with Null Checking
// Accessing secret object values inside resource creation
// Option 1: Use pulumi.all() with proper null checking
environments.forEach(env => {
    const secret = new k8s.core.v1.Secret(`${env}-app-secrets`, {
        metadata: { name: "app-secrets" },
        stringData: pulumi.all([apiKeys]).apply(([keys]) => {
            // Safe access with fallback - prevents runtime errors
            const envApiKey = (keys as Record<string, string>)?.[env] || "";
            return {
                api_key: envApiKey,  // Safe access pattern
                // other secret data...
            };
        }),
    });
});

// Option 2: Safe transformation with error handling
const processedSecrets = pulumi.all([apiKeys]).apply(([keys]) => 
    environments.reduce((acc, env) => {
        // Always provide fallback values to prevent runtime errors
        acc[env] = (keys as Record<string, string>)?.[env] || "";
        return acc;
    }, {} as Record<string, string>)
);

// Option 3: Type-safe configuration access
interface DatabaseConfig {
    host: string;
    port: number;
    name: string;
    username: string;
    storageSize: string;
}

const databaseConfigs = config.getObject<Record<string, DatabaseConfig>>("databaseConfigs");
// Safe access in apply functions
stringData: pulumi.all([databaseConfigs]).apply(([configs]) => {
    const dbConfig = configs?.[env];
    if (!dbConfig) {
        throw new Error(`Database config for environment '${env}' not found`);
    }
    return {
        db_username: dbConfig.username,
        // ...
    };
});
```

### 5. Resource Mapping Examples

#### Basic Resource
**Terraform:**
```hcl
resource "aws_instance" "web" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = var.instance_type
  
  tags = {
    Name = "web-${var.environment}"
  }
}
```

**Pulumi TypeScript:**
```typescript
const web = new aws.ec2.Instance("web", {
    ami: ubuntu.then(ami => ami.id),
    instanceType: instanceType,
    tags: {
        Name: pulumi.interpolate`web-${environment}`,
    },
});
```

#### Resource Naming Best Practices
When converting Terraform resources with generic names like "this" or "main", use more descriptive names in Pulumi:

**Terraform:**
```hcl
resource "aws_vpc" "this" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_internet_gateway" "this" {
  count = var.create_igw ? 1 : 0
  vpc_id = aws_vpc.this.id
}
```

**Pulumi TypeScript - Preferred:**
```typescript
// Use descriptive names instead of "this"
const vpc = new aws.ec2.Vpc(`${name}`, {
    cidrBlock: "10.0.0.0/16",
});

// For resources with count, use descriptive suffixes instead of index
if (createIgw) {
    const internetGateway = new aws.ec2.InternetGateway(`${name}-igw`, {
        vpcId: vpc.id,
    });
}
```

**Note**: While preserving exact Terraform resource names can aid in state migration, using descriptive names improves code readability. For resources named "this" in Terraform, omit it in Pulumi or replace with a descriptive suffix.

**Additional Examples:**
```typescript
// Terraform: aws_route_table.this[0]
const publicRouteTable = new aws.ec2.RouteTable(`${name}-public-rt`, {
    vpcId: vpc.id,
});

// Terraform: aws_route.this[0] 
const publicRoute = new aws.ec2.Route(`${name}-public-route`, {
    routeTableId: publicRouteTable.id,
    destinationCidrBlock: "0.0.0.0/0",
    gatewayId: internetGateway.id,
});

// Terraform: aws_subnet.public[count.index]
const publicSubnet = new aws.ec2.Subnet(`${name}-public-${index}`, {
    vpcId: vpc.id,
    cidrBlock: cidr,
});
```

#### Data Sources
**Terraform:**
```hcl
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]
  
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-*"]
  }
}
```

**Pulumi TypeScript:**
```typescript
const ubuntu = aws.ec2.getAmi({
    mostRecent: true,
    owners: ["099720109477"],
    filters: [{
        name: "name",
        values: ["ubuntu/images/hvm-ssd/ubuntu-*"],
    }],
});
```

### 6. Dependent Resource Creation

**CRITICAL**: Always create ALL resources that exist in the Terraform configuration, including dependent resources:

```typescript
// Terraform creates both namespace and resources that use it
resource "kubernetes_namespace" "argocd" {
  metadata {
    name = "argocd"
  }
}

resource "kubernetes_manifest" "argocd_app" {
  # ... uses argocd namespace
}

// Pulumi MUST create both resources
const argoCdNamespace = new k8s.core.v1.Namespace("argocd", {
    metadata: {
        name: "argocd",
        // ... labels from Terraform
    },
}, { provider: kubernetesProvider });

// Then create dependent resources
const argoCdApp = new k8s.apiextensions.CustomResource("argocd-app", {
    // ... depends on argoCdNamespace
}, { provider: kubernetesProvider, dependsOn: [argoCdNamespace] });
```

**Common Mistakes to Avoid**:
- Skipping "obvious" resources like namespaces
- Relying on implicit creation (e.g., Helm chart side effects)
- Missing prerequisite resources that other resources depend on

### 7. Loops and Conditionals

#### Count Pattern
**Terraform:**
```hcl
resource "aws_instance" "web" {
  count = var.instance_count
  # ...
}
```

**Pulumi TypeScript:**
```typescript
const webInstances: aws.ec2.Instance[] = [];
for (let i = 0; i < instanceCount; i++) {
    webInstances.push(new aws.ec2.Instance(`web-${i}`, {
        // ...
    }));
}
```

#### For Each Pattern
**Terraform:**
```hcl
resource "aws_instance" "web" {
  for_each = var.instances
  
  instance_type = each.value.type
  ami          = each.value.ami
}
```

**Pulumi TypeScript:**
```typescript
interface InstanceConfig {
    type: string;
    ami: string;
}

const instances: Record<string, InstanceConfig> = config.requireObject("instances");

const webInstances: Record<string, aws.ec2.Instance> = {};
for (const [name, instance] of Object.entries(instances)) {
    webInstances[name] = new aws.ec2.Instance(`web-${name}`, {
        instanceType: instance.type,
        ami: instance.ami,
    });
}
```

### 9. Output Handling

#### String Interpolation
```typescript
// Use pulumi.interpolate for Output types
const bucketName = pulumi.interpolate`${project}-${environment}-data`;

// Use apply for transformations
const upperName = instance.id.apply(id => id.toUpperCase());
```

#### Complex Output Operations
```typescript
// Combining multiple outputs
const connectionString = pulumi.all([db.endpoint, db.port]).apply(([endpoint, port]) => 
    `postgresql://user@${endpoint}:${port}/mydb`
);

// Conditional outputs
export const loadBalancerUrl = createLoadBalancer 
    ? pulumi.interpolate`http://${loadBalancer.dnsName}` 
    : undefined;
```

#### Handling Outputs in Resource Properties
When resource properties require plain values but you have Outputs:

```typescript
// Pattern 1: Use apply() for properties that accept Input<T>
const instance = new aws.ec2.Instance("web", {
    userData: pulumi.all([dbEndpoint, apiKey]).apply(([endpoint, key]) => 
        Buffer.from(`
            #!/bin/bash
            echo "DB_ENDPOINT=${endpoint}" >> /etc/environment
            echo "API_KEY=${key}" >> /etc/environment
        `).toString("base64")
    ),
});

// Pattern 2: For properties requiring object literals with Output values
const secret = new k8s.core.v1.Secret("app-secrets", {
    metadata: {
        name: "app-secrets",
    },
    // When stringData needs to use Output values
    stringData: pulumi.all([dbPassword, apiKeys, dbUsername]).apply(
        ([password, keys, username]) => ({
            db_password: password,
            db_username: username,
            api_key: keys["production"] || "",  // Accessing nested values
        })
    ),
});

// Pattern 3: Handling Output<Record> types from config.getSecretObject()
const secretConfig = config.getSecretObject("secrets");  // Returns Output<{[key: string]: string}>

const processedSecrets = new k8s.core.v1.Secret("processed-secrets", {
    metadata: { name: "processed-secrets" },
    stringData: pulumi.all([secretConfig]).apply(([secrets]) => {
        // Now secrets is a plain object, not an Output
        return {
            api_key: secrets["apiKey"] || "",
            db_password: secrets["dbPassword"] || "",
            // Access any key safely
        };
    }),
});

// Pattern 4: Conditional property assignment with Outputs
const deployment = new k8s.apps.v1.Deployment("app", {
    spec: {
        template: {
            spec: {
                containers: [{
                    name: "app",
                    env: pulumi.all([enableFeatureFlag, apiEndpoint]).apply(
                        ([enabled, endpoint]) => {
                            const envVars = [
                                { name: "API_ENDPOINT", value: endpoint },
                            ];
                            
                            if (enabled) {
                                envVars.push({ name: "FEATURE_ENABLED", value: "true" });
                            }
                            
                            return envVars;
                        }
                    ),
                }],
            },
        },
    },
});
```

### 10. Secret and Sensitive Data Handling

**CRITICAL**: Use proper Pulumi patterns for secret handling:

```typescript
// ❌ AVOID: Manual base64 encoding (harder to maintain)
const secret = new k8s.core.v1.Secret("app-secrets", {
    data: {
        username: Buffer.from("admin").toString("base64"),
        password: Buffer.from(password).toString("base64"),
    },
    type: "Opaque",
});

// ✅ PREFERRED: Use stringData (automatic encoding)
const secret = new k8s.core.v1.Secret("app-secrets", {
    stringData: {
        username: "admin",
        password: password, // Pulumi handles encoding automatically
    },
    type: "Opaque",
});

// ✅ BEST: Use stringData with Output handling
const secret = new k8s.core.v1.Secret("app-secrets", {
    stringData: pulumi.all([dbPassword, apiKey]).apply(([password, key]) => ({
        db_password: password,
        api_key: key,
    })),
    type: "Opaque",
});
```

**Secret Access Patterns**:
```typescript
// Safe secret object access
const apiKeys = config.getSecretObject("apiKeys") || {};

// In resource creation
stringData: pulumi.all([apiKeys]).apply(([keys]) => {
    const safeKeys = keys as Record<string, string>;
    return {
        api_key: safeKeys?.[environment] || "", // Safe with fallback
        // other secret data...
    };
}),
```

### 10. TypeScript Best Practices

1. **Use const assertions for immutable configs:**
```typescript
const tags = {
    Environment: environment,
    Project: "MyApp",
} as const;
```

2. **Define reusable types:**
```typescript
type Tags = {[key: string]: pulumi.Input<string>};

interface BaseResourceArgs {
    tags?: Tags;
}
```

3. **Use async/await for complex logic:**
```typescript
const ami = await aws.ec2.getAmi({...}).promise();
```

4. **Leverage optional chaining:**
```typescript
const subnetId = vpc.publicSubnets?.[0]?.id;
```

5. **Use nullish coalescing:**
```typescript
const port = config.getNumber("port") ?? 3000;
```

### 11. Type Declarations for Input Types

When declaring interface properties for maps/records, use the appropriate Input type pattern:

```typescript
// For simple map inputs (preferred for readability)
interface ComponentArgs {
    tags?: pulumi.Input<{[key: string]: pulumi.Input<string>}>;
    labels?: pulumi.Input<{[key: string]: pulumi.Input<string>}>;
}

// For nested Input types (when values need to be Inputs)
interface ComponentArgs {
    vpcTags?: pulumi.Input<{[key: string]: pulumi.Input<string>}>;
    metadata?: pulumi.Input<{[key: string]: pulumi.Input<any>}>;
}

// Both patterns are valid TypeScript, choose based on your needs:
// - Use {[key: string]: T} for simple, flat structures and when values themselves are Inputs
```

### 12. Resource Option Merging with mergeOptions

When working with resource options in Pulumi components, use `pulumi.mergeOptions()` instead of the spread operator. This ensures proper handling of provider inheritance, dependencies, and other complex option merging scenarios.

#### Why Use mergeOptions?

**Spread Operator Limitations:**
```typescript
// ❌ AVOID: Spread operator doesn't properly handle all option types
const defaultResourceOptions = {
    parent: this,
    ...opts  // May not properly merge providers, dependencies, etc.
};
```

**mergeOptions Benefits:**
```typescript
// ✅ PREFERRED: mergeOptions handles all option types correctly
const defaultResourceOptions = pulumi.mergeOptions(
    { parent: this },
    opts || {}
);
```

The `mergeOptions` function:
- Properly merges provider configurations
- Handles dependency arrays correctly
- Preserves transformations and aliases
- Manages protect and ignoreChanges flags
- Handles all ResourceOptions properties safely

#### Common Patterns

**Basic Component Pattern:**
```typescript
export class MyComponent extends pulumi.ComponentResource {
    constructor(name: string, args: MyArgs, opts?: pulumi.ComponentResourceOptions) {
        super("custom:component:MyComponent", name, {}, opts);
        
        // Merge component options with defaults
        const defaultResourceOptions = pulumi.mergeOptions(
            { parent: this },
            opts || {}
        );
        
        // All child resources use the merged options
        const resource = new aws.ec2.Instance(`${name}-instance`, {
            // properties...
        }, defaultResourceOptions);
    }
}
```

**With Additional Options:**
```typescript
// Adding specific options for a resource
const dbOptions = pulumi.mergeOptions(
    defaultResourceOptions,
    { 
        protect: true,  // Additional protection for database
        deleteBeforeReplace: false
    }
);

const database = new aws.rds.Instance(`${name}-db`, {
    // properties...
}, dbOptions);
```

**Conditional Options:**
```typescript
// Merging options conditionally
const resourceOptions = pulumi.mergeOptions(
    { parent: this },
    opts || {},
    args.enableProtection ? { protect: true } : {},
    args.customProvider ? { provider: args.customProvider } : {}
);
```

### 13. Tag Merging and Type-Safe Object Spreading

When converting Terraform's `merge()` function for tags, ensure type safety with proper null checks:

#### Basic Tag Merging Pattern
**Terraform:**
```hcl
tags = merge(
  {
    "Name" = "my-resource"
  },
  var.additional_tags
)
```

**Pulumi TypeScript - Type-Safe Pattern:**
```typescript
// For simple objects
tags: {
    Name: "my-resource",
    ...(additionalTags || {}),
}

// Inside pulumi.all() for Input types
tags: pulumi.all([additionalTags]).apply(([tags]) => ({
    Name: "my-resource",
    ...(tags || {}),  // Ensure tags is not undefined
}))
```

#### Complex Tag Merging with Multiple Sources
```typescript
// Multiple tag sources with proper null handling
tags: pulumi.all([baseTags, environmentTags, customTags]).apply(
    ([base, env, custom]) => ({
        Name: "my-resource",
        ...(base || {}),
        ...(env || {}),
        ...(custom || {}),
    })
)
```

#### Type-Safe Pattern for Optional Inputs
```typescript
interface ResourceArgs {
    tags?: pulumi.Input<{[key: string]: pulumi.Input<string>}>;
}

// In the resource creation
const tags = args?.tags ?? {};  // Default to empty object

new aws.ec2.Instance("instance", {
    // Other properties...
    tags: pulumi.all([tags]).apply(([t]) => ({
        Name: "my-instance",
        ...(t || {}),  // Safe spread even if t is undefined
    })),
});
```

### 14. Error Handling
```typescript
// Add validation
if (!environment) {
    throw new Error("Environment must be specified");
}

// Use type guards
function isProductionEnvironment(env: string): env is "production" {
    return env === "production";
}
```

### 15. Exports
**CRITICAL**: Always convert ALL Terraform outputs to Pulumi exports. Missing exports can break downstream dependencies.

```typescript
// Terraform output
output "instance_id" {
  value = aws_instance.web.id
}

output "public_ip" {
  value = aws_instance.web.public_ip
  description = "The public IP of the web server"
}

// MUST convert to Pulumi exports:
export const instanceId = web.id;
export const publicIp = web.publicIp;

// For complex outputs:
export const outputs = {
    vpcId: vpc.id,
    publicSubnetIds: publicSubnets.map(s => s.id),
    databaseEndpoint: database.endpoint,
};
```

### 16. Documentation and Comments
**Important**: Preserve the intent and structure of the original Terraform configuration through comments and file organization.

**File Organization - Match Terraform Structure:**
1. **Maintain filename parity** for easier diffing:
   - `main.tf` → `main.ts`
   - `networking.tf` → `networking.ts`
   - `database.tf` → `database.ts`
   - `monitoring.tf` → `monitoring.ts`
   - etc.
2. **Consolidate in index.ts**:
   - `variables.tf` → Configuration section in `index.ts`
   - `outputs.tf` → Export section in `index.ts`
   - `versions.tf`/`providers.tf` → Provider setup in `index.ts`
3. **Import all files into index.ts** to maintain single entry point

Example structure:
```
terraform/
├── main.tf
├── networking.tf
├── database.tf
├── variables.tf
└── outputs.tf

converted_infrastructure/
├── index.ts        # Entry point: configs, providers, imports, exports
├── main.ts         # Resources from main.tf
├── networking.ts   # Resources from networking.tf
├── database.ts     # Resources from database.tf
└── package.json
```

**File Organization Best Practices:**
1. Each `.ts` file should export its resources/functions
2. Keep the main `index.ts` clean and focused on orchestration
3. Group related resources in the same file as they were in Terraform

```typescript
// File: VpcComponent.ts
/**
 * VPC Component that replicates the terraform-aws-modules/vpc module
 * 
 * This component creates:
 * - VPC with configurable CIDR block
 * - Public subnets across multiple AZs
 * - Internet Gateway (optional)
 * - Route tables and associations
 */
export class VpcComponent extends pulumi.ComponentResource {
    // Component implementation
}

// File: index.ts
import { VpcComponent } from "./VpcComponent";

// Create VPC - equivalent to Terraform module "vpc" block
const vpc = new VpcComponent("vpc", {
    cidrBlock: "10.0.0.0/16",
    azs: ["us-west-2a", "us-west-2b"],
});

// Export all module outputs
export const vpcId = vpc.vpcId;
export const publicSubnetIds = vpc.publicSubnetIds;
```

Example of matching file structure:

```typescript
// File: networking.ts
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// Export function to create networking resources
export function createNetworking(name: string, args: NetworkingArgs, provider?: aws.Provider) {
    // Create VPC
    const vpc = new aws.ec2.Vpc(`${name}-vpc`, {
        cidrBlock: args.vpcCidr,
        enableDnsHostnames: true,
        tags: args.tags,
    }, { provider });

    // Create subnets
    const publicSubnets = args.publicSubnetCidrs.map((cidr, index) => 
        new aws.ec2.Subnet(`${name}-public-${index}`, {
            vpcId: vpc.id,
            cidrBlock: cidr,
            availabilityZone: args.azs[index],
            mapPublicIpOnLaunch: true,
            tags: { ...args.tags, Name: `${name}-public-${index}` },
        }, { provider })
    );

    return { vpc, publicSubnets };
}

// File: index.ts
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { createNetworking } from "./networking";
import { createDatabase } from "./database";
import { createInstances } from "./main";

// Configuration (from variables.tf)
const config = new pulumi.Config();
const vpcCidr = config.get("vpcCidr") || "10.0.0.0/16";
const environment = config.require("environment");

// Provider setup (from providers.tf)
const awsProvider = new aws.Provider("aws", {
    region: config.get("awsRegion") || "us-west-2",
});

// Create resources
const networking = createNetworking("app", {
    vpcCidr,
    publicSubnetCidrs: ["10.0.1.0/24", "10.0.2.0/24"],
    azs: aws.getAvailabilityZones().then(azs => azs.names),
    tags: { Environment: environment },
}, awsProvider);

// Outputs (from outputs.tf)
export const vpcId = networking.vpc.id;
export const publicSubnetIds = networking.publicSubnets.map(s => s.id);
```

For inline resources, add descriptive comments:
```typescript
// Create VPC
const vpc = new aws.ec2.Vpc("main", {
    cidrBlock: "10.0.0.0/16",
    tags: {
        Name: "main-vpc",
    },
}, { provider });

// Create public subnet
const publicSubnet = new aws.ec2.Subnet("public", {
    vpcId: vpc.id,
    cidrBlock: "10.0.1.0/24",
    availabilityZone: "us-west-2a",
    tags: {
        Name: "public-subnet",
    },
}, { provider });
```

## Common Patterns Reference

- Local values → `const` variables
- Terraform functions → TypeScript/Pulumi equivalents:
  - `concat()` → `[...array1, ...array2]` or `array1.concat(array2)`
  - `merge()` → `{...obj1, ...obj2}`
  - `lookup()` → `obj[key] ?? defaultValue`
  - `length()` → `array.length`
  - `element()` → `array[index]`
  - `join()` → `array.join(separator)`
  - `split()` → `string.split(separator)`
  
## Project Setup and Compilation Verification

After generating the TypeScript code, set up a proper Pulumi project structure and verify compilation. Make sure the project folder contains package.json, tsconfig.json, and Pulumi.yaml files.

### Dependency Management
Analyze the imports in the generated code and create appropriate package.json:

**Step 1: Identify required packages from imports**
```typescript
import * as pulumi from "@pulumi/pulumi";      // Requires: @pulumi/pulumi
import * as aws from "@pulumi/aws";            // Requires: @pulumi/aws
import * as awsx from "@pulumi/awsx";          // Requires: @pulumi/awsx
// etc.
```

**Step 2: Generate package.json with discovered dependencies**
```json
{
  "name": "tf-to-pulumi-conversion",
  "version": "1.0.0",
  "main": "index.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^18",
    "typescript": "^5.0"
  },
  "dependencies": {
    "@pulumi/pulumi": "^3.0.0",
    "@pulumi/aws": "^6.0.0"  // Add ALL packages found in imports
  }
}
```

**Step 3: Install dependencies**
```bash
npm install
```

### Enhanced Compilation Verification

#### Multi-Stage Compilation Testing
```bash
# Stage 1: Syntax and type checking
npm install
npx tsc --noEmit

```

### 5. Common Compilation Issues and Fixes

#### Type Errors
```typescript
// Issue: Output type not handled correctly
❌ const name = resource.name + "-suffix";
✅ const name = resource.name.apply(n => `${n}-suffix`);

// Issue: Missing type annotations
❌ const config = new pulumi.Config();
❌ const value = config.get("key");
✅ const config = new pulumi.Config();
✅ const value: string = config.get("key") || "default";

// Issue: Incorrect Input/Output usage
❌ function createResource(name: string): Resource
✅ function createResource(name: pulumi.Input<string>): Resource
```

#### Import Issues
```typescript
// Issue: Missing provider imports based on usage
❌ import * as pulumi from "@pulumi/pulumi";
❌ // Using azure.resources.ResourceGroup but no import

✅ import * as pulumi from "@pulumi/pulumi";
✅ import * as azure from "@pulumi/azure-native";
✅ import * as azuread from "@pulumi/azuread";  // If using Azure AD
✅ import * as random from "@pulumi/random";   // If using random resources
```

#### Property Name Issues
```typescript
// Issue: Snake case from Terraform not converted
❌ new azure.storage.StorageAccount("storage", {
❌     account_tier: "Standard",                    // Should be accountTier
❌     account_replication_type: "LRS",             // Should be accountReplicationType
❌ });

✅ new azure.storage.StorageAccount("storage", {
✅     accountTier: "Standard",
✅     accountReplicationType: "LRS",
✅ });
```

#### Component Interface Issues
```typescript
// Issue: Missing required properties in interfaces
❌ export interface ComponentArgs {
❌     name?: string;  // Optional when should be required
❌ }

✅ export interface ComponentArgs {
✅     namingPrefix: pulumi.Input<string>;          // Required
✅     commonTags: {[key: string]: pulumi.Input<string>}; // Required
✅     resourceGroups: {                            // Required structure
✅         main: azure.resources.ResourceGroup;
✅     };
✅     optionalFeature?: boolean;                   // Truly optional
✅ }
```